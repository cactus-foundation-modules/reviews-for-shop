import {
  countPublishedForProduct,
  getProductSummary,
  listPublishedForProduct,
} from '@/modules/reviews-for-shop/lib/db/reviews'
import type { RvwProductPayload, RvwSettings } from '@/modules/reviews-for-shop/lib/types'

// One product's whole review surface in one payload, built the same way whether it
// is the Reviews tab loading it server-side or the public route answering the
// block's fetch. Shared so those two can never drift into showing different things
// on the same product.
export async function buildProductPayload(
  productId: string,
  settings: RvwSettings,
  opts: { offset: number },
): Promise<RvwProductPayload> {
  const perPage = Math.min(Math.max(Math.round(settings.reviewsPerPage), 1), 50)
  const [summary, reviews, total] = await Promise.all([
    getProductSummary(productId),
    listPublishedForProduct(productId, {
      limit: perPage,
      offset: Math.max(0, opts.offset),
      showVerified: settings.showVerifiedBadge,
    }),
    countPublishedForProduct(productId),
  ])

  return {
    productId,
    summary,
    reviews,
    total,
    perPage,
    showVerifiedBadge: settings.showVerifiedBadge,
    rules: {
      whoCanReview: settings.whoCanReview,
      askForTitle: settings.askForTitle,
      minCommentLength: settings.minCommentLength,
    },
  }
}
