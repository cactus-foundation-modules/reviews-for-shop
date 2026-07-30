// Editor (client) half of the "Rating summary" block: the star line and the
// review count, meant for under a product's title or beside its price. Draws
// nothing on a product with no reviews, and nothing on the Puck canvas, where
// there is no product to be about.
import { RatingSummaryIsland } from '@/modules/reviews-for-shop/components/public/RatingSummaryIsland'

export type ShopProductRatingSummaryProps = { linkToReviews?: string }

export function ShopProductRatingSummary(props: ShopProductRatingSummaryProps) {
  return <RatingSummaryIsland linkToReviews={props.linkToReviews !== 'no'} />
}

export const shopProductRatingSummaryPuckComponent = {
  label: 'Product: Rating summary',
  fields: {
    // A select of yes/no rather than a checkbox, matching every other module block
    // in the editor. The link is an in-page jump to #reviews, which the Reviews tab
    // and the Reviews block both answer to.
    linkToReviews: {
      type: 'select' as const,
      label: 'Link the count to the reviews',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
  },
  defaultProps: { linkToReviews: 'yes' } as ShopProductRatingSummaryProps,
  render: ShopProductRatingSummary,
}
