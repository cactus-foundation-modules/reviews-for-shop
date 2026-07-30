import { ReviewsWallList } from '@/modules/reviews-for-shop/components/public/ReviewsView'
import { REVIEWS_CSS } from '@/modules/reviews-for-shop/components/public/reviews-css'
import type { RvwWallReview } from '@/modules/reviews-for-shop/lib/types'

// The site-wide wall of published reviews, given the reviews to draw.
//
// No 'use client' and no fetching of its own, which is what lets the storefront
// render it on the server (reviews in the first HTML, where they are worth
// something to a search engine) while the Puck editor's client half renders the
// very same component after a fetch. Same component, same classes, same markup on
// the canvas and on the page.
export function ReviewsWall({ heading, reviews }: { heading?: string; reviews: RvwWallReview[] }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REVIEWS_CSS }} />
      <div className="rvw-wrap">
        {heading && <h2 className="rvw-heading">{heading}</h2>}
        <ReviewsWallList reviews={reviews} />
      </div>
    </>
  )
}
