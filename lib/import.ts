// Reading a reviews CSV back in.
//
// The file the export produces is the file this accepts, which is the whole
// point: an owner takes the catalogue out, types reviews into the empty rows or
// pastes in a list from wherever they collected them before, and puts it back.
// Rows are matched by review_id where the file has one and inserted where it
// does not, so the same file can be re-imported after an edit without doubling
// anything.
import {
  findExistingReviewIds,
  insertImportedReviews,
  listProductKeys,
  listReviewFingerprints,
  updateImportedReviews,
  type ImportReviewInsert,
  type ImportReviewUpdate,
} from '@/modules/reviews-for-shop/lib/db/reviews'
import { missingRequiredColumns, parseReviewRow, readReviewsCsv, reviewFingerprint } from '@/modules/reviews-for-shop/lib/csv'
import type { RvwStatus } from '@/modules/reviews-for-shop/lib/types'

// A ceiling rather than a target. Module routes all share a sixty-second
// dispatcher limit, and a file bigger than this wants splitting in half far more
// than it wants a request that dies two thirds of the way through with no way of
// telling which third landed.
const MAX_ROWS = 5000

// Rows per statement. Twelve parameters each, so this is nowhere near Postgres's
// parameter ceiling; it is sized to keep any one statement short enough that a
// slow connection does not spend the whole request on one of them.
const BATCH_SIZE = 200

export class RvwImportError extends Error {}

export type RvwImportResult = {
  created: number
  updated: number
  // Placeholder rows for products nobody has reviewed, blank lines, and reviews
  // already on the site word for word.
  skipped: number
  errors: Array<{ row: number; reason: string }>
}

export type RvwImportOptions = {
  // What a row with an empty status column becomes. The screen offers both:
  // reviews collected elsewhere are usually meant to go straight up, but an
  // owner importing something they have not read yet should be able to say so.
  defaultStatus: RvwStatus
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function importReviewsCsv(text: string, opts: RvwImportOptions): Promise<RvwImportResult> {
  const { map, rows } = readReviewsCsv(text)

  const missing = missingRequiredColumns(map)
  if (missing.length > 0) {
    throw new RvwImportError(`This file is missing the ${missing.join(' and ')} column. Export your reviews first and edit that file.`)
  }
  if (rows.length > MAX_ROWS) {
    throw new RvwImportError(`That file has ${rows.length} rows. Split it into files of ${MAX_ROWS} rows or fewer.`)
  }

  const errors: RvwImportResult['errors'] = []
  let skipped = 0

  // Pass one: the file on its own terms, before anything is looked up.
  type Pending = { line: number; parsed: Extract<ReturnType<typeof parseReviewRow>, { kind: 'review' }> }
  const pending: Pending[] = []
  rows.forEach((cells, index) => {
    // +2 so the number matches the row a spreadsheet shows: one for the header,
    // one because a spreadsheet counts from 1.
    const line = index + 2
    const parsed = parseReviewRow(cells, map)
    if (parsed.kind === 'placeholder') skipped += 1
    else if (parsed.kind === 'error') errors.push({ row: line, reason: parsed.reason })
    else pending.push({ line, parsed })
  })

  if (pending.length === 0) return { created: 0, updated: 0, skipped, errors }

  // Pass two: match each row to a product. Slug first because it is what the
  // storefront URL is built from and what an owner recognises; SKU is the
  // fallback for a file typed from a supplier list that has no slugs in it.
  const products = await listProductKeys()
  const bySlug = new Map(products.map((p) => [p.slug.toLowerCase(), p.id]))
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id]))

  const resolved: Array<Pending & { productId: string }> = []
  for (const item of pending) {
    const productId =
      (item.parsed.productSlug ? bySlug.get(item.parsed.productSlug.toLowerCase()) : undefined) ??
      (item.parsed.productSku ? bySku.get(item.parsed.productSku.toLowerCase()) : undefined)
    if (!productId) {
      // Also where a variation lands: listProductKeys leaves out the hidden child
      // rows shop-variations creates, so a row naming one reads as a product that
      // is not there - which, as far as a review is concerned, it is not.
      errors.push({ row: item.line, reason: `no product matching "${item.parsed.productSlug || item.parsed.productSku}"` })
      continue
    }
    resolved.push({ ...item, productId })
  }

  if (resolved.length === 0) return { created: 0, updated: 0, skipped, errors }

  // Pass three: decide insert or update, and drop rows that would duplicate a
  // review already on the site.
  const referencedIds = resolved.map((item) => item.parsed.reviewId).filter((id): id is string => id !== null)
  const existingIds = await findExistingReviewIds(referencedIds)
  const fingerprints = new Set(
    (await listReviewFingerprints([...new Set(resolved.map((item) => item.productId))])).map((row) =>
      reviewFingerprint(row.productId, row.email, row.body),
    ),
  )

  const inserts: ImportReviewInsert[] = []
  const updates: ImportReviewUpdate[] = []
  const now = new Date()

  for (const item of resolved) {
    const { parsed, productId } = item
    const status = parsed.status ?? opts.defaultStatus

    if (parsed.reviewId) {
      if (!existingIds.has(parsed.reviewId)) {
        errors.push({ row: item.line, reason: 'that review id is not on the site - clear the column to add it as a new review' })
        continue
      }
      updates.push({
        id: parsed.reviewId,
        productId,
        authorName: parsed.authorName,
        authorEmail: parsed.authorEmail,
        rating: parsed.rating,
        title: parsed.title,
        body: parsed.body,
        status,
        verifiedPurchase: parsed.verifiedPurchase,
        reply: parsed.reply,
        createdAt: parsed.createdAt,
        // Published with no date given: stamp it, otherwise a batch of imported
        // reviews would all sort to the bottom of a product page behind anything
        // that does have one.
        publishedAt: parsed.publishedAt ?? (status === 'PUBLISHED' ? (parsed.createdAt ?? now) : null),
      })
      continue
    }

    const fingerprint = reviewFingerprint(productId, parsed.authorEmail, parsed.body)
    if (fingerprints.has(fingerprint)) {
      skipped += 1
      continue
    }
    // Added as we go, so a file that lists the same review twice adds it once.
    fingerprints.add(fingerprint)

    const createdAt = parsed.createdAt ?? now
    inserts.push({
      productId,
      authorName: parsed.authorName,
      authorEmail: parsed.authorEmail,
      rating: parsed.rating,
      title: parsed.title,
      body: parsed.body,
      status,
      verifiedPurchase: parsed.verifiedPurchase,
      reply: parsed.reply,
      replyAt: parsed.reply ? createdAt : null,
      createdAt,
      publishedAt: parsed.publishedAt ?? (status === 'PUBLISHED' ? createdAt : null),
    })
  }

  let created = 0
  for (const batch of chunk(inserts, BATCH_SIZE)) created += await insertImportedReviews(batch)
  let updated = 0
  for (const batch of chunk(updates, BATCH_SIZE)) updated += await updateImportedReviews(batch)

  return { created, updated, skipped, errors }
}
