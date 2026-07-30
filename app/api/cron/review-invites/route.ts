// GET/POST /api/m/reviews-for-shop/cron/review-invites
// Nightly Vercel cron: asks customers what they made of what they bought, once the
// order has had time to arrive. Does nothing at all unless the owner has turned
// invitations on. Same CRON_SECRET bearer as shop's own crons.
import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { runReviewInvites } from '@/modules/reviews-for-shop/lib/invites'

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  try {
    const result = await runReviewInvites()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invitation run failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
