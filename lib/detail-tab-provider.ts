import { ReviewsTabPanel } from '@/modules/reviews-for-shop/components/public/ReviewsTabPanel'
import { buildProductPayload } from '@/modules/reviews-for-shop/lib/product-payload'
import { getSettings } from '@/modules/reviews-for-shop/lib/db/settings'
import type { ShopDetailTabProvider } from '@/modules/shop/lib/detail-tabs'

// This module's answer to shop's `shop.product-detail-tabs` point: a Reviews tab
// in the product page's own tab strip, beside Description and Specification.
//
// The tab rather than a block by default, for two reasons. It is where a shopper
// already looks for other people's opinion of a thing, and - the technical half -
// shop hands a tab provider the product id while the page renders, so the reviews
// are in the first HTML. A block contributed by another module gets no product
// context at all and has to fetch (see components/public/ReviewsIsland), which
// leaves the reviews out of the page a search engine reads.
//
// An owner who would rather place the block by hand sets Shop settings > Reviews >
// "where reviews appear" to Nowhere, and this provider stands down.
export const reviewsTabProvider: ShopDetailTabProvider = {
  label: 'Reviews',

  // After shop's own Description (10), Specification (20), Dimensions (30) and
  // Downloads (40), and after product-downloads' contributed tab (45). What other
  // people made of it comes once the product has answered for itself.
  order: 60,

  /**
   * Resolved while the product page renders.
   *
   * Returns null - so no tab appears at all - only when the owner has turned the
   * surface off. A product with no reviews yet keeps its tab, because the tab is
   * also the only place a shopper can leave the first one, and an empty Reviews tab
   * that invites one beats no way in.
   *
   * Reads no cookies, deliberately: a session read here would make every product
   * page on the shop dynamic. Whether the visitor is signed in is settled by the
   * form itself, from the browser (see RvwViewer).
   */
  load: async (productId: string) => {
    const settings = await getSettings()
    if (settings.productSurface !== 'TAB') return null
    return buildProductPayload(productId, settings, { offset: 0 })
  },

  Panel: ReviewsTabPanel,
}
