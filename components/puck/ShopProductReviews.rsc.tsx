// RSC (server) half of the "Product reviews" block. It carries no server data
// itself - shop hands its product context only to its own detail parts, so the
// client island resolves the product from the URL and fetches - which is why this
// simply mounts the same island the editor half does.
//
// The Reviews TAB is the server-rendered route to the same thing: shop hands a tab
// provider the product id while the page renders, so reviews placed that way are in
// the first HTML. Worth knowing if search engines reading the reviews matters more
// than placing them exactly where you want them.
import { ReviewsIsland } from '@/modules/reviews-for-shop/components/public/ReviewsIsland'
import {
  shopProductReviewsPuckComponent,
  type ShopProductReviewsProps,
} from '@/modules/reviews-for-shop/components/puck/ShopProductReviews'

export function ShopProductReviewsRsc(props: ShopProductReviewsProps) {
  return <ReviewsIsland heading={props.heading} />
}

export const shopProductReviewsPuckRscComponent = {
  ...shopProductReviewsPuckComponent,
  render: ShopProductReviewsRsc,
}
