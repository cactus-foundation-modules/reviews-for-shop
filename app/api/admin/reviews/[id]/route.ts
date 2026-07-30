// PATCH/DELETE /api/m/reviews-for-shop/admin/reviews/[id]
// One review: publish it, hold it, turn it down, answer it, or bin it.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { requireReviewsUser } from '@/modules/reviews-for-shop/lib/access'
import { deleteReviews, getReview, setReviewReply, setReviewStatus } from '@/modules/reviews-for-shop/lib/db/reviews'

const Body = z.object({
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED']).optional(),
  // An empty string removes an existing reply, which is why this is not
  // .min(1) - an owner who has thought better of what they wrote needs a way out.
  reply: z.string().max(2000).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireReviewsUser('reviews.manage')
  if (gate.error) return gate.error

  const { id } = await params
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Invalid request', 400)
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse('That change could not be saved.', 400)

  const existing = await getReview(id)
  if (!existing) return errorResponse('Review not found', 404)

  if (parsed.data.status) await setReviewStatus([id], parsed.data.status)
  if (parsed.data.reply !== undefined) await setReviewReply(id, parsed.data.reply)

  return NextResponse.json({ review: await getReview(id) })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireReviewsUser('reviews.manage')
  if (gate.error) return gate.error

  const { id } = await params
  const deleted = await deleteReviews([id])
  if (deleted === 0) return errorResponse('Review not found', 404)
  return NextResponse.json({ ok: true })
}
