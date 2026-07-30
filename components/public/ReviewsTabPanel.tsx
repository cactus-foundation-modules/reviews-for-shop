'use client'

import { ReviewsPanel } from '@/modules/reviews-for-shop/components/public/ReviewsPanel'
import type { RvwProductPayload } from '@/modules/reviews-for-shop/lib/types'

// What shop's tab strip renders inside its own panel. Shop treats a contributed
// tab's payload as opaque (`unknown`), so this is where it becomes a shape again.
//
// No heading: the tab is already labelled Reviews, and a second "Customer reviews"
// underneath it would be the module talking to itself.
export function ReviewsTabPanel({ payload }: { payload: unknown }) {
  return <ReviewsPanel payload={payload as RvwProductPayload} />
}
