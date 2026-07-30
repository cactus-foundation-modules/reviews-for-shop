// GET /api/m/reviews-for-shop/public/viewer
//
// Whether the browser asking is a signed-in member, and what to pre-fill the
// review form with if it is. A route of its own rather than part of the product
// payload on purpose: the Reviews tab is resolved while the product page renders,
// and a page that reads a session cookie can never be rendered statically again.
// One small request from the form costs far less than every product page on the
// shop going dynamic.
//
// Returns only what the member's own browser already knows about them, so there is
// nothing here to leak.
import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import type { RvwViewer } from '@/modules/reviews-for-shop/lib/types'

export async function GET() {
  const member = await getMemberFromCookie()
  const viewer: RvwViewer = member
    ? { isMember: true, name: member.displayName || member.username, email: member.email }
    : { isMember: false, name: '', email: '' }
  return NextResponse.json(viewer)
}
