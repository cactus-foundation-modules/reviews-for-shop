import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type {
  RvwPublicReview,
  RvwReview,
  RvwStatus,
  RvwSummary,
  RvwWallReview,
} from '@/modules/reviews-for-shop/lib/types'

// Every query here is a tagged template, so every value the shopper or the admin
// typed arrives as a bound parameter. Filters are expressed as
// `(${value}::type IS NULL OR column = ${value})` rather than by assembling SQL
// strings, the same shape quote-for-shop's list query uses.

type ReviewRow = {
  id: string
  product_id: string
  member_id: string | null
  author_name: string
  author_email: string
  rating: number
  title: string | null
  body: string
  status: RvwStatus
  verified_purchase: boolean
  order_id: string | null
  reply_body: string | null
  reply_at: Date | null
  created_at: Date
  published_at: Date | null
  product_name: string
  product_slug: string
  order_number: string | null
}

// Where a product lives on the storefront. Hardcoded because shop's own cards and
// sitemap hardcode the same path (lib/card-template.tsx); the day that becomes
// configurable, this is the one line to change.
export function productHref(slug: string): string {
  return `/shop/products/${slug}`
}

function toReview(row: ReviewRow): RvwReview {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    memberId: row.member_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    status: row.status,
    verifiedPurchase: row.verified_purchase,
    orderId: row.order_id,
    orderNumber: row.order_number,
    replyBody: row.reply_body,
    replyAt: row.reply_at ? row.reply_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
  }
}

// The storefront's view of a row. The email, the IP and the order id are dropped
// here rather than at the route, so no public surface can leak them by forgetting
// to. `showVerified` is passed in because the badge is a setting: the match itself
// is always recorded, and hiding it is a display decision.
function toPublicReview(row: ReviewRow, showVerified: boolean): RvwPublicReview {
  return {
    id: row.id,
    authorName: row.author_name,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    verified: showVerified && row.verified_purchase,
    replyBody: row.reply_body,
    createdAt: (row.published_at ?? row.created_at).toISOString(),
  }
}

// Composed into every read rather than repeated: a review is never useful without
// the name of the thing it is about, and the order number is what lets an admin
// check a "verified purchase" claim against the order itself.
const SELECT_WITH_PRODUCT = Prisma.sql`
  SELECT r.*, p."name" AS product_name, p."slug" AS product_slug, o."order_number" AS order_number
  FROM "rvw_reviews" r
  JOIN "shp_products" p ON p."id" = r."product_id"
  LEFT JOIN "shp_orders" o ON o."id" = r."order_id"
`

// ---------------------------------------------------------------------------
// Storefront reads
// ---------------------------------------------------------------------------

/**
 * One product's published reviews, newest first by the date they went live
 * (published_at), not the date they were written: a moderated shop publishing a
 * batch on Monday should read as Monday's reviews to the shopper looking at it.
 */
export async function listPublishedForProduct(
  productId: string,
  opts: { limit: number; offset: number; showVerified: boolean },
): Promise<RvwPublicReview[]> {
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
    ${SELECT_WITH_PRODUCT}
    WHERE r."product_id" = ${productId} AND r."status" = 'PUBLISHED'
    ORDER BY COALESCE(r."published_at", r."created_at") DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `)
  return rows.map((row) => toPublicReview(row, opts.showVerified))
}

/**
 * The star line. One grouped query rather than an average plus five counts: the
 * average is computed here from the same rows the breakdown came from, so the two
 * can never disagree with each other on the page.
 */
export async function getProductSummary(productId: string): Promise<RvwSummary> {
  const rows = await prisma.$queryRaw<{ rating: number; count: bigint }[]>`
    SELECT "rating", COUNT(*)::bigint AS count
    FROM "rvw_reviews"
    WHERE "product_id" = ${productId} AND "status" = 'PUBLISHED'
    GROUP BY "rating"
  `
  return summariseRatingCounts(rows.map((row) => ({ rating: Number(row.rating), count: Number(row.count) })))
}

/**
 * Turns grouped (rating, count) pairs into the summary the star line draws.
 * Exported because it is the one piece of arithmetic in the module worth a unit
 * test, and a test should not need a database to run.
 */
export function summariseRatingCounts(pairs: Array<{ rating: number; count: number }>): RvwSummary {
  const breakdown: RvwSummary['breakdown'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let count = 0
  let total = 0
  for (const pair of pairs) {
    // Ratings outside 1-5 cannot exist (the table has a CHECK), but a defensive
    // skip keeps a bad row out of the average rather than shifting every star on
    // the page by an unexplainable amount.
    if (pair.rating < 1 || pair.rating > 5) continue
    const rating = Math.round(pair.rating) as 1 | 2 | 3 | 4 | 5
    breakdown[rating] += pair.count
    count += pair.count
    total += pair.count * rating
  }
  // Rounded to one decimal place, which is how a shopper reads a rating ("4.6"),
  // and the only rounding done anywhere: the stars themselves are drawn from this
  // number so the figure and the picture always agree.
  const average = count === 0 ? 0 : Math.round((total / count) * 10) / 10
  return { count, average, breakdown }
}

export async function countPublishedForProduct(productId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "rvw_reviews"
    WHERE "product_id" = ${productId} AND "status" = 'PUBLISHED'
  `
  return Number(rows[0]?.count ?? 0)
}

/**
 * The site-wide wall: the latest published reviews across the whole shop, each
 * with the product it is about.
 *
 * Products the storefront will not draw are left out - not ACTIVE, or hidden from
 * the catalogue, which is the same line shop's own product page 404s on. A wall is
 * an advert for the shop, and sending a shopper to a page that is not there is
 * worse than one review fewer.
 */
