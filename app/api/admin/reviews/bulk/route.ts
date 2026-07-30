// POST /api/m/reviews-for-shop/admin/reviews/bulk
// Publishing forty held reviews one button at a time is how moderation stops
// happening, so the queue can act on a selection.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { requireReviewsUser } from '@/modules/reviews-for-shop/lib/access'
import { deleteReviews, setReviewStatus } from '@/modules/reviews-for-shop/lib/db/reviews'

const Body = z.object({
  // Bounded so one request cannot be asked to rewrite the whole table.
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(['publish', 'hold', 'reject', 'delete']),
})

export async function POST(request: NextRequest) {
  const gate = await requireReviewsUser('reviews.manage')
  if (gate.error) return gate.error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Invalid request', 400)
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse('That change could not be saved.', 400)
  const { ids, action } = parsed.data

  const changed =
    action === 'delete'
      ? await deleteReviews(ids)
      : await setReviewStatus(ids, action === 'publish' ? 'PUBLISHED' : action === 'hold' ? 'PENDING' : 'REJECTED')

  return NextResponse.json({ ok: true, changed })
}
