import { describe, expect, it } from 'vitest'
import {
  NO_REVIEWS_PLACEHOLDER,
  buildReviewsCsv,
  missingRequiredColumns,
  parseReviewRow,
  readReviewsCsv,
  resolveReviewColumns,
  RVW_CSV_COLUMNS,
  type RvwCsvRow,
} from '@/modules/reviews-for-shop/lib/csv'

// The reviews spreadsheet is a round trip: what the export writes, the import has
// to read back as the same review. Everything below is the half of that which
// needs no database - which is where the real risk lives, because the file has
// been through a spreadsheet in between and a spreadsheet changes things.

function row(overrides: Partial<RvwCsvRow>): RvwCsvRow {
  const base = Object.fromEntries(RVW_CSV_COLUMNS.map((c) => [c, ''])) as RvwCsvRow
  return { ...base, ...overrides }
}

const HEADER = [...RVW_CSV_COLUMNS]
const MAP = resolveReviewColumns(HEADER)

function cellsFor(values: Partial<RvwCsvRow>): string[] {
  const full = row(values)
  return RVW_CSV_COLUMNS.map((c) => full[c])
}

describe('the header', () => {
  it('reads a file the export wrote', () => {
    expect(missingRequiredColumns(resolveReviewColumns(HEADER))).toEqual([])
  })

  it('survives Excel\'s byte order mark on the first column', () => {
    const map = resolveReviewColumns(['﻿product_sku', 'product_slug', 'review'])
    expect(map.product_sku).toBe(0)
    expect(missingRequiredColumns(map)).toEqual([])
  })

  it('accepts a hand-typed file with only a product and a review', () => {
    expect(missingRequiredColumns(resolveReviewColumns(['product_slug', 'rating', 'review']))).toEqual([])
  })

  it('names what is missing rather than refusing silently', () => {
    expect(missingRequiredColumns(resolveReviewColumns(['rating', 'author_name']))).toEqual(['product_slug or product_sku', 'review'])
  })

  it('ignores columns it does not know about', () => {
    const map = resolveReviewColumns(['product_slug', 'review', 'Our internal notes'])
    expect(missingRequiredColumns(map)).toEqual([])
  })
})

describe('a product with no reviews', () => {
  it('is written into the file saying so', () => {
    const csv = buildReviewsCsv([row({ product_slug: 'oak-desk', product_name: 'Oak desk', review: NO_REVIEWS_PLACEHOLDER })])
    expect(csv.split('\r\n')[1]).toContain(NO_REVIEWS_PLACEHOLDER)
  })

  it('comes back as a row to skip, not as a review of "No reviews yet"', () => {
    const parsed = parseReviewRow(cellsFor({ product_slug: 'oak-desk', review: NO_REVIEWS_PLACEHOLDER }), MAP)
    expect(parsed.kind).toBe('placeholder')
  })

  it('is skipped when the row is simply blank', () => {
    expect(parseReviewRow(cellsFor({}), MAP).kind).toBe('placeholder')
  })

  it('becomes a real review once someone types over it', () => {
    const parsed = parseReviewRow(cellsFor({ product_slug: 'oak-desk', rating: '5', review: 'Solid as anything.' }), MAP)
    expect(parsed.kind).toBe('review')
  })

  it('is refused when given a rating but left saying "No reviews yet"', () => {
    const parsed = parseReviewRow(cellsFor({ product_slug: 'oak-desk', rating: '5', review: NO_REVIEWS_PLACEHOLDER }), MAP)
    expect(parsed).toMatchObject({ kind: 'error' })
  })
})

