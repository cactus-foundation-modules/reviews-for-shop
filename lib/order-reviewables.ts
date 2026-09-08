import { getOrderItems } from '@/modules/shop/lib/db/orders'
import { findAlreadyReviewed } from '@/modules/reviews-for-shop/lib/db/invites'
import { resolveReviewableProduct, type ReviewableProduct } from '@/modules/reviews-for-shop/lib/reviewable-product'

// Which of an order's products this person may still review, and which they have
// already had their say on.
//
// Shared by the two halves that must never disagree: the card on the order page,
// which draws a form per product, and the route behind those forms, which decides
// whether the product it has been handed was on the order at all. Written twice,
// the route would eventually accept a product the card would not have offered.
//
// The resolution matters as much as the filter. An order line records the product
// row that was bought, and on a shop with options that is a catalogue-hidden child
// backing one variant. Reviews belong on the page, which is the parent - so every
// line is put back through shop's page-resolver seam first (see
// lib/reviewable-product.ts). Skip that and a shop with variations offers nothing
// on any order it has ever taken.

export type OrderReviewables = {
  /** Pages still waiting for a review, deduplicated, in the order the lines run. */
  pending: ReviewableProduct[]
  /** Pages this address has already reviewed. Counted, not offered. */
  reviewed: ReviewableProduct[]
}

/**
 * @param orderId  the order being looked at
 * @param email    the address a review from this person would be filed under
 * @param excludeReviewed  whether an already-reviewed page is withheld. False on
 *   a shop that allows more than one review per product per address, where there
 *   is nothing to withhold - the setting is `onePerProductPerEmail`.
 */
export async function orderReviewables(
  orderId: string,
  email: string,
  excludeReviewed: boolean,
): Promise<OrderReviewables> {
  const items = await getOrderItems(orderId)

  // Deduplicated by page and not by line: an order with the same desk on it twice,
  // or with three variants of it, is one thing to have an opinion about.
  const seen = new Map<string, ReviewableProduct | null>()
  const pages = new Map<string, ReviewableProduct>()
  for (const item of items) {
    if (!item.productId) continue
    const page = await resolveReviewableProduct(item.productId, seen)
    if (page) pages.set(page.id, page)
  }
  if (pages.size === 0) return { pending: [], reviewed: [] }

  const written = await findAlreadyReviewed(email, Array.from(pages.keys()))
  const all = Array.from(pages.values())
  const reviewed = all.filter((page) => written.has(page.id))
  // On a shop that allows more than one review per address, an already-reviewed
  // product is offered again like any other - the setting says so.
  const pending = excludeReviewed ? all.filter((page) => !written.has(page.id)) : all
  return { pending, reviewed }
}
