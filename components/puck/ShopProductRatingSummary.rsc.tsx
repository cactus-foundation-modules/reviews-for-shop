// RSC (server) half of the "Rating summary" block. Mounts the same island as the
// editor half: the star line depends on which product page it is sitting on, and
// shop hands that context only to its own detail parts.
import { RatingSummaryIsland } from '@/modules/reviews-for-shop/components/public/RatingSummaryIsland'
import {
  shopProductRatingSummaryPuckComponent,
  type ShopProductRatingSummaryProps,
} from '@/modules/reviews-for-shop/components/puck/ShopProductRatingSummary'

export function ShopProductRatingSummaryRsc(props: ShopProductRatingSummaryProps) {
  return <RatingSummaryIsland linkToReviews={props.linkToReviews !== 'no'} />
}

export const shopProductRatingSummaryPuckRscComponent = {
  ...shopProductRatingSummaryPuckComponent,
  render: ShopProductRatingSummaryRsc,
}
