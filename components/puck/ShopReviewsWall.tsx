// Editor (client) half of the "Reviews wall" block: the shop's latest published
// reviews, across every product, for a home page or an About page. Not tied to a
// product, so unlike this module's other two blocks it can go on any page.
//
// Fetches on the canvas so an author sees the real reviews while placing it; the
// .rsc half loads the same reviews server-side. Both render ReviewsWall, so the
// markup is identical either way.
import { ReviewsWallIsland } from '@/modules/reviews-for-shop/components/public/ReviewsWallIsland'

export type ShopReviewsWallProps = {
  heading?: string
  limit?: number
  minRating?: string
}

// Shared by both halves so the editor and the server agree on what "empty" means.
// A wall is a shop's shop window: three or four reviews is a fair sample, thirty is
// a page nobody scrolls.
export const WALL_DEFAULT_LIMIT = 6

export function normaliseWallProps(props: ShopReviewsWallProps): { limit: number; minRating: number } {
  const limit = Math.min(Math.max(Math.round(props.limit ?? WALL_DEFAULT_LIMIT), 1), 48)
  const parsed = Number(props.minRating ?? '4')
  const minRating = Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 1), 5) : 4
  return { limit, minRating }
}

export function ShopReviewsWall(props: ShopReviewsWallProps) {
  const { limit, minRating } = normaliseWallProps(props)
  return <ReviewsWallIsland heading={props.heading} limit={limit} minRating={minRating} />
}

export const shopReviewsWallPuckComponent = {
  label: 'Shop: Reviews wall',
  fields: {
    heading: { type: 'text' as const, label: 'Heading (leave empty for none)' },
    limit: { type: 'number' as const, label: 'How many reviews' },
    minRating: {
      type: 'select' as const,
      label: 'Only show reviews of at least',
      options: [
        { value: '5', label: '5 stars' },
        { value: '4', label: '4 stars' },
        { value: '3', label: '3 stars' },
        { value: '1', label: 'Any rating' },
      ],
    },
  },
  defaultProps: {
    heading: 'What our customers say',
    limit: WALL_DEFAULT_LIMIT,
    minRating: '4',
  } as ShopReviewsWallProps,
  render: ShopReviewsWall,
}