describe('reading a review row', () => {
  it('keeps every field the export wrote', () => {
    const parsed = parseReviewRow(
      cellsFor({
        product_sku: 'DSK-1',
        product_slug: 'oak-desk',
        review_id: 'rev-1',
        rating: '4',
        review_title: 'Good desk',
        review: 'Arrived early and it is solid.',
        author_name: 'Jo Bloggs',
        author_email: 'jo@example.com',
        status: 'published',
        verified_purchase: 'true',
        reply: 'Thanks Jo.',
        created_at: '2026-01-02T09:30:00.000Z',
        published_at: '2026-01-03T09:30:00.000Z',
      }),
      MAP,
    )
    expect(parsed).toEqual({
      kind: 'review',
      reviewId: 'rev-1',
      productSlug: 'oak-desk',
      productSku: 'DSK-1',
      rating: 4,
      title: 'Good desk',
      body: 'Arrived early and it is solid.',
      authorName: 'Jo Bloggs',
      authorEmail: 'jo@example.com',
      status: 'PUBLISHED',
      verifiedPurchase: true,
      reply: 'Thanks Jo.',
      createdAt: new Date('2026-01-02T09:30:00.000Z'),
      publishedAt: new Date('2026-01-03T09:30:00.000Z'),
    })
  })

  it('takes yes, y and 1 as a verified purchase, and anything else as not', () => {
    for (const value of ['yes', 'Y', '1', 'TRUE']) {
      expect(parseReviewRow(cellsFor({ product_slug: 'a', rating: '5', review: 'Good', verified_purchase: value }), MAP)).toMatchObject({ verifiedPurchase: true })
    }
    for (const value of ['no', '0', '']) {
      expect(parseReviewRow(cellsFor({ product_slug: 'a', rating: '5', review: 'Good', verified_purchase: value }), MAP)).toMatchObject({ verifiedPurchase: false })
    }
  })

  it('signs an unsigned review rather than losing the words', () => {
    expect(parseReviewRow(cellsFor({ product_slug: 'a', rating: '5', review: 'Good' }), MAP)).toMatchObject({ authorName: 'Anonymous' })
  })

  it('leaves the status blank for the importer to decide', () => {
    expect(parseReviewRow(cellsFor({ product_slug: 'a', rating: '5', review: 'Good' }), MAP)).toMatchObject({ status: null })
  })

  it('refuses a rating that is not one to five', () => {
    for (const rating of ['0', '6', '4.5', 'five', '']) {
      expect(parseReviewRow(cellsFor({ product_slug: 'a', rating, review: 'Good' }), MAP)).toMatchObject({ kind: 'error' })
    }
  })

  it('refuses a status it does not recognise instead of guessing', () => {
    expect(parseReviewRow(cellsFor({ product_slug: 'a', rating: '5', review: 'Good', status: 'LIVE' }), MAP)).toMatchObject({ kind: 'error' })
  })

  it('refuses a date it cannot read instead of dating the review today', () => {
    expect(parseReviewRow(cellsFor({ product_slug: 'a', rating: '5', review: 'Good', created_at: 'last Tuesday' }), MAP)).toMatchObject({ kind: 'error' })
  })

  it('refuses a row that names no product', () => {
    expect(parseReviewRow(cellsFor({ rating: '5', review: 'Good' }), MAP)).toMatchObject({ kind: 'error' })
  })
})

describe('the whole file', () => {
  it('round-trips a review through the writer and back out of the reader', () => {
    const original = row({
      product_slug: 'oak-desk',
      product_name: 'Oak desk, "the big one"',
      review_id: 'rev-1',
      rating: '5',
      review: 'Two lines,\nwith a comma.',
      author_name: 'Jo',
      author_email: 'jo@example.com',
      status: 'PUBLISHED',
      verified_purchase: 'false',
    })
    const { map, rows } = readReviewsCsv(buildReviewsCsv([original]))
    expect(rows).toHaveLength(1)
    expect(parseReviewRow(rows[0]!, map)).toMatchObject({
      kind: 'review',
      reviewId: 'rev-1',
      body: 'Two lines,\nwith a comma.',
      productSlug: 'oak-desk',
    })
  })

  it('does not accumulate the quote the formula guard adds to a leading =', () => {
    // A review that opens with "=" is written out as "'=" so a spreadsheet reads
    // it as text rather than running it. Coming back in, the quote has to go.
    const { map, rows } = readReviewsCsv(
      buildReviewsCsv([row({ product_slug: 'a', rating: '5', review: '=the best desk I have owned' })]),
    )
    expect(parseReviewRow(rows[0]!, map)).toMatchObject({ body: '=the best desk I have owned' })
  })
})
