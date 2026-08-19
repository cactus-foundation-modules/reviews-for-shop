import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getProductUrlStyle, productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
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

// Where a product lives on the storefront. It is configurable now - a shop can
// move its products to the site root, where the old /shop/products/<slug>
// address stops existing altogether - so this defers to shop's own builder
// rather than guessing. Shop is a declared dependency (requiresModules), which
// is why importing it here is safe.
export { productHref } from '@/modules/shop/lib/product-url'

function toReview(row: ReviewRow, urlStyle: ProductUrlStyle): RvwReview {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    productHref: productHref(row.product_slug, urlStyle),
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
  // One style lookup for the whole wall rather than one per review.
  const urlStyle = await getProductUrlStyle()
  return rows.map((row) => ({
    ...toPublicReview(row, opts.showVerified),
    productName: row.product_name,
    productHref: productHref(row.product_slug, urlStyle),
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
  const urlStyle = await getProductUrlStyle()
  return { reviews: rows.map((row) => toReview(row, urlStyle)), total: Number(counted[0]?.count ?? 0) }
}

export async function getReview(id: string): Promise<RvwReview | null> {
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`${SELECT_WITH_PRODUCT} WHERE r."id" = ${id} LIMIT 1`)
  return rows[0] ? toReview(rows[0], await getProductUrlStyle()) : null
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

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// One line of the CSV as the database hands it over. Every review column is
// nullable because the row may be a product with no reviews at all: the LEFT
// JOIN is what puts those products in the file rather than quietly leaving out
// the half of the catalogue nobody has written about yet.
export type RvwExportRow = {
  product_sku: string | null
  product_slug: string
  product_name: string
  review_id: string | null
  rating: number | null
  title: string | null
  body: string | null
  author_name: string | null
  author_email: string | null
  status: RvwStatus | null
  verified_purchase: boolean | null
  reply_body: string | null
  created_at: Date | null
  published_at: Date | null
}

/**
 * The whole catalogue with its reviews hanging off it, one row per review and
 * one row per product that has none.
 *
 * `catalogue_hidden = false` is what keeps variations out. A shop with
 * shop-variations installed carries a hidden child product per variant, each
 * with its own SKU and price; those are not products an owner reviews, they are
 * rows behind the picker on the parent's page. Filtering on shop's own column
 * rather than reading shop-variations' tables means this works the same whether
 * that module is installed or not.
 *
 * Drafts and archived products are included. An owner exporting their reviews is
 * taking stock, and a product they have not published yet is exactly the sort of
 * thing they want to see an empty row for.
 */
export async function listReviewsForExport(): Promise<RvwExportRow[]> {
  return prisma.$queryRaw<RvwExportRow[]>`
    SELECT
      p."sku" AS product_sku,
      p."slug" AS product_slug,
      p."name" AS product_name,
      r."id" AS review_id,
      r."rating" AS rating,
      r."title" AS title,
      r."body" AS body,
      r."author_name" AS author_name,
      r."author_email" AS author_email,
      r."status" AS status,
      r."verified_purchase" AS verified_purchase,
      r."reply_body" AS reply_body,
      r."created_at" AS created_at,
      r."published_at" AS published_at
    FROM "shp_products" p
    LEFT JOIN "rvw_reviews" r ON r."product_id" = p."id"
    WHERE p."catalogue_hidden" = false
    ORDER BY p."name" ASC, p."slug" ASC, r."created_at" ASC
  `
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type RvwProductKeyRow = { id: string; slug: string; sku: string | null }

/**
 * Every product a review may be attached to, keyed the two ways the CSV can name
 * one. Read in a single query rather than per row: a catalogue-sized file would
 * otherwise be a thousand round trips, and this route has sixty seconds.
 */
export async function listProductKeys(): Promise<RvwProductKeyRow[]> {
  return prisma.$queryRaw<RvwProductKeyRow[]>`
    SELECT "id", "slug", "sku" FROM "shp_products" WHERE "catalogue_hidden" = false
  `
}

/** Which of these review ids actually exist, so an edited file cannot invent one. */
export async function findExistingReviewIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "rvw_reviews" WHERE "id" = ANY(${ids}::text[])
  `
  return new Set(rows.map((row) => row.id))
}

/**
 * The reviews already held against these products, reduced to the product,
 * address and wording an import compares against. Fetched only for the products
 * the file mentions - the whole table would be the wrong amount of memory for a
 * file about six products.
 */
export async function listReviewFingerprints(productIds: string[]): Promise<Array<{ productId: string; email: string; body: string }>> {
  if (productIds.length === 0) return []
  const rows = await prisma.$queryRaw<{ product_id: string; author_email: string; body: string }[]>`
    SELECT "product_id", "author_email", "body" FROM "rvw_reviews" WHERE "product_id" = ANY(${productIds}::text[])
  `
  return rows.map((row) => ({ productId: row.product_id, email: row.author_email, body: row.body }))
}

// Every date is resolved before it gets here (see lib/import.ts): the SQL below
// stores what it is given rather than deciding when a review was written, so the
// rules about that live in one readable place instead of inside a CASE.
export type ImportReviewInsert = {
  productId: string
  authorName: string
  authorEmail: string
  rating: number
  title: string | null
  body: string
  status: RvwStatus
  verifiedPurchase: boolean
  reply: string | null
  replyAt: Date | null
  createdAt: Date
  publishedAt: Date | null
}

// Every nullable parameter carries its cast. A NULL arriving in a VALUES list
// with no type around it is a "could not determine data type of parameter" from
// Postgres, and the first row of a batch is exactly where that lands.
function insertTuple(row: ImportReviewInsert): Prisma.Sql {
  return Prisma.sql`(
    ${row.productId}, ${row.authorName}, ${row.authorEmail}, ${row.rating}::int, ${row.title}::text, ${row.body},
    ${row.status}, ${row.verifiedPurchase}::boolean, ${row.reply}::text, ${row.replyAt}::timestamp(3),
    ${row.createdAt}::timestamp(3), ${row.publishedAt}::timestamp(3)
  )`
}

/**
 * Writes a batch of imported reviews in one statement. Batched because an import
 * is measured in hundreds of rows and this module's routes share the sixty-second
 * ceiling every module route has.
 */
export async function insertImportedReviews(rows: ImportReviewInsert[]): Promise<number> {
  if (rows.length === 0) return 0
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "rvw_reviews" (
      "product_id", "author_name", "author_email", "rating", "title", "body",
      "status", "verified_purchase", "reply_body", "reply_at", "created_at", "published_at"
    ) VALUES ${Prisma.join(rows.map(insertTuple))}
  `)
}

// Same shape as an insert, except that a missing date means "leave the one the
// review already has" rather than "use now".
export type ImportReviewUpdate = Omit<ImportReviewInsert, 'createdAt' | 'replyAt'> & {
  id: string
  createdAt: Date | null
}

/**
 * Rewrites reviews the file gave an id for. One statement per batch, using a
 * VALUES list joined back onto the table, so editing four hundred rows in a
 * spreadsheet is four hundred rows changed rather than four hundred queries.
 */
export async function updateImportedReviews(rows: ImportReviewUpdate[]): Promise<number> {
  if (rows.length === 0) return 0
  const values = rows.map(
    (row) => Prisma.sql`(
      ${row.id}, ${row.productId}, ${row.authorName}, ${row.authorEmail}, ${row.rating}::int, ${row.title}::text, ${row.body},
      ${row.status}, ${row.verifiedPurchase}::boolean, ${row.reply}::text, ${row.createdAt}::timestamp(3), ${row.publishedAt}::timestamp(3)
    )`,
  )
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "rvw_reviews" AS r SET
      "product_id" = v.product_id,
      "author_name" = v.author_name,
      "author_email" = v.author_email,
      "rating" = v.rating,
      "title" = v.title,
      "body" = v.body,
      "status" = v.status,
      "verified_purchase" = v.verified_purchase,
      "reply_body" = v.reply,
      -- Stamped only where there is a reply to stamp, and never cleared back to a
      -- date with no words against it.
      "reply_at" = CASE WHEN v.reply IS NULL THEN NULL ELSE COALESCE(r."reply_at", CURRENT_TIMESTAMP) END,
      -- A blank date column leaves the review's own dates alone. The file is
      -- edited in a spreadsheet, and a cleared cell there is far more often a
      -- slip than an instruction to forget when the review was written.
      "created_at" = COALESCE(v.created_at, r."created_at"),
      "published_at" = COALESCE(v.published_at, r."published_at"),
      "updated_at" = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(values)}) AS v (
      id, product_id, author_name, author_email, rating, title, body, status, verified_purchase, reply, created_at, published_at
    )
    WHERE r."id" = v.id
  `)
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
