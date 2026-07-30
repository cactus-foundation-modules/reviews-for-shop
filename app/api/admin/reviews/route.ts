// GET /api/m/reviews-for-shop/admin/reviews
// The moderation queue: a filtered, paged list plus the counts the filter chips
// show. Reading a review means reading the reviewer's email address, which is why
// this needs reviews.access rather than any of shop's own keys.
import { NextRequest, NextResponse } from 'next/server'
import { countReviewsByStatus, listReviews } from '@/modules/reviews-for-shop/lib/db/reviews'
import { requireReviewsUser } from '@/modules/reviews-for-shop/lib/access'
import type { RvwStatus } from '@/modules/reviews-for-shop/lib/types'

const STATUSES: RvwStatus[] = ['PENDING', 'PUBLISHED', 'REJECTED']

export async function GET(request: NextRequest) {
  const gate = await requireReviewsUser('reviews.access', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const statusParam = params.get('status')
  const status = STATUSES.includes(statusParam as RvwStatus) ? (statusParam as RvwStatus) : null

  const { reviews, total } = await listReviews({
    status,
    search: params.get('search'),
    productId: params.get('productId'),
    page: Number(params.get('page') ?? 1) || 1,
    perPage: Number(params.get('perPage') ?? 25) || 25,
  })

  return NextResponse.json({ reviews, total, counts: await countReviewsByStatus() })
}
