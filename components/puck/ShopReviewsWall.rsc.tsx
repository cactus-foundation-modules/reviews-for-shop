// RSC (server) half of the "Reviews wall" block. Unlike this module's product
// blocks, this one needs nothing from the URL, so it reads the reviews while the
// page renders: they land in the first HTML, which is where a search engine and a
// visitor without JavaScript both find them.
import { ReviewsWall } from '@/modules/reviews-for-shop/components/public/ReviewsWall'
import {
  normaliseWallProps,
  shopReviewsWallPuckComponent,
  type ShopReviewsWallProps,
} from '@/modules/reviews-for-shop/components/puck/ShopReviewsWall'
import { listLatestPublished } from '@/modules/reviews-for-shop/lib/db/reviews'
import { getSettings } from '@/modules/reviews-for-shop/lib/db/settings'

export async function ShopReviewsWallRsc(props: ShopReviewsWallProps) {
  const { limit, minRating } = normaliseWallProps(props)

  // A wall that cannot read the reviews renders as an empty wall rather than
  // taking the page down with it: this block is decoration on somebody's home
  // page, and a 500 there costs more than a missing quote.
  //
  // The reading is wrapped, not the rendering: JSX inside a try/catch would not
  // actually catch a render error anyway, since React renders it later.
  let reviews: Awaited<ReturnType<typeof listLatestPublished>> = []
  try {
    const settings = await getSettings()
    reviews = await listLatestPublished({ limit, minRating, showVerified: settings.showVerifiedBadge })
  } catch (error) {
    console.error('[reviews-for-shop] reviews wall could not be loaded:', error)
  }

  return <ReviewsWall heading={props.heading} reviews={reviews} />
}

export const shopReviewsWallPuckRscComponent = {
  ...shopReviewsWallPuckComponent,
  render: ShopReviewsWallRsc,
}
