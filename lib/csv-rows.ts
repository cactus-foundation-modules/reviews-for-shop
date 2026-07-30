// Turns the export query's rows into the cells the CSV carries. Kept apart from
// lib/csv.ts so that file stays free of anything that touches the database and
// can be unit tested on its own.
import { NO_REVIEWS_PLACEHOLDER, type RvwCsvRow } from '@/modules/reviews-for-shop/lib/csv'
import type { RvwExportRow } from '@/modules/reviews-for-shop/lib/db/reviews'

// ISO 8601, which is what the importer reads back and what a spreadsheet sorts
// correctly. A localised "30/07/2026" would be prettier and would round-trip
// differently depending on who opened it.
function isoDate(value: Date | null): string {
  return value ? value.toISOString() : ''
}

export function buildReviewCsvRows(rows: RvwExportRow[]): RvwCsvRow[] {
  return rows.map((row) => {
    const product = {
      product_sku: row.product_sku ?? '',
      product_slug: row.product_slug,
      product_name: row.product_name,
    }

    // The LEFT JOIN gives a product with no reviews one row of nulls. It goes in
    // the file all the same, saying so in the review column: a list of what has
    // been reviewed is only half the answer to "how are we doing on reviews".
    if (!row.review_id) {
      return {
        ...product,
        review_id: '',
        rating: '',
        review_title: '',
        review: NO_REVIEWS_PLACEHOLDER,
        author_name: '',
        author_email: '',
        status: '',
        verified_purchase: '',
        reply: '',
        created_at: '',
        published_at: '',
      }
    }

    return {
      ...product,
      review_id: row.review_id,
      rating: String(Number(row.rating ?? 0)),
      review_title: row.title ?? '',
      review: row.body ?? '',
      author_name: row.author_name ?? '',
      author_email: row.author_email ?? '',
      status: row.status ?? '',
      verified_purchase: row.verified_purchase ? 'true' : 'false',
      reply: row.reply_body ?? '',
      created_at: isoDate(row.created_at),
      published_at: isoDate(row.published_at),
    }
  })
}
