// GET/POST /api/m/reviews-for-shop/public/reviews
//
// The storefront's only route. GET answers three questions depending on its query:
// a product's whole review surface (the block's first load and its "show more"),
// just the star line (the rating summary block), or the shop's latest reviews (the
// wall). POST takes a review.
//
// Every response is built from the same helpers the server-rendered Reviews tab
// uses, so a shopper cannot be shown one thing by the tab and another by the block.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminPathCached } from '@/lib/config/site'
import { getMemberFromCookie } from '@/lib/members/session'
import { errorResponse } from '@/lib/utils'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { createReview, getProductSummary, hasReviewFromEmail, listLatestPublished } from '@/modules/reviews-for-shop/lib/db/reviews'
import { findProductById, findProductBySlug } from '@/modules/reviews-for-shop/lib/db/products'
import { getSettings } from '@/modules/reviews-for-shop/lib/db/settings'
import { sendNewReviewNotice } from '@/modules/reviews-for-shop/lib/emails'
import { buildProductPayload } from '@/modules/reviews-for-shop/lib/product-payload'
import { findVerifiedOrderId } from '@/modules/reviews-for-shop/lib/verified-purchase'

// Five submissions an hour from one address. A secondary guard behind the
// validation and the one-per-product rule, in the same shape shop's own public
// routes use it: per-instance and reset by a cold start, which is the accepted
// tradeoff for a last line of defence rather than the first.
const SUBMIT_MAX_PER_WINDOW = 5
const SUBMIT_WINDOW_MS = 60 * 60 * 1000

const WALL_MAX = 48

export async function GET(request: NextRequest) {
  // A closed shop is closed everywhere, this route included.
  const closed = await shopClosedResponse()
  if (closed) return closed

  const params = request.nextUrl.searchParams
  const settings = await getSettings()

  // The wall: latest published reviews across the shop, for the Reviews wall block
  // (its editor half; the storefront half reads the same rows server-side).
  if (params.get('latest')) {
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 6) || 6, 1), WALL_MAX)
    const minRating = Math.min(Math.max(Number(params.get('minRating') ?? 4) || 4, 1), 5)
    const reviews = await listLatestPublished({ limit, minRating, showVerified: settings.showVerifiedBadge })
    return NextResponse.json({ reviews })
  }

  const productId = params.get('productId')
  const productSlug = params.get('productSlug')
  if (!productId && !productSlug) return errorResponse('A product is required', 400)

  const product = productId ? await findProductById(productId) : await findProductBySlug(productSlug!)
  // Same answer for "no such product" and "a product nobody can see": a public
  // route should not be a way of finding out which drafts exist.
  if (!product || !product.publiclyVisible) return errorResponse('Product not found', 404)

  // The rating summary block wants the star line and nothing else, so it is not
  // made to carry a page of reviews it will not draw.
  if (params.get('summaryOnly')) {
    return NextResponse.json({ summary: await getProductSummary(product.id) })
  }

  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  return NextResponse.json(await buildProductPayload(product.id, settings, { offset }))
}

const Body = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(4000),
})

export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`rvw:${ip}`, SUBMIT_MAX_PER_WINDOW, SUBMIT_WINDOW_MS)) {
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

  const product = await findProductById(input.productId)
  if (!product || !product.publiclyVisible) return errorResponse('Product not found', 404)

  const settings = await getSettings()
  const member = await getMemberFromCookie()

  // Who may review. Enforced here and not only in the form: the form explains the
  // rule, this decides it.
  if (settings.whoCanReview === 'MEMBERS' && !member) {
    return errorResponse('Please sign in to leave a review.', 403)
  }

  // A signed-in member reviews under the account's own address, whatever the form
  // posted - otherwise the one-per-product rule is a formality and the name on the
  // review is anyone's guess.
  const email = member ? member.email : input.email
  const name = member ? member.displayName || member.username : input.name

  if (settings.minCommentLength > 0 && input.body.length < settings.minCommentLength) {
    return errorResponse(`Please write at least ${settings.minCommentLength} characters.`, 400)
  }

  const verifiedOrderId = await findVerifiedOrderId(product.id, email)
  if (settings.whoCanReview === 'VERIFIED_BUYERS' && !verifiedOrderId) {
    return errorResponse(
      'Reviews here are limited to customers. Please use the email address you ordered with.',
      403,
    )
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
    verifiedPurchase: !!verifiedOrderId,
    orderId: verifiedOrderId,
    submittedIp: ip === 'unknown' ? null : ip,
  })

  // The owner's notice is a courtesy, not part of saving the review: a mail
  // provider having a bad afternoon must not turn a shopper's review into an error
  // they are asked to write again.
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
