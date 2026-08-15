import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalExportBearer } from '@/lib/members/export'
import { prisma } from '@/lib/db/prisma'

// A member's own reviews, for their data export.
//
// This module had no export route at all, and it holds more personal data than
// most: every review carries the author's name and email address, and
// `submitted_ip` records the address it was written from. A member asking what
// the site holds about them was told about their orders and their basket and
// nothing about the reviews they had written.
//
// Both ways in are covered on purpose. `member_id` catches a review left while
// signed in; the email catches one left as a guest with the same address, which
// is the same person and the same personal data whatever the row says. The email
// is read from the Member record here rather than taken from the request, so
// this cannot be pointed at somebody else's reviews by asking nicely.
//
// Internal bearer only - called self-origin by core's assembleMemberExport(),
// never reachable with a browser session (memberExtensions.dataExportPath).
export async function GET(request: NextRequest) {
  if (!verifyInternalExportBearer(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const memberId = request.headers.get('x-cactus-member-id')
  if (!memberId) return NextResponse.json({ error: 'Missing member id' }, { status: 400 })

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { email: true } })

  const reviews = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT r."id", r."rating", r."title", r."body", r."status", r."author_name", r."author_email",
           r."verified_purchase", r."submitted_ip", r."created_at", r."updated_at",
           p."name" AS "product_name", p."slug" AS "product_slug"
    FROM "rvw_reviews" r
    LEFT JOIN "shp_products" p ON p."id" = r."product_id"
    WHERE r."member_id" = ${memberId}
       OR (${member?.email ?? null}::text IS NOT NULL AND lower(r."author_email") = lower(${member?.email ?? null}::text))
    ORDER BY r."created_at" DESC
  `

  // The invitations sent to this address, which are also about them: an email
  // the site chose to send is as much their record as the review it asked for.
  const invites = member?.email
    ? await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT "id", "email", "sent_at", "order_id", "product_id"
        FROM "rvw_invites"
        WHERE lower("email") = lower(${member.email})
        ORDER BY "sent_at" DESC NULLS LAST
      `
    : []

  return NextResponse.json({ reviews, invites })
}
