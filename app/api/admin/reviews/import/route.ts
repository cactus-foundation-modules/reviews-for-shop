// POST /api/m/reviews-for-shop/admin/reviews/import
// Takes the file the export produces (or one typed to match) and saves the
// reviews in it. Writing reviews in the shop's name is reviews.manage, not
// reviews.access.
import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { requireReviewsUser } from '@/modules/reviews-for-shop/lib/access'
import { RvwImportError, importReviewsCsv } from '@/modules/reviews-for-shop/lib/import'
import type { RvwStatus } from '@/modules/reviews-for-shop/lib/types'

export async function POST(request: NextRequest) {
  const gate = await requireReviewsUser('reviews.manage')
  if (gate.error) return gate.error

  let text: string
  let defaultStatus: RvwStatus = 'PUBLISHED'

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return errorResponse('No file was uploaded.', 400)
    text = await file.text()
    // Anything other than the one word means the other thing, so a missing field
    // cannot quietly publish a batch the owner meant to read first.
    if (form?.get('defaultStatus') === 'PENDING') defaultStatus = 'PENDING'
  } else {
    text = await request.text()
    if (request.nextUrl.searchParams.get('defaultStatus') === 'PENDING') defaultStatus = 'PENDING'
  }

  if (!text.trim()) return errorResponse('That file is empty.', 400)

  try {
    return NextResponse.json(await importReviewsCsv(text, { defaultStatus }))
  } catch (error) {
    if (error instanceof RvwImportError) return errorResponse(error.message, 400)
    console.error('[reviews-for-shop] review import failed', error)
    return errorResponse('Those reviews could not be imported.', 500)
  }
}
