import { prisma } from '@/lib/db/prisma'
import { resolveReviewableProduct } from '@/modules/reviews-for-shop/lib/reviewable-product'

// How far back the second pass will look. A customer with more hidden-variant
// lines than this against one address has bought a great deal, and the exact
// order the badge names matters far less than getting the badge at all.
const VARIANT_SCAN_LIMIT = 40

/**
 * Did this address actually buy this product? Returns the order it bought it on,
 * newest first, or null.
 *
 * Matched on the order's own customer_email rather than on a member account,
 * because most shops take most orders as guests, and the email is the only thing a
 * shopper reliably has in common between buying and reviewing.
 *
 * What counts as bought: paid for, and not cancelled. A refunded order still counts
 * - the customer had the thing, formed an opinion of it, and sent it back, which is
 * a review worth having and arguably the most honest one on the page.
 *
 * Not proof of identity, and never treated as such: anyone can type a customer's
 * email address. It gates the "verified purchase" badge and the buyers-only
 * setting, both of which are about keeping the page honest rather than about
 * security. Nothing here grants access to anything.
 */
export async function findVerifiedOrderId(productId: string, email: string): Promise<string | null> {
  const direct = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o."id"
    FROM "shp_orders" o
    JOIN "shp_order_items" i ON i."order_id" = o."id"
    WHERE i."product_id" = ${productId}
      AND lower(o."customer_email") = lower(${email})
      AND o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND o."status" <> 'CANCELLED'
    ORDER BY COALESCE(o."paid_at", o."created_at") DESC
    LIMIT 1
  `
  if (direct[0]) return direct[0].id

  // Second pass, and the reason this is not one query: on a shop with options, the
  // line records the catalogue-hidden CHILD product that backs the chosen variant,
  // never the parent whose page the review is on. Those children have to be
  // resolved back through shop's page-resolver seam (see reviewable-product.ts),
  // which is code rather than SQL - so the candidates are fetched and walked.
  //
  // Only hidden rows are scanned: a visible line that was going to match already
  // did, above.
  const hidden = await prisma.$queryRaw<{ id: string; product_id: string }[]>`
    SELECT DISTINCT o."id", i."product_id"
    FROM "shp_orders" o
    JOIN "shp_order_items" i ON i."order_id" = o."id"
    JOIN "shp_products" p ON p."id" = i."product_id" AND p."catalogue_hidden" = true
    WHERE lower(o."customer_email") = lower(${email})
      AND o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND o."status" <> 'CANCELLED'
    ORDER BY o."id"
    LIMIT ${VARIANT_SCAN_LIMIT}
  `
  if (hidden.length === 0) return null

  const seen = new Map<string, Awaited<ReturnType<typeof resolveReviewableProduct>>>()
  for (const row of hidden) {
    const parent = await resolveReviewableProduct(row.product_id, seen)
    if (parent?.id === productId) return row.id
  }
  return null
}
