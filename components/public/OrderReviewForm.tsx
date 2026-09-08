'use client'

import { useId, useState } from 'react'
import { ReviewStar } from '@/modules/reviews-for-shop/components/public/ReviewStars'
import type { RvwFormRules, RvwOrderReviewProduct } from '@/modules/reviews-for-shop/lib/types'

type Props = {
  orderId: string
  product: RvwOrderReviewProduct
  rules: RvwFormRules
  /** Told once this product has been reviewed, so the card can count down. */
  onSent: (productId: string) => void
}

/**
 * One product's rating on the order page.
 *
 * Nothing is asked for until a star has been picked. An order with five things on
 * it would otherwise open as five headline boxes, five comment boxes and five
 * buttons - a page of homework, which is a good way of getting no reviews at all.
 * Five rows of stars is a thing somebody might actually do on the way past, and
 * the box that asks why only turns up once they have said something worth
 * explaining.
 *
 * No name and no email box either, unlike the form on the product page. This form
 * is only ever rendered on an order the reader has already proved is theirs, so
 * the shop knows who they are; asking them to type it would be asking a question
 * it already has the answer to, and would let them answer it wrongly.
 */
export function OrderReviewForm({ orderId, product, rules, onSent }: Props) {
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [thanks, setThanks] = useState('')
  // Unique per rendered form: an order page carries one of these per product, and
  // a shared id would point every label at the first product's boxes and leave the
  // radio groups fighting over one name.
  const uid = useId()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (rating < 1) {
      setError('Please choose a rating first.')
      return
    }
    if (rules.minCommentLength > 0 && body.trim().length < rules.minCommentLength) {
      setError(`Please write at least ${rules.minCommentLength} characters so the review is of some use to the next person.`)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/m/reviews-for-shop/public/order-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, productId: product.id, rating, title, body }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Your review could not be saved. Please try again.')
      } else {
        setThanks(data.message || 'Thank you for your review.')
        onSent(product.id)
      }
    } catch {
      setError('Your review could not be saved. Please try again.')
    }
    setBusy(false)
  }

  if (thanks) {
    return (
      <div className="rvw-order-row rvw-order-done">
        <p className="rvw-order-name">{product.name}</p>
        <p className="rvw-thanks" role="status">{thanks}</p>
      </div>
    )
  }

  return (
    <form className="rvw-order-row" onSubmit={submit} noValidate>
      <p className="rvw-order-name">{product.name}</p>

      {/* A radio group rather than five buttons: it arrows left and right with
          the keyboard, announces itself as "1 of 5" to a screen reader, and
          names the product it belongs to rather than being the fourth
          unexplained row of stars on the page. */}
      <fieldset className="rvw-picker">
        <legend className="rvw-sr">Your rating for {product.name}</legend>
        <div className="rvw-picks">
          {[1, 2, 3, 4, 5].map((n) => (
            <label className={`rvw-pick ${n <= rating ? 'rvw-pick-on' : ''}`} key={n}>
              <input
                className="rvw-sr"
                type="radio"
                name={`${uid}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
              />
              <ReviewStar filled={n <= rating} />
              <span className="rvw-sr">{n} star{n === 1 ? '' : 's'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Everything below only once there is a rating to explain. */}
      {rating > 0 && (
        <div className="rvw-order-more">
          {rules.askForTitle && (
            <div className="rvw-field">
              <label htmlFor={`${uid}-title`}>Headline (optional)</label>
              <input
                id={`${uid}-title`}
                type="text"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          <div className="rvw-field">
            <label htmlFor={`${uid}-body`}>What did you make of it?</label>
            <textarea
              id={`${uid}-body`}
              value={body}
              maxLength={4000}
              required
              onChange={(e) => setBody(e.target.value)}
            />
            {rules.minCommentLength > 0 && (
              <p className="rvw-note">At least {rules.minCommentLength} characters, please.</p>
            )}
          </div>

          {error && <p className="rvw-error" role="alert">{error}</p>}

          <button className="rvw-submit" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send my review'}
          </button>
        </div>
      )}

      {/* The one error that can happen before a rating exists - somebody who has
          got here with the keyboard and pressed Enter. */}
      {rating < 1 && error && <p className="rvw-error" role="alert">{error}</p>}
    </form>
  )
}
