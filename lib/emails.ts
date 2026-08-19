import { resolveBranding } from '@/lib/config/branding'
import { getSiteUrlOrNull, isEmailConfigured } from '@/lib/config/env'
import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/render'
import { productHref } from '@/modules/shop/lib/product-url'
import { getProductUrlStyle } from '@/modules/reviews-for-shop/lib/product-url-style'

// Both emails this module sends. The wording, the on/off switch and the design
// wrapped around them live with every other email on the site, in core's
// Settings > Emails; this file only works out the merge values and posts the
// result. Defaults are in lib/email-templates.ts.

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

  const rendered = await renderEmailTemplate('reviews-for-shop.new-review', {
    siteName: branding.name,
    productName: params.productName,
    stars: stars(params.rating),
    rating: String(params.rating),
    authorName: params.authorName,
    reviewTitle: params.title ?? '',
    hasTitle: params.title ? 'true' : 'false',
    // Escaped here, then handed over as a rawTag: the line breaks a shopper
    // typed have to survive as <br />, and there is no way to do that after
    // core has escaped the lot.
    reviewBody: escapeHtml(params.body).replace(/\n+/g, '<br />'),
    isPending: params.pending ? 'true' : 'false',
    isPublished: params.pending ? 'false' : 'true',
    pendingWord: params.pending ? 'waiting' : 'published',
    adminUrl: link ?? '',
    hasLink: link ? 'true' : 'false',
  })
  if (!rendered) return

  await sendEmail({ to: params.to, subject: rendered.subject, html: rendered.html, text: rendered.text })
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

  const urlStyle = await getProductUrlStyle()
  const items = params.products
    .map((product) => `<li><a href="${site}${productHref(product.slug, urlStyle)}#reviews">${escapeHtml(product.name)}</a></li>`)
    .join('\n')

  // The subject is worked out here rather than in the template: it changes shape
  // with the number of products, and a one-or-many rule is more than {{#if}} can
  // carry. An owner rewriting it replaces the whole line, which is the honest
  // way round.
  const rendered = await renderEmailTemplate('reviews-for-shop.review-invite', {
    siteName: branding.name,
    firstName,
    orderNumber: params.orderNumber,
    productList: items,
    thisOrThese: one ? 'this' : 'these',
    itOrThey: one ? 'it has' : 'they have',
    inviteSubject: one
      ? `How did you get on with your ${params.products[0]!.name}?`
      : `How did you get on with your order from ${branding.name}?`,
  })
  if (!rendered) return false

  await sendEmail({ to: params.to, subject: rendered.subject, html: rendered.html, text: rendered.text })
  return true
}
