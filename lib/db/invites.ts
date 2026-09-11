import { prisma } from '@/lib/db/prisma'

export type InviteOrderRow = {
  orderId: string
  orderNumber: string
  email: string
  customerName: string
  // SHIPPED or COMPLETED, which is all this query lets through. It decides
  // whether the email can offer the order page: shop only puts the review card
  // on a COMPLETED order - see lib/order-panel-provider.ts.
  status: string
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
 *  - and the job has not already dealt with that order.
 *
 * The last one is `NOT EXISTS` against the whole order rather than per product,
 * because an invitation is one email per order: a row against it means either that
 * email has gone or the job decided against sending it, and both are settled.
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
      status: string
      product_ids: string[]
    }[]
  >`
    SELECT o."id" AS order_id, o."order_number", o."customer_email", o."customer_name", o."status",
           array_agg(DISTINCT i."product_id") AS product_ids
    FROM "shp_orders" o
    JOIN "shp_order_items" i ON i."order_id" = o."id" AND i."product_id" IS NOT NULL
    WHERE o."payment_status" = 'PAID'
      AND o."status" IN ('SHIPPED', 'COMPLETED')
      -- ::int4 is load-bearing: Prisma sends a JS integer as bigint and there is no
      -- make_interval(days => bigint), so without the cast this is a 42883 and the
      -- nightly invitation run 500s the moment the owner switches invitations on.
      AND COALESCE(o."paid_at", o."created_at") <= CURRENT_TIMESTAMP - make_interval(days => ${delayDays}::int4)
      AND NOT EXISTS (SELECT 1 FROM "rvw_invites" v WHERE v."order_id" = o."id")
    GROUP BY o."id", o."order_number", o."customer_email", o."customer_name", o."status"
    ORDER BY COALESCE(o."paid_at", o."created_at") ASC
    LIMIT ${limit}
  `
  return rows.map((row) => ({
    orderId: row.order_id,
    orderNumber: row.order_number,
    email: row.customer_email,
    customerName: row.customer_name,
    status: row.status,
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
 * Whether this customer has already had their say about this order. One review of
 * one thing they bought is enough: somebody who has just written about their chair
 * does not need an email asking them to write about their chair.
 *
 * Two ways it can be true, because there are two ways a review gets written. One
 * left from the order page carries the order itself. One left off their own bat
 * from a product page carries no order, so that one is matched the way everything
 * else here is matched - the address on the order, against the pages it bought.
 *
 * Status is deliberately not filtered. A review sitting in the moderation queue is
 * still the customer having written one, and chasing them for a second is worse
 * than the silence.
 */
export async function hasReviewedOrder(params: {
  orderId: string
  email: string
  productIds: string[]
}): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ one: number }[]>`
    SELECT 1 AS one FROM "rvw_reviews"
    WHERE "order_id" = ${params.orderId}
       OR (lower("author_email") = lower(${params.email})
           AND "product_id" = ANY(${params.productIds}::text[]))
    LIMIT 1
  `
  return rows.length > 0
}

/**
 * Writes down what we did about one (order, product): emailed it, or looked at it
 * and left it alone. ON CONFLICT DO NOTHING because the unique constraint on
 * (order_id, product_id) is the real guard: two overlapping runs would both have
 * read "not asked yet", and the second insert failing quietly is exactly what
 * should happen.
 *
 * `skippedReason` is NULL for an email that went out, and is the reason otherwise.
 * A skipped row exists so the order stops being a candidate - without it the job
 * reconsiders the same order every night for ever, and forty of those are a run.
 *
 * The product recorded is the page that was linked to (the parent on a shop with
 * options), which is also what the "already asked" check reads.
 */
export async function recordInviteOutcome(
  orderId: string,
  productId: string,
  email: string,
  skippedReason: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "rvw_invites" ("order_id", "product_id", "email", "skipped_reason")
    VALUES (${orderId}, ${productId}, ${email}, ${skippedReason}::text)
    ON CONFLICT ("order_id", "product_id") DO NOTHING
  `
}
