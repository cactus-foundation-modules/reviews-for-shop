// Editor (client) half of the "Product reviews" block: the summary, the reviews
// and the write-a-review form, for an owner who would rather place them on the
// Product Detail layout by hand than leave it to the Reviews tab.
//
// The island works the product out from the page's URL, so on the Puck canvas -
// where the URL is an admin page - it shows its placeholder line instead. The .rsc
// half mounts the same island, so canvas and storefront are the same component.
//
// Two of these on one page, or this alongside the Reviews tab, means the same
// reviews twice. Shop settings > Reviews has a "where reviews appear" choice for
// exactly that: set it to Nowhere when you are placing this block yourself.
import { ReviewsIsland } from '@/modules/reviews-for-shop/components/public/ReviewsIsland'

export type ShopProductReviewsProps = { heading?: string }

export function ShopProductReviews(props: ShopProductReviewsProps) {
  return <ReviewsIsland heading={props.heading} />
}

export const shopProductReviewsPuckComponent = {
  label: 'Product: Reviews',
  fields: {
    heading: { type: 'text' as const, label: 'Heading (leave empty for none)' },
  },
  defaultProps: { heading: 'Customer reviews' } as ShopProductReviewsProps,
  render: ShopProductReviews,
}
