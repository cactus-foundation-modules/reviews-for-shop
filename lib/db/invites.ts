import { prisma } from '@/lib/db/prisma'

export type InviteOrderRow = {
  orderId: string
  orderNumber: string
  email: string
  customerName: string
  // The product ids exactly as the order recorded them. On a shop with options
  // these are the catalogue-hidden child rows, which the caller resolves back to
  // the pages they belong to - see lib/reviewable-product.ts.
  purchasedProductIds: string[]
}

/**
 * Orders that are due a "how did you get on with it?" email.
 *
 * Three things have to be true:
 *  - the order was paid for and has actually gone out (SHIPPED or COMPLETED),
 *  - long enough ago that the thing has arrived and been used,
 *  - and we have not written to that order at all yet.
 *
 * The last one is `NOT EXISTS` against the whole order rather than per product,
 * because an invitation is one email per order: if a row exists for it, that email
 * has already gone.
 *
 * Note what is NOT filtered here. The product rows are not checked for being
 * publicly visible, and the reviews already written are not joined out, because
 * both questions are about the PAGE a line belongs to, and on a shop with options
 * a line points at a hidden child rather than at its parent's page. Doing either in
 * SQL would silently exclude every variation order there is. The caller resolves
 * the parents first and then asks both questions - see lib/invites.ts.
 */
export async function listInviteCandidates(delayDays: number, limit: number): Promise<InviteOrderRow[]> {
  const rows = await prisma.$queryRaw<
    {
      order_id: string
      order_number: string
      customer_email: string
      customer_name: string
      product_ids: string[]
    }[]
  >`
    SELECT o."id" AS order_id, o."order_number", o."customer_email", o."customer_name",
           array_agg(DISTINCT i."product_id") AS product_ids
    FROM "shp_orders" o
    JOIN "shp_order_items" i ON i."order_id" = o."id" AND i."product_id" IS NOT NULL
    WHERE o."payment_status" = 'PAID'
      AND o."status" IN ('SHIPPED', 'COMPLETED')
      AND COALESCE(o."paid_at", o."created_at") <= CURRENT_TIMESTAMP - make_interval(days => ${delayDays})
      AND NOT EXISTS (SELECT 1 FROM "rvw_invites" v WHERE v."order_id" = o."id")
    GROUP BY o."id", o."order_number", o."customer_email", o."customer_name"
    ORDER BY COALESCE(o."paid_at", o."created_at") ASC
    LIMIT ${limit}
  `
  return rows.map((row) => ({
    orderId: row.order_id,
    orderNumber: row.order_number,
    email: row.customer_email,
    customerName: row.customer_name,
    purchasedProductIds: row.product_ids ?? [],
  }))
}

/**
 * Which of these products this address has already reviewed, so nobody is asked
 * about something they have already had their say on. Matched on email, since that
 * is what a guest order has.
 */
export async function findAlreadyReviewed(email: string, productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const rows = await prisma.$queryRaw<{ product_id: string }[]>`
    SELECT DISTINCT "product_id" FROM "rvw_reviews"
    WHERE lower("author_email") = lower(${email}) AND "product_id" = ANY(${productIds}::text[])
  `
  return new Set(rows.map((row) => row.product_id))
}

/**
 * Writes down that we asked. ON CONFLICT DO NOTHING because the unique constraint
 * on (order_id, product_id) is the real guard: two overlapping runs would both
 * have read "not asked yet", and the second insert failing quietly is exactly what
 * should happen.
 *
 * The product recorded is the page that was linked to (the parent on a shop with
 * options), which is also what the "already asked" check reads.
 */
export async function recordInvite(orderId: string, productId: string, email: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "rvw_invites" ("order_id", "product_id", "email")
    VALUES (${orderId}, ${productId}, ${email})
    ON CONFLICT ("order_id", "product_id") DO NOTHING
  `
}
