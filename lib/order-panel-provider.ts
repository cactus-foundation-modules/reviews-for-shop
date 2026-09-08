import { OrderReviewsPanel } from '@/modules/reviews-for-shop/components/public/OrderReviewsPanel'
import { getSettings } from '@/modules/reviews-for-shop/lib/db/settings'
import type { RvwOrderPanelPayload } from '@/modules/reviews-for-shop/lib/types'
import type { ShopMemberOrderContext, ShopMemberOrderPanelProvider } from '@/modules/shop/lib/member-order-panels'

// This module's answer to shop's `shop.member-order-panels` point: one card on a
// customer's own order page holding a rating for every product on that order.
//
// The nightly invitation email already asks, and will carry on asking. This is the
// other half of the same job: somebody who has come back to look at the order -
// far and away the likeliest moment they are thinking about what they bought - can
// rate the lot in one place without going to a product page each, and without
// waiting for an email that may have gone to a spam folder.
//
// Only on a COMPLETED order. Not "paid", which says nothing about whether the
// thing has arrived, and not "shipped", which says it has left rather than landed.
// A customer asked to review a desk that is still on a lorry is being asked to
// review the wait.

// Between the receipt above it and the parcels and paperwork below.
const PANEL_ORDER = 40

export const reviewsOrderPanelProvider: ShopMemberOrderPanelProvider = {
  title: 'Review what you bought',

  order: PANEL_ORDER,

  /**
   * Returns null - so no card appears at all - whenever there is nothing to ask:
   * an order that is not finished, a shop that has limited reviews to account
   * holders being read by a guest, or an order whose every product has already
   * been reviewed by this address.
   *
   * Guests are otherwise offered the card in full. Somebody who has proved the
   * delivery postcode on their own order has proved rather more about having
   * bought the thing than a signed-in account holder has - see shop's
   * lib/order-viewer.ts, which is the only thing that decides they may be here.
   */
  load: async (context: ShopMemberOrderContext): Promise<RvwOrderPanelPayload | null> => {
    if (context.status !== 'COMPLETED') return null

    const settings = await getSettings()
    // A members-only shop and a guest: no card rather than a card that refuses.
    // The same rule is enforced again by the route behind the form.
    if (settings.whoCanReview === 'MEMBERS' && !context.signedIn) return null

    // Dynamic on purpose. This file is statically imported by the generated
    // public extension-point registry, and orderReviewables reaches shop's
    // product-page-resolver, which reads that same registry - a cycle that
    // Turbopack can fail a production build on ("Cannot access 'x' before
    // initialization") while every local check stays green. Reaching it from
    // inside the function breaks the edge. See scripts/check-import-cycles.mjs.
    const { orderReviewables } = await import('@/modules/reviews-for-shop/lib/order-reviewables')

    const { pending, reviewed } = await orderReviewables(
      context.orderId,
      context.viewerEmail,
      settings.onePerProductPerEmail,
    )
    if (pending.length === 0) return null

    return {
      orderId: context.orderId,
      products: pending.map((page) => ({ id: page.id, name: page.name })),
      // Only worth saying on a shop that withholds the ones already done. Where
      // it does not, every product is offered again and "already reviewed" would
      // be describing something the card is not doing.
      alreadyReviewed: settings.onePerProductPerEmail ? reviewed.length : 0,
      rules: {
        whoCanReview: settings.whoCanReview,
        askForTitle: settings.askForTitle,
        minCommentLength: settings.minCommentLength,
      },
    }
  },

  Panel: OrderReviewsPanel,
}
