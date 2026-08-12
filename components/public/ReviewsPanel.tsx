'use client'

import { useCallback, useId, useState } from 'react'
import { ReviewForm } from '@/modules/reviews-for-shop/components/public/ReviewForm'
import { ReviewSummaryPanel, ReviewsList } from '@/modules/reviews-for-shop/components/public/ReviewsView'
import { REVIEWS_CSS } from '@/modules/reviews-for-shop/components/public/reviews-css'
import type { RvwProductPayload, RvwPublicReview } from '@/modules/reviews-for-shop/lib/types'

// The whole product-page review surface: the summary, the reviews, "show more",
// and the form.
//
// A client component because shop hands a contributed tab panel down through the
// RSC boundary as a prop and a server component cannot be passed that way (see
// shop's lib/detail-tabs.ts). The first page of reviews arrives as a prop, already
// loaded while the page rendered, so this is server-rendered into the first HTML
// and only reaches for the network when a shopper asks for more or writes one.

export function ReviewsPanel({ payload, heading }: { payload: RvwProductPayload; heading?: string }) {
  const [reviews, setReviews] = useState<RvwPublicReview[]>(payload.reviews)
  const [summary, setSummary] = useState(payload.summary)
  const [total, setTotal] = useState(payload.total)
  const [busy, setBusy] = useState(false)
  // The form is behind a button rather than sat open at the bottom of the page:
  // most people come to read reviews, not to write one, and a form the length of
  // this one pushed everything else up out of the way.
  const [formOpen, setFormOpen] = useState(false)
  // Once a review has gone in, the toggle goes away - the form is showing its own
  // thank-you and a "Cancel" beside it would only invite the shopper to hide it.
  const [sent, setSent] = useState(false)
  const formId = useId()

  const fetchPage = useCallback(
    async (offset: number): Promise<RvwProductPayload | null> => {
      const params = new URLSearchParams({
        productId: payload.productId,
        offset: String(offset),
      })
      try {
        const res = await fetch(`/api/m/reviews-for-shop/public/reviews?${params.toString()}`)
        if (!res.ok) return null
        return (await res.json()) as RvwProductPayload
      } catch {
        return null
      }
    },
    [payload.productId],
  )

  async function showMore() {
    setBusy(true)
    const next = await fetchPage(reviews.length)
    if (next) {
      setReviews((current) => [...current, ...next.reviews])
      setSummary(next.summary)
      setTotal(next.total)
    }
    setBusy(false)
  }

  // Called only when a review went straight up (an auto-publishing shop). The
  // whole first page is refetched rather than the new review being pushed onto the
  // end of the list, so it lands in the right place and the summary moves with it.
  const refresh = useCallback(async () => {
    const fresh = await fetchPage(0)
    if (!fresh) return
    setReviews(fresh.reviews)
    setSummary(fresh.summary)
    setTotal(fresh.total)
  }, [fetchPage])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REVIEWS_CSS }} />
      <div className="rvw-wrap" id="reviews">
        {/* One row for the heading and the write button. On a product page the
            heading belongs to shop's own section header rather than to this
            module, so the row holds only the button - and the CSS lifts it up
            onto that header's line, which is where it was asked for. */}
        <div className="rvw-top">
          {heading && <h2 className="rvw-heading">{heading}</h2>}
          {!sent && (
            <button
              className="rvw-write"
              type="button"
              aria-expanded={formOpen}
              aria-controls={formId}
              onClick={() => setFormOpen((open) => !open)}
            >
              {formOpen ? 'Cancel' : 'Write a review'}
            </button>
          )}
        </div>
        <ReviewSummaryPanel summary={summary} />
        <ReviewsList reviews={reviews} />
        {reviews.length < total && (
          <button className="rvw-more" type="button" onClick={showMore} disabled={busy}>
            {busy ? 'Loading…' : `Show more (${total - reviews.length} to go)`}
          </button>
        )}
        {formOpen && (
          <div id={formId}>
            <ReviewForm
              productId={payload.productId}
              rules={payload.rules}
              onPublished={refresh}
              onSent={() => setSent(true)}
            />
          </div>
        )}
      </div>
    </>
  )
}
