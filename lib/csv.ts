// The reviews CSV format: one row per review, plus one row per product that has
// none yet.
//
// Shape of the file is deliberately "the catalogue, with its reviews attached"
// rather than "the reviews table". An owner opening it wants to see which
// products have been reviewed and which have been ignored, and the placeholder
// row is what makes the second half of that visible in a spreadsheet. The same
// file goes back in through the importer, so the export is also the template.
//
// The low-level CSV reading and writing is shop's (`@/modules/shop/lib/csv`):
// this module already depends on shop, and two parsers disagreeing about quoting
// is a bug waiting for the one file that contains a comma.
import { parseCsv, toCsvRow } from '@/modules/shop/lib/csv'
import type { RvwStatus } from '@/modules/reviews-for-shop/lib/types'

export const RVW_CSV_COLUMNS = [
  // Which product. Both are exported; the importer matches on slug first and
  // falls back to SKU, so either column alone is enough to build a file by hand.
  'product_sku',
  'product_slug',
  // Along for the ride so a human can read the file. Never used to match:
  // two products may share a name, and renaming one must not move its reviews.
  'product_name',
  // Blank means "this is a new review". Filled in on export so a re-import
  // edits the review that is already there instead of duplicating it.
  'review_id',
  'rating',
  'review_title',
  'review',
  'author_name',
  'author_email',
  'status',
  'verified_purchase',
  'reply',
  'created_at',
  'published_at',
] as const

export type RvwCsvColumn = (typeof RVW_CSV_COLUMNS)[number]
export type RvwCsvRow = Record<RvwCsvColumn, string>

// What a product with no reviews carries in the review column. Written into the
// file so the row reads as a sentence rather than as a line of empty commas, and
// recognised on the way back in so the importer skips it instead of trying to
// save "No reviews yet" as somebody's opinion.
export const NO_REVIEWS_PLACEHOLDER = 'No reviews yet'

export function isPlaceholderBody(body: string): boolean {
  return body.trim().toLowerCase() === NO_REVIEWS_PLACEHOLDER.toLowerCase()
}

export function buildReviewsCsv(rows: RvwCsvRow[]): string {
  const lines = [toCsvRow([...RVW_CSV_COLUMNS]), ...rows.map((row) => toCsvRow(RVW_CSV_COLUMNS.map((c) => row[c] ?? '')))]
  return lines.join('\r\n')
}

export function buildReviewsTemplateCsv(): string {
  return toCsvRow([...RVW_CSV_COLUMNS]) + '\r\n'
}

// ---------------------------------------------------------------------------
// Reading a file back in
// ---------------------------------------------------------------------------

function normaliseHeader(header: string): string {
  // Strips the BOM Excel writes on a UTF-8 save, which otherwise turns the first
  // column into "﻿product_sku" and loses it.
  return header.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '_')
}

/**
 * Maps a header row onto the known columns. Unknown columns are ignored rather
 * than refused: a file that has been through a spreadsheet often picks up an
 * extra "notes" column, and that is no reason to reject the reviews in it.
 */
export function resolveReviewColumns(header: string[]): Partial<Record<RvwCsvColumn, number>> {
  const map: Partial<Record<RvwCsvColumn, number>> = {}
  header.forEach((raw, index) => {
    const name = normaliseHeader(raw)
    if ((RVW_CSV_COLUMNS as readonly string[]).includes(name)) map[name as RvwCsvColumn] = index
  })
  return map
}

// A file must say which product each review is about and what the review says.
// Everything else has a sensible default, so a hand-typed three-column file
// works.
export function missingRequiredColumns(map: Partial<Record<RvwCsvColumn, number>>): string[] {
  const missing: string[] = []
  if (map.product_slug === undefined && map.product_sku === undefined) missing.push('product_slug or product_sku')
  if (map.review === undefined) missing.push('review')
  return missing
}

export type RvwParsedRow =
  | { kind: 'placeholder' }
  | { kind: 'error'; reason: string }
  | {
      kind: 'review'
      reviewId: string | null
      productSlug: string
      productSku: string
      rating: number
      title: string | null
      body: string
      authorName: string
      authorEmail: string
      status: RvwStatus | null
      verifiedPurchase: boolean
      reply: string | null
      createdAt: Date | null
      publishedAt: Date | null
    }

