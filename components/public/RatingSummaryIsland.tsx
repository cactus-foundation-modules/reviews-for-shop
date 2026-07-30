'use client'

import { useEffect, useState } from 'react'
import { ReviewStars } from '@/modules/reviews-for-shop/components/public/ReviewStars'
import { REVIEWS_CSS } from '@/modules/reviews-for-shop/components/public/reviews-css'
import { slugFromLocation } from '@/modules/reviews-for-shop/lib/product-slug'
import type { RvwSummary } from '@/modules/reviews-for-shop/lib/types'

// The one-line star rating, for dropping under a product's title or beside its
// price: four and a half words and a link down to the reviews themselves.
//
// Renders nothing at all on a product with no reviews. "No reviews yet" under the
// title of every product in a new shop is worse than silence, and an owner who
// wants to invite the first one has the form for that.
export function RatingSummaryIsland({ linkToReviews }: { linkToReviews?: boolean }) {
  const [summary, setSummary] = useState<RvwSummary | null>(null)

  useEffect(() => {
    const slug = slugFromLocation()
    if (!slug) return
    let live = true
    void (async () => {
      try {
        const res = await fetch(
          `/api/m/reviews-for-shop/public/reviews?productSlug=${encodeURIComponent(slug)}&summaryOnly=1`,
        )
        if (!res.ok || !live) return
        const data = (await res.json()) as { summary: RvwSummary }
        if (live) setSummary(data.summary)
      } catch {
        // A missing star line is not worth telling a shopper about.
      }
    })()
    return () => {
      live = false
    }
  }, [])

  if (!summary || summary.count === 0) return null

  const count = `${summary.count} review${summary.count === 1 ? '' : 's'}`

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REVIEWS_CSS }} />
      <span className="rvw-inline">
        <ReviewStars rating={summary.average} label={`Rated ${summary.average} out of 5`} />
        <span>
          {summary.average.toFixed(1)} · {linkToReviews ? <a href="#reviews">{count}</a> : count}
        </span>
      </span>
    </>
  )
}
