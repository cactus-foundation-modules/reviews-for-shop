// GET /api/m/reviews-for-shop/admin/reviews/export
// The whole catalogue with its reviews attached, one row per review and one row
// per product nobody has reviewed. Needs reviews.access rather than any of shop's
// own keys for the same reason the queue does: the file carries every reviewer's
// email address.
import { NextResponse } from 'next/server'
import { requireReviewsUser } from '@/modules/reviews-for-shop/lib/access'
import { buildReviewsCsv } from '@/modules/reviews-for-shop/lib/csv'
import { buildReviewCsvRows } from '@/modules/reviews-for-shop/lib/csv-rows'
import { listReviewsForExport } from '@/modules/reviews-for-shop/lib/db/reviews'

export async function GET() {
  const gate = await requireReviewsUser('reviews.access', { allowAccess: true })
  if (gate.error) return gate.error

  const csv = buildReviewsCsv(buildReviewCsvRows(await listReviewsForExport()))
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="product-reviews.csv"',
    },
  })
}
