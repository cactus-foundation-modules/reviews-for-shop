import {
  hasReviewedOrder,
  listInviteCandidates,
  recordInviteOutcome,
} from '@/modules/reviews-for-shop/lib/db/invites'
import { getSettings } from '@/modules/reviews-for-shop/lib/db/settings'
import { sendReviewInvite } from '@/modules/reviews-for-shop/lib/emails'
import { resolveReviewableProduct, type ReviewableProduct } from '@/modules/reviews-for-shop/lib/reviewable-product'

// How many orders one nightly run will write to. A ceiling rather than a target:
// the first run on a shop with years of history would otherwise email everyone who
// ever bought anything on the same evening, which is how a sending domain earns
// itself a reputation. The rest go out tomorrow.
const MAX_ORDERS_PER_RUN = 40

export type InviteRunResult = {
  ran: boolean
  orders: number
  products: number
  // Orders looked at and deliberately left alone, because the customer had already
  // reviewed something they bought on it.
  skipped: number
  failed: number
  reason?: string
}

/**
 * The nightly invitation run. Reads the settings itself so the cron route stays a
 * thin bit of authentication, and does nothing at all unless the owner has turned
 * invitations on.
 *
 * An invitation is only marked as sent once the send itself succeeded, so a provider
 * outage means tomorrow tries again rather than a customer never being asked. The
 * failure is counted and returned, which is what the cron logs.
 */
export async function runReviewInvites(): Promise<InviteRunResult> {
  const settings = await getSettings()
  if (!settings.invitesEnabled) {
    return { ran: false, orders: 0, products: 0, skipped: 0, failed: 0, reason: 'invitations are turned off' }
  }

  const delayDays = Math.max(0, Math.round(settings.inviteDelayDays))
  const candidates = await listInviteCandidates(delayDays, MAX_ORDERS_PER_RUN)
  if (candidates.length === 0) return { ran: true, orders: 0, products: 0, skipped: 0, failed: 0 }

  // Shared across the whole run: orders repeat products, and a shop with options
  // resolves each hidden child through a page-resolver call.
  const resolved = new Map<string, ReviewableProduct | null>()

  let orders = 0
  let products = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    try {
      // What each purchased line is actually a review of. Deduplicated by page, so
      // three variants of one desk ask about the desk once.
      const pages = new Map<string, ReviewableProduct>()
      for (const purchasedId of candidate.purchasedProductIds) {
        const page = await resolveReviewableProduct(purchasedId, resolved)
        if (page) pages.set(page.id, page)
      }
      if (pages.size === 0) continue

      // One review off this order is enough. Somebody who has already written about
      // something they bought here has done the thing the email would be asking for,
      // and being chased anyway reads as a shop that was not paying attention - so
      // the whole email goes, not just the line about the product they reviewed.
      const alreadyReviewed = await hasReviewedOrder({
        orderId: candidate.orderId,
        email: candidate.email,
        productIds: Array.from(pages.keys()),
      })
      if (alreadyReviewed) {
        // Written down rather than simply skipped, or this order comes back as a
        // candidate tomorrow night and every night after it.
        for (const page of pages.values()) {
          await recordInviteOutcome(candidate.orderId, page.id, candidate.email, 'already reviewed')
        }
        skipped += 1
        continue
      }

      const ask = Array.from(pages.values())

      const sent = await sendReviewInvite({
        to: candidate.email,
        customerName: candidate.customerName,
        orderId: candidate.orderId,
        orderNumber: candidate.orderNumber,
        orderStatus: candidate.status,
        products: ask.map((page) => ({ name: page.name, slug: page.slug })),
      })
      if (!sent) {
        // No email provider, or no SITE_URL: every order in this run would fail the
        // same way, so stop rather than count forty of them.
        return { ran: true, orders, products, skipped, failed, reason: 'email is not configured on this site' }
      }

      for (const page of ask) {
        await recordInviteOutcome(candidate.orderId, page.id, candidate.email, null)
        products += 1
      }
      orders += 1
    } catch (error) {
      failed += 1
      console.error(`[reviews-for-shop] review invitation for order ${candidate.orderNumber} failed:`, error)
    }
  }

  return { ran: true, orders, products, skipped, failed }
}
