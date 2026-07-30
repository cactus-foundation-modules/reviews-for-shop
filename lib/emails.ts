import { resolveBranding } from '@/lib/config/branding'
import { getSiteUrlOrNull, isEmailConfigured } from '@/lib/config/env'
import { sendEmail } from '@/lib/email/index'
import { productHref } from '@/modules/reviews-for-shop/lib/db/reviews'

// Both emails this module sends. Plain HTML built here rather than through shop's
// shp_email_templates: those are the order lifecycle's templates, editable by the
// owner and logged against an order, and neither of these is about an order's
// progress. Nothing here is worth a schema of its own yet.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stars(rating: number): string {
  return `${'★'.repeat(rating)}${'☆'.repeat(Math.max(0, 5 - rating))}`
}

/**
 * Tells the owner a review has landed. Only ever called with an address the owner
 * typed into the settings, and never for a shop that has left it blank.
 *
 * Every failure is swallowed by the caller: a review that saved is saved, and a
 * notification that could not go out must not turn the shopper's submission into
 * an error they are asked to retry.
 */
export async function sendNewReviewNotice(params: {
  to: string
  productName: string
  productSlug: string
  authorName: string
  rating: number
  title: string | null
  body: string
  pending: boolean
  adminPath: string | null
}): Promise<void> {
  if (!isEmailConfigured()) return
  const branding = await resolveBranding()
  const site = getSiteUrlOrNull()
  const link = site && params.adminPath ? `${site}${params.adminPath}/m/reviews-for-shop/reviews` : null

  const subject = params.pending
    ? `New review waiting: ${params.productName}`
    : `New review published: ${params.productName}`

  const lines = [
    `<p><strong>${escapeHtml(params.productName)}</strong> has a new review.</p>`,
    `<p>${stars(params.rating)} (${params.rating} out of 5) from ${escapeHtml(params.authorName)}</p>`,
    params.title ? `<p><strong>${escapeHtml(params.title)}</strong></p>` : '',
    `<blockquote>${escapeHtml(params.body).replace(/\n+/g, '<br />')}</blockquote>`,
    params.pending
      ? '<p>It is waiting for you and is not on the site yet.</p>'
      : '<p>It is already on the product page.</p>',
    link ? `<p><a href="${link}">Open your reviews</a></p>` : '',
  ]

  const html = lines.filter(Boolean).join('\n')
  const text = [
    `${params.productName} has a new review.`,
    `${params.rating} out of 5 from ${params.authorName}`,
    params.title ?? '',
    params.body,
    params.pending ? 'It is waiting for you and is not on the site yet.' : 'It is already on the product page.',
    link ?? '',
  ]
    .filter(Boolean)
    .join('\n\n')

  await sendEmail({ to: params.to, subject: `${branding.name}: ${subject}`, html, text })
}

/**
 * Asks a past customer what they made of what they bought. One email per order,
 * however many products it held, because three emails about one delivery is how a
 * shop teaches its customers to filter it out.
 *
 * Returns false when the site has no email provider or no SITE_URL, since a review
 * invitation with no link in it is not worth sending. The caller uses that to stop
 * marking invitations as sent.
 */
export async function sendReviewInvite(params: {
  to: string
  customerName: string
  orderNumber: string
  products: Array<{ name: string; slug: string }>
}): Promise<boolean> {
  if (!isEmailConfigured()) return false
  const site = getSiteUrlOrNull()
  if (!site) return false

  const branding = await resolveBranding()
  const firstName = params.customerName.trim().split(/\s+/)[0] || 'there'
  const one = params.products.length === 1

  const items = params.products
    .map((product) => `<li><a href="${site}${productHref(product.slug)}#reviews">${escapeHtml(product.name)}</a></li>`)
    .join('\n')

  const html = [
    `<p>Hello ${escapeHtml(firstName)},</p>`,
    `<p>You ordered ${one ? 'this' : 'these'} from us a little while ago (order ${escapeHtml(params.orderNumber)}), and we would like to know how ${one ? 'it has' : 'they have'} got on:</p>`,
    `<ul>${items}</ul>`,
    '<p>A minute of your time and a couple of honest lines helps the next person decide. No obligation, and we would rather have the truth than the compliment.</p>',
    `<p>Thank you,<br />${escapeHtml(branding.name)}</p>`,
  ].join('\n')

  const text = [
    `Hello ${firstName},`,
    `You ordered ${one ? 'this' : 'these'} from us a little while ago (order ${params.orderNumber}), and we would like to know how ${one ? 'it has' : 'they have'} got on:`,
    ...params.products.map((product) => `${product.name}: ${site}${productHref(product.slug)}#reviews`),
    'A minute of your time and a couple of honest lines helps the next person decide.',
    `Thank you, ${branding.name}`,
  ].join('\n\n')

  await sendEmail({
    to: params.to,
    subject: one
      ? `How did you get on with your ${params.products[0]!.name}?`
      : `How did you get on with your order from ${branding.name}?`,
    html,
    text,
  })
  return true
}