export async function listLatestPublished(opts: {
  limit: number
  minRating: number
  showVerified: boolean
}): Promise<RvwWallReview[]> {
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
    ${SELECT_WITH_PRODUCT}
    WHERE r."status" = 'PUBLISHED' AND r."rating" >= ${opts.minRating}
      AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
    ORDER BY COALESCE(r."published_at", r."created_at") DESC
    LIMIT ${opts.limit}
  `)
  return rows.map((row) => ({
    ...toPublicReview(row, opts.showVerified),
    productName: row.product_name,
    productHref: productHref(row.product_slug),
  }))
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export type CreateReviewInput = {
  productId: string
  memberId: string | null
  authorName: string
  authorEmail: string
  rating: number
  title: string | null
  body: string
  status: Extract<RvwStatus, 'PENDING' | 'PUBLISHED'>
  verifiedPurchase: boolean
  orderId: string | null
  submittedIp: string | null
}

export async function createReview(input: CreateReviewInput): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "rvw_reviews" (
      "product_id", "member_id", "author_name", "author_email", "rating", "title", "body",
      "status", "verified_purchase", "order_id", "submitted_ip", "published_at"
    ) VALUES (
      ${input.productId}, ${input.memberId}, ${input.authorName}, ${input.authorEmail},
      ${input.rating}, ${input.title}, ${input.body}, ${input.status},
      ${input.verifiedPurchase}, ${input.orderId}, ${input.submittedIp},
      -- Stamped now only when it goes straight up; the moderation route stamps it
      -- at the moment someone publishes it instead.
      CASE WHEN ${input.status} = 'PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    RETURNING "id"
  `
  return rows[0]!.id
}

/**
 * Has this address already reviewed this product? Counts PENDING and REJECTED
 * ones too: the point of the rule is one voice per product, and a rejected review
 * resubmitted verbatim is the exact case it exists for.
 */
export async function hasReviewFromEmail(productId: string, email: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "rvw_reviews"
    WHERE "product_id" = ${productId} AND lower("author_email") = lower(${email})
  `
  return Number(rows[0]?.count ?? 0) > 0
}

// ---------------------------------------------------------------------------
// Admin reads and writes
// ---------------------------------------------------------------------------

export type ListReviewsFilter = {
  status?: RvwStatus | null
  search?: string | null
  productId?: string | null
  page?: number
  perPage?: number
}

export async function listReviews(filter: ListReviewsFilter): Promise<{ reviews: RvwReview[]; total: number }> {
  const perPage = Math.min(Math.max(filter.perPage ?? 25, 1), 100)
  const page = Math.max(filter.page ?? 1, 1)
  const offset = (page - 1) * perPage
  const status = filter.status ?? null
  const productId = filter.productId ?? null
  // ILIKE pattern built here and passed as a parameter, never interpolated: it is
  // a search box, so it is shopper-shaped text arriving through an admin route.
  const search = filter.search?.trim() ? `%${filter.search.trim()}%` : null

  const where = Prisma.sql`
    WHERE (${status}::text IS NULL OR r."status" = ${status})
      AND (${productId}::text IS NULL OR r."product_id" = ${productId})
      AND (${search}::text IS NULL OR r."author_name" ILIKE ${search} OR r."author_email" ILIKE ${search}
           OR r."title" ILIKE ${search} OR r."body" ILIKE ${search} OR p."name" ILIKE ${search})
  `

  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
    ${SELECT_WITH_PRODUCT} ${where} ORDER BY r."created_at" DESC LIMIT ${perPage} OFFSET ${offset}
  `)
  const counted = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM "rvw_reviews" r
    JOIN "shp_products" p ON p."id" = r."product_id" ${where}
  `)
  return { reviews: rows.map(toReview), total: Number(counted[0]?.count ?? 0) }
}

export async function getReview(id: string): Promise<RvwReview | null> {
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`${SELECT_WITH_PRODUCT} WHERE r."id" = ${id} LIMIT 1`)
  return rows[0] ? toReview(rows[0]) : null
}

/**
 * Moves a review between states. `published_at` is stamped the first time it goes
 * live and then left alone, so unpublishing and republishing does not shuffle a
 * review back to the top of the product page as though it were new.
 */
export async function setReviewStatus(ids: string[], status: RvwStatus): Promise<number> {
  if (ids.length === 0) return 0
  return prisma.$executeRaw`
    UPDATE "rvw_reviews" SET
      "status" = ${status},
      "published_at" = CASE WHEN ${status} = 'PUBLISHED' THEN COALESCE("published_at", CURRENT_TIMESTAMP) ELSE "published_at" END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ANY(${ids}::text[])
  `
}

/** Writes, rewrites or (with an empty string) removes the shop's own answer. */
export async function setReviewReply(id: string, reply: string): Promise<void> {
  const trimmed = reply.trim()
  await prisma.$executeRaw`
    UPDATE "rvw_reviews" SET
      "reply_body" = ${trimmed === '' ? null : trimmed},
      "reply_at" = ${trimmed === '' ? null : new Date()},
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `
}

export async function deleteReviews(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  return prisma.$executeRaw`DELETE FROM "rvw_reviews" WHERE "id" = ANY(${ids}::text[])`
}

/** Counts for the admin list's filter chips, including the "waiting for you" one. */
export async function countReviewsByStatus(): Promise<Record<RvwStatus, number>> {
  const rows = await prisma.$queryRaw<{ status: RvwStatus; count: bigint }[]>`
    SELECT "status", COUNT(*)::bigint AS count FROM "rvw_reviews" GROUP BY "status"
  `
  const counts: Record<RvwStatus, number> = { PENDING: 0, PUBLISHED: 0, REJECTED: 0 }
  for (const row of rows) counts[row.status] = Number(row.count)
  return counts
}
