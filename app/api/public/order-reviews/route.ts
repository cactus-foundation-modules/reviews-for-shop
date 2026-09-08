// POST /api/m/reviews-for-shop/public/order-reviews
//
// A review written from the card on a customer's own order page, rather than from
// the form on a product page.
//
// A route of its own and not a flag on the other one, because the identity works
// the opposite way round. The product-page form asks who you are and takes your
// word for it; this one is only reachable from an order the reader has already
// proved is theirs, so it asks nothing and takes the name and address off the
// order. That means it may never accept a name or an email in its body - a route
// that filed a review under whatever address was posted to it, and stamped it
// "verified purchase" on the strength of an order id, would be a way of putting
// words in a customer's mouth.
//
// The proof is shop's own: resolveOrderViewer is the single rule that decides
// whether anybody may look at an order at all (signed in as its owner, or having
// proved the delivery postcode in this browser). Behind this route it is the same
// rule again, because the page having rendered the form is not evidence of
// anything - the browser could have posted here directly.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminPathCached } from '@/lib/config/site'
import { errorResponse } from '@/lib/utils'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { resolveOrderViewer } from '@/modules/shop/lib/order-viewer'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { createReview, hasReviewFromEmail } from '@/modules/reviews-for-shop/lib/db/reviews'
import { getSettings } from '@/modules/reviews-for-shop/lib/db/settings'
import { sendNewReviewNotice } from '@/modules/reviews-for-shop/lib/emails'
import { orderReviewables } from '@/modules/reviews-for-shop/lib/order-reviewables'

// One order can hold a good many products and each is a separate submission, so
// the ceiling is higher than the product page's five - but it is still a ceiling.
const SUBMIT_MAX_PER_WINDOW = 30
const SUBMIT_WINDOW_MS = 60 * 60 * 1000

const Body = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(4000),
})

export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`rvw:order:${ip}`, SUBMIT_MAX_PER_WINDOW, SUBMIT_WINDOW_MS)) {
    return errorResponse('That is a lot of reviews in one go. Please try again later.', 429)
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Invalid request', 400)
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse('Please check the form and try again.', 400)
  const input = parsed.data

  const order = await getOrderById(input.orderId)
  // Same answer for "no such order" and "not yours": a public route should not be
  // a way of finding out which order ids exist.
  if (!order) return errorResponse('Order not found', 404)

  const viewer = await resolveOrderViewer(order)
  if (!viewer) return errorResponse('Order not found', 404)

  // The same gate the card draws itself behind: an order still on its way is not
  // one anybody can have an opinion about yet.
  if (order.status !== 'COMPLETED') {
    return errorResponse('You can review these once the order is complete.', 409)
  }

  const settings = await getSettings()
  if (settings.whoCanReview === 'MEMBERS' && viewer.kind !== 'member') {
    return errorResponse('Reviews here are written by account holders. Please sign in and try again.', 403)
  }

  // Who the review is by. A member is their account; a guest is the order. Never
  // anything the request body said, which is why it may not say one.
  const member = viewer.kind === 'member' ? viewer.member : null
  const email = member ? member.email : order.customerEmail
  const name = member ? member.displayName || member.username : order.customerName

  // Was this actually on the order? Asked with the already-reviewed filter off, so
  // the answer is "on the order" rather than "on the order and still outstanding" -
  // the one-per-product rule below is a separate question with its own message.
  const { pending } = await orderReviewables(order.id, email, false)
  const product = pending.find((page) => page.id === input.productId)
  if (!product) return errorResponse('That is not something on this order.', 400)

  if (settings.minCommentLength > 0 && input.body.length < settings.minCommentLength) {
    return errorResponse(`Please write at least ${settings.minCommentLength} characters.`, 400)
  }

  if (settings.onePerProductPerEmail && (await hasReviewFromEmail(product.id, email))) {
    return errorResponse('You have already reviewed this one. Thank you again.', 409)
  }

  const status = settings.autoPublish ? 'PUBLISHED' : 'PENDING'
  await createReview({
    productId: product.id,
    memberId: member?.id ?? null,
    authorName: name,
    authorEmail: email,
    rating: input.rating,
    title: settings.askForTitle && input.title ? input.title : null,
    body: input.body,
    status,
    // Not a guess and not a lookup: the review was written on the order that
    // bought it, by somebody who had to prove that before the page would load.
    verifiedPurchase: true,
    orderId: order.id,
    submittedIp: ip === 'unknown' ? null : ip,
  })

  // The owner's notice is a courtesy, not part of saving the review: a mail
  // provider having a bad afternoon must not turn a customer's review into an
  // error they are asked to write again.
  if (settings.notifyEmail.trim()) {
    try {
      await sendNewReviewNotice({
        to: settings.notifyEmail.trim(),
        productName: product.name,
        productSlug: product.slug,
        authorName: name,
        rating: input.rating,
        title: input.title ?? null,
        body: input.body,
        pending: status === 'PENDING',
        adminPath: await getAdminPathCached(),
      })
    } catch (error) {
      console.error('[reviews-for-shop] new-review notification failed:', error)
    }
  }

  return NextResponse.json({
    ok: true,
    status,
    message: status === 'PUBLISHED' ? settings.thanksPublished : settings.thanksPending,
  })
}
