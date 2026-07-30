'use client'

import { useEffect, useState } from 'react'
import { ReviewsWall } from '@/modules/reviews-for-shop/components/public/ReviewsWall'
import type { RvwWallReview } from '@/modules/reviews-for-shop/lib/types'

// The editor's half of the wall. It asks the public route for the same reviews the
// server half renders, so an author building a page sees the shop's real reviews on
// the canvas rather than a mock-up of them - and, since both halves end up in
// ReviewsWall, the canvas and the published page draw identical markup.
export function ReviewsWallIsland({
  heading,
  limit,
  minRating,
}: {
  heading?: string
  limit: number
  minRating: number
}) {
  const [reviews, setReviews] = useState<RvwWallReview[]>([])

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const params = new URLSearchParams({ latest: '1', limit: String(limit), minRating: String(minRating) })
        const res = await fetch(`/api/m/reviews-for-shop/public/reviews?${params.toString()}`)
        if (!res.ok || !live) return
        const data = (await res.json()) as { reviews: RvwWallReview[] }
        if (live) setReviews(data.reviews ?? [])
      } catch {
        // Leaves the empty state on the canvas, which is honest enough.
      }
    })()
    return () => {
      live = false
    }
  }, [limit, minRating])

  return <ReviewsWall heading={heading} reviews={reviews} />
}