const STATUSES: RvwStatus[] = ['PENDING', 'PUBLISHED', 'REJECTED']

// Spreadsheets are inconsistent about booleans: a checkbox column comes out as
// TRUE, a hand-typed one as "yes", and shop's own CSV writes 1/0. All three mean
// the same thing to the person who typed them.
function parseBoolean(value: string): boolean {
  return ['true', 'yes', 'y', '1'].includes(value.trim().toLowerCase())
}

function parseDate(value: string): Date | 'invalid' | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

/**
 * Turns one CSV row into either a review to save, a placeholder to skip, or a
 * reason it cannot be used. Pure, so the rules can be tested without a database
 * - which matters here, because the importer's whole job is deciding what a
 * half-typed spreadsheet row was meant to say.
 */
export function parseReviewRow(cells: string[], map: Partial<Record<RvwCsvColumn, number>>): RvwParsedRow {
  const cell = (column: RvwCsvColumn): string => {
    const index = map[column]
    // The formula-injection guard on the way out prefixes a leading ' - stripped
    // here so a round-trip does not accumulate quotes on the front of a review.
    const raw = index === undefined ? '' : (cells[index] ?? '')
    return raw.startsWith("'") ? raw.slice(1) : raw
  }

  const reviewId = cell('review_id').trim()
  const body = cell('review').trim()
  const ratingRaw = cell('rating').trim()

  // A product that has not been reviewed. Recognised by the placeholder text with
  // nothing else filled in, so an owner who overwrites that cell with a real
  // review (and gives it a rating) has their review imported.
  if (!reviewId && !ratingRaw && (isPlaceholderBody(body) || body === '')) return { kind: 'placeholder' }

  const productSlug = cell('product_slug').trim()
  const productSku = cell('product_sku').trim()
  if (!productSlug && !productSku) return { kind: 'error', reason: 'no product slug or SKU' }

  const rating = Number(ratingRaw)
  if (!ratingRaw || !Number.isFinite(rating) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { kind: 'error', reason: 'rating must be a whole number from 1 to 5' }
  }
  if (!body) return { kind: 'error', reason: 'the review is empty' }
  if (isPlaceholderBody(body)) return { kind: 'error', reason: `"${NO_REVIEWS_PLACEHOLDER}" is not a review - give it a rating and some words, or leave the row alone` }

  const statusRaw = cell('status').trim().toUpperCase()
  if (statusRaw && !STATUSES.includes(statusRaw as RvwStatus)) {
    return { kind: 'error', reason: 'status must be PENDING, PUBLISHED or REJECTED' }
  }

  const createdAt = parseDate(cell('created_at'))
  if (createdAt === 'invalid') return { kind: 'error', reason: 'the date could not be read' }
  const publishedAt = parseDate(cell('published_at'))
  if (publishedAt === 'invalid') return { kind: 'error', reason: 'the published date could not be read' }

  const title = cell('review_title').trim()
  const reply = cell('reply').trim()
  const authorName = cell('author_name').trim()

  return {
    kind: 'review',
    reviewId: reviewId || null,
    productSlug,
    productSku,
    rating,
    title: title || null,
    body,
    // A review with nobody's name on it still reads as a review; refusing the row
    // over it would lose the words, which are the part worth keeping.
    authorName: authorName || 'Anonymous',
    authorEmail: cell('author_email').trim(),
    status: statusRaw ? (statusRaw as RvwStatus) : null,
    verifiedPurchase: parseBoolean(cell('verified_purchase')),
    reply: reply || null,
    createdAt: createdAt ?? null,
    publishedAt: publishedAt ?? null,
  }
}

/** Splits a whole file into its header map and its data rows. */
export function readReviewsCsv(text: string): { map: Partial<Record<RvwCsvColumn, number>>; rows: string[][] } {
  const parsed = parseCsv(text)
  const header = parsed[0] ?? []
  return { map: resolveReviewColumns(header), rows: parsed.slice(1) }
}

/**
 * What two rows have to share before the importer calls them the same review:
 * the product, who wrote it and what it says. Used to keep a file that is
 * imported twice from doubling every review on the site, since a row without a
 * review_id has nothing else to be recognised by.
 */
export function reviewFingerprint(productId: string, email: string, body: string): string {
  return `${productId} ${email.trim().toLowerCase()} ${body.trim()}`
}
