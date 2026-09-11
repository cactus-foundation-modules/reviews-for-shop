// Fills shop's `shop.product-rating-summary` point: how many published reviews
// each product has and what they average.
//
// A summary, not the reviews themselves. The existing `shop.product-reviews`
// point hands back the whole published list a page at a time, which is the right
// shape for a feed exporting every review and the wrong one for a product page
// that wants a single line of markup: working out one product's average from it
// would mean reading every review on the shop, on every render.
//
// The shape is vendor-neutral and names no consumer, the same bargain the
// published-reviews provider makes. Nothing personal travels - a count, a mean,
// and the top of the scale so a reader can state it rather than assume it.
import { getProductSummary } from '@/modules/reviews-for-shop/lib/db/reviews'

/** One product's star line, as anything outside this module sees it. */
export type ProductRatingSummary = {
  count: number
  average: number
  /** The best score available. Five today; a shop rating out of ten later says
   *  so here rather than leaving every reader to guess. */
  ratingMax: number
}

/** The top of this module's rating scale - the table's own CHECK constraint. */
const RATING_MAX = 5

/**
 * Summaries for the products asked about, keyed by product id.
 *
 * A product with no published reviews is ABSENT from the map rather than present
 * with a count of nought: a rating nobody gave is not a rating, and a consumer
 * publishing one as structured data is publishing a star rating out of thin air.
 */
export async function reviewsProductRatingSummary(
  productIds: string[],
): Promise<Record<string, ProductRatingSummary>> {
  const out: Record<string, ProductRatingSummary> = {}
  const ids = [...new Set(productIds)].filter(Boolean)
  if (ids.length === 0) return out

  // One query per product. The only caller today asks about one - the product
  // page it is rendering - and a batched version of getProductSummary would be a
  // second way of counting the same rows, which is the kind of pair that agrees
  // until one of them is edited.
  const summaries = await Promise.all(ids.map(async (id) => [id, await getProductSummary(id)] as const))
  for (const [id, summary] of summaries) {
    if (summary.count <= 0) continue
    out[id] = { count: summary.count, average: summary.average, ratingMax: RATING_MAX }
  }
  return out
}

/** The registered name on the extension point. */
export const reviewsProductRatingSummaryProvider = reviewsProductRatingSummary
