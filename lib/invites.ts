import { findAlreadyReviewed, listInviteCandidates, recordInvite } from '@/modules/reviews-for-shop/lib/db/invites'
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
    return { ran: false, orders: 0, products: 0, failed: 0, reason: 'invitations are turned off' }
  }

  const delayDays = Math.max(0, Math.round(settings.inviteDelayDays))
  const candidates = await listInviteCandidates(delayDays, MAX_ORDERS_PER_RUN)
  if (candidates.length === 0) return { ran: true, orders: 0, products: 0, failed: 0 }

  // Shared across the whole run: orders repeat products, and a shop with options
  // resolves each hidden child through a page-resolver call.
  const resolved = new Map<string, ReviewableProduct | null>()

  let orders = 0
  let products = 0
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

      const written = await findAlreadyReviewed(candidate.email, Array.from(pages.keys()))
      const ask = Array.from(pages.values()).filter((page) => !written.has(page.id))
      if (ask.length === 0) continue

      const sent = await sendReviewInvite({
        to: candidate.email,
        customerName: candidate.customerName,
        orderNumber: candidate.orderNumber,
        products: ask.map((page) => ({ name: page.name, slug: page.slug })),
      })
      if (!sent) {
        // No email provider, or no SITE_URL: every order in this run would fail the
        // same way, so stop rather than count forty of them.
        return { ran: true, orders, products, failed, reason: 'email is not configured on this site' }
      }

      for (const page of ask) {
        await recordInvite(candidate.orderId, page.id, candidate.email)
        products += 1
      }
      orders += 1
    } catch (error) {
      failed += 1
      console.error(`[reviews-for-shop] review invitation for order ${candidate.orderNumber} failed:`, error)
    }
  }

  return { ran: true, orders, products, failed }
}
