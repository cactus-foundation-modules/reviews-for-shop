import { describe, expect, it } from 'vitest'
import { summariseRatingCounts } from '@/modules/reviews-for-shop/lib/db/reviews'

// The star line's arithmetic, which is the one thing in this module a shopper reads
// as a fact about the shop. Worth a test that needs no database: an average that
// disagrees with the bars beside it makes the whole page look made up.
describe('summariseRatingCounts', () => {
  it('reports nothing for a product with no reviews', () => {
    const summary = summariseRatingCounts([])
    expect(summary).toEqual({ count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })
  })

  it('averages across the ratings, weighted by how many of each', () => {
    const summary = summariseRatingCounts([
      { rating: 5, count: 3 },
      { rating: 4, count: 1 },
    ])
    expect(summary.count).toBe(4)
    expect(summary.average).toBe(4.8)
    expect(summary.breakdown[5]).toBe(3)
    expect(summary.breakdown[4]).toBe(1)
  })

  it('rounds the average to one decimal place, the way the page prints it', () => {
    // 1 + 2 + 4 = 7 over 3 reviews = 2.333...
    const summary = summariseRatingCounts([
      { rating: 1, count: 1 },
      { rating: 2, count: 1 },
      { rating: 4, count: 1 },
    ])
    expect(summary.average).toBe(2.3)
  })

  it('leaves an impossible rating out of the average rather than shifting every star', () => {
    const summary = summariseRatingCounts([
      { rating: 5, count: 2 },
      { rating: 9, count: 1 },
      { rating: 0, count: 1 },
    ])
    expect(summary.count).toBe(2)
    expect(summary.average).toBe(5)
  })

  it('adds up the breakdown to the count it reports', () => {
    const summary = summariseRatingCounts([
      { rating: 5, count: 4 },
      { rating: 3, count: 2 },
      { rating: 1, count: 1 },
    ])
    const summed = ([1, 2, 3, 4, 5] as const).reduce((total, star) => total + summary.breakdown[star], 0)
    expect(summed).toBe(summary.count)
  })
})
