// What this module publishes to the rest of the site: the reviews that are
// actually live on the storefront, in a shape that names no consumer.
//
// Registered on the extension point 'shop.product-reviews', so anything that
// wants a shop's published reviews - a feed for Google, a rich-results block, a
// weekly digest - can read them without importing this module, which it must
// not do: it is optional on every site, and a direct import would break the
// build wherever it is not installed.
//
// The shape is deliberately plain and vendor-neutral. No HTML, no module types,
// no assumption that five is the top of the scale (`ratingMax` says so), and
// nothing personal: the reviewer's email, their IP and the shop's own reply are
// this module's business and travel nowhere.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

/** One published review, as anything outside this module sees it. */
export type PublishedReviewRow = {
  id: string
  productId: string
  productName: string
  /** The product's slug, not a URL: where products live is the shop's setting,
   *  and a consumer resolves it with the shop's own helper. */
  productSlug: string
  rating: number
  /** The best score available, so a consumer can state the scale rather than
   *  assume it. Five today; a shop that rates out of ten later says so here. */
  ratingMax: number
  title: string | null
  body: string
  /** The name the reviewer gave. Empty where they left it blank, which is the
   *  consumer's cue to treat the review as anonymous rather than invent a name. */
  authorName: string
  /** ISO instant the review went live, which on a moderated shop is not the
   *  instant it was written. */
  publishedAt: string
  /** The email given matched a paid order for this product when it landed. */
  verifiedPurchase: boolean
  /** Written in answer to an invitation this shop sent after the order was
   *  fulfilled, rather than turning up unprompted. Google, for one, treats the
   *  two differently. */
  invited: boolean
  /** The order it came from, where one is known. */
  orderNumber: string | null
}

type Row = {
  id: string
  product_id: string
  product_name: string
  product_slug: string
  rating: number
  title: string | null
  body: string
  author_name: string
  published_at: Date | null
  created_at: Date
  verified_purchase: boolean
  order_number: string | null
  invited: boolean
}

/** The top of this module's rating scale. The table's own CHECK constraint. */
const RATING_MAX = 5

/**
 * Published reviews, newest live first, one page at a time.
 *
 * Only reviews of products the storefront will actually draw come back - ACTIVE
 * and not hidden from the catalogue, the same line the reviews wall holds. A
 * review whose product cannot be visited is a link to a 404 wherever it is
 * republished, which is worse than one review fewer.
 *
 * The ordering is stable (published date, then id) because a caller paging
 * through the lot must not be handed the same review twice, or miss one,
 * because two reviews went live in the same second.
 */
export async function reviewsPublishedReviews(opts: {
  limit: number
  offset: number
}): Promise<PublishedReviewRow[]> {
  const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit)))
  const offset = Math.max(0, Math.floor(opts.offset))
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT r."id", r."product_id", r."rating", r."title", r."body", r."author_name",
           r."published_at", r."created_at", r."verified_purchase",
           p."name" AS product_name, p."slug" AS product_slug,
           o."order_number" AS order_number,
           (i."id" IS NOT NULL) AS invited
    FROM "rvw_reviews" r
    JOIN "shp_products" p ON p."id" = r."product_id"
    LEFT JOIN "shp_orders" o ON o."id" = r."order_id"
    -- The invitation this review answers, where the nightly job sent one for
    -- this exact order and product. Its absence is not proof of an unsolicited
    -- review, only that this shop did not ask for it by email.
    LEFT JOIN "rvw_invites" i ON i."order_id" = r."order_id" AND i."product_id" = r."product_id"
    WHERE r."status" = 'PUBLISHED'
      AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
    ORDER BY COALESCE(r."published_at", r."created_at") DESC, r."id" ASC
    LIMIT ${limit} OFFSET ${offset}
  `)
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    rating: Number(row.rating),
    ratingMax: RATING_MAX,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    publishedAt: (row.published_at ?? row.created_at).toISOString(),
    verifiedPurchase: row.verified_purchase,
    invited: row.invited === true,
    orderNumber: row.order_number,
  }))
}

/** The registered name on the extension point. */
export const reviewsPublishedReviewsProvider = reviewsPublishedReviews
