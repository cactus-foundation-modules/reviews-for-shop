'use client'

import { useEffect, useState } from 'react'
import { ReviewsPanel } from '@/modules/reviews-for-shop/components/public/ReviewsPanel'
import { REVIEWS_CSS } from '@/modules/reviews-for-shop/components/public/reviews-css'
import { slugFromLocation } from '@/modules/reviews-for-shop/lib/product-slug'
import type { RvwProductPayload } from '@/modules/reviews-for-shop/lib/types'

// The Reviews BLOCK, for an owner who would rather place reviews on the Product
// Detail layout themselves than have the Reviews tab do it.
//
// It works the product out from the URL and fetches, because a block contributed
// by another module is never handed shop's product context (see lib/product-slug).
// That also means it draws nothing on the Puck canvas, where the URL is an admin
// page: the placeholder below is what an author sees while building the layout.
export function ReviewsIsland({ heading }: { heading?: string }) {
  const [payload, setPayload] = useState<RvwProductPayload | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'nothing'>('loading')

  useEffect(() => {
    let live = true
    void (async () => {
      // Inside the async body rather than in the effect itself, so every setState
      // here happens off the render pass that scheduled it.
      const slug = slugFromLocation()
      if (!slug) {
        setState('nothing')
        return
      }
      try {
        const res = await fetch(`/api/m/reviews-for-shop/public/reviews?productSlug=${encodeURIComponent(slug)}`)
        if (!live) return
        if (!res.ok) {
          setState('nothing')
          return
        }
        const data = (await res.json()) as RvwProductPayload
        if (!live) return
        setPayload(data)
        setState('ready')
      } catch {
        if (live) setState('nothing')
      }
    })()
    return () => {
      live = false
    }
  }, [])

  if (state === 'ready' && payload) return <ReviewsPanel payload={payload} heading={heading} />

  // Loading and "could not work out which product" look the same on purpose: a
  // block that quietly occupies no space beats one that flashes an error at a
  // shopper about a page the shop owner is still building.
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REVIEWS_CSS }} />
      <div className="rvw-wrap" id="reviews">
        {heading && <h2 className="rvw-heading">{heading}</h2>}
        <p className="rvw-empty">{state === 'loading' ? 'Loading reviews…' : 'Reviews appear here on a product page.'}</p>
      </div>
    </>
  )
}
