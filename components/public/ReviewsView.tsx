// The parts of the storefront that only draw: the summary panel, one review, and
// the list of them. No state, no handlers, no 'use client' - so the Reviews tab
// renders them on the server (in the page's first HTML, where a crawler and a
// shopper without JavaScript both find them) and the islands render the very same
// components after a fetch.
import { ReviewStars } from '@/modules/reviews-for-shop/components/public/ReviewStars'
import type { RvwPublicReview, RvwSummary, RvwWallReview } from '@/modules/reviews-for-shop/lib/types'

// en-GB fixed rather than the visitor's own locale: the server renders this too,
// and a date formatted one way on the server and another in the browser is a
// hydration mismatch. A British shop reading British dates is the intent anyway.
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function ReviewSummaryPanel({ summary }: { summary: RvwSummary }) {
  if (summary.count === 0) return null
  return (
    <div className="rvw-summary">
      <div className="rvw-score">
        <b>{summary.average.toFixed(1)}</b>
        <ReviewStars rating={summary.average} label={`Rated ${summary.average} out of 5`} />
        <small>
          {summary.count} review{summary.count === 1 ? '' : 's'}
        </small>
      </div>
      <div className="rvw-bars">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = summary.breakdown[star]
          // Percentages of the total, so the bars read as a share of the reviews
          // rather than as a race between the rows.
          const pct = summary.count === 0 ? 0 : Math.round((count / summary.count) * 100)
          return (
            <div className="rvw-bar" key={star}>
              <span className="rvw-bar-label">
                {star} star{star === 1 ? '' : 's'}
              </span>
              <span className="rvw-bar-track">
                <span className="rvw-bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="rvw-bar-count">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ReviewCard({ review, children }: { review: RvwPublicReview; children?: React.ReactNode }) {
  return (
    <li className="rvw-item">
      <div className="rvw-head">
        <ReviewStars rating={review.rating} label={`${review.rating} out of 5`} />
        <span className="rvw-who">{review.authorName}</span>
        {review.verified && <span className="rvw-badge">Verified purchase</span>}
        <span className="rvw-when">{formatDate(review.createdAt)}</span>
      </div>
      {review.title && <p className="rvw-title">{review.title}</p>}
      {/* Plain text, printed as text. Reviews are typed by strangers, so nothing
          here is ever rendered as markup - the line breaks come from CSS
          (white-space: pre-wrap) rather than from anything in the review. */}
      <p className="rvw-body">{review.body}</p>
      {review.replyBody && (
        <div className="rvw-reply">
          <b>Our reply</b>
          <p>{review.replyBody}</p>
        </div>
      )}
      {children}
    </li>
  )
}

export function ReviewsList({ reviews }: { reviews: RvwPublicReview[] }) {
  if (reviews.length === 0) {
    return <p className="rvw-empty">No reviews yet. If you have bought this, yours would be the first.</p>
  }
  return (
    <ul className="rvw-list">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </ul>
  )
}

// The site-wide wall. Same card, with the product it is about at the bottom - the
// one thing a review needs on a page that is not the product's own.
export function ReviewsWallList({ reviews }: { reviews: RvwWallReview[] }) {
  if (reviews.length === 0) return <p className="rvw-empty">No reviews to show yet.</p>
  return (
    <ul className="rvw-list rvw-wall">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review}>
          <a className="rvw-wall-product" href={review.productHref}>
            {review.productName}
          </a>
        </ReviewCard>
      ))}
    </ul>
  )
}
