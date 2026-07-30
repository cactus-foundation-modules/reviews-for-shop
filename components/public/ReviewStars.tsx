// The star row, drawn from the number rather than from a picture per score, so
// the figure printed beside it and the stars themselves can never disagree.
//
// No 'use client' of its own: it holds no state and no handlers, so it renders on
// the server inside the RSC halves and is pulled into the client bundle by the
// islands that import it. One component either way.

// One star. Exported because the rating picker draws its own five, one per radio,
// and would otherwise need a star of its own that could drift from this one.
//
// Half stars are deliberately not drawn. A rating of 4.6 shows as five stars with
// "4.6" printed next to it, which is honest and legible; a half star is neither.
export function ReviewStar({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`rvw-star ${filled ? 'rvw-star-on' : 'rvw-star-off'}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9z" />
    </svg>
  )
}

export type ReviewStarsProps = {
  rating: number
  // Read out by a screen reader in place of the stars. Given a sentence rather
  // than a number so the reading is "4.6 out of 5" and not "4.6".
  label?: string
}

export function ReviewStars({ rating, label }: ReviewStarsProps) {
  const rounded = Math.round(rating)
  return (
    <span className="rvw-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <ReviewStar key={n} filled={n <= rounded} />
      ))}
      <span className="rvw-sr">{label ?? `${rating} out of 5`}</span>
    </span>
  )
}
