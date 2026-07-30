// GET/PUT /api/m/reviews-for-shop/admin/settings
// Backs the Reviews sub-tab of Shop settings. Own fetch, own save, own permission:
// shop lends the space and nothing else.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { requireReviewsUser } from '@/modules/reviews-for-shop/lib/access'
import { getSettings, updateSettings } from '@/modules/reviews-for-shop/lib/db/settings'

const Body = z.object({
  autoPublish: z.boolean().optional(),
  whoCanReview: z.enum(['ANYONE', 'MEMBERS', 'VERIFIED_BUYERS']).optional(),
  productSurface: z.enum(['TAB', 'NONE']).optional(),
  showVerifiedBadge: z.boolean().optional(),
  askForTitle: z.boolean().optional(),
  // Bounded here as well as in the form: a minimum of 4,000 characters would mean
  // a form nobody can submit, and there is no reason to allow it.
  minCommentLength: z.number().int().min(0).max(1000).optional(),
  onePerProductPerEmail: z.boolean().optional(),
  // Either an address or blank, blank meaning "send no notices". Not z.string().email()
  // alone, which would make clearing the field impossible.
  notifyEmail: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
  reviewsPerPage: z.number().int().min(1).max(50).optional(),
  thanksPublished: z.string().trim().max(300).optional(),
  thanksPending: z.string().trim().max(300).optional(),
  invitesEnabled: z.boolean().optional(),
  inviteDelayDays: z.number().int().min(0).max(365).optional(),
})

export async function GET() {
  const gate = await requireReviewsUser('reviews.access', { allowAccess: true })
  if (gate.error) return gate.error
  return NextResponse.json({ settings: await getSettings() })
}

export async function PUT(request: NextRequest) {
  const gate = await requireReviewsUser('reviews.manage')
  if (gate.error) return gate.error

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Invalid request', 400)
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse('Those settings could not be saved. Please check them and try again.', 400)

  await updateSettings(parsed.data)
  return NextResponse.json({ settings: await getSettings() })
}
