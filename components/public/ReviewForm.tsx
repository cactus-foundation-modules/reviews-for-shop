'use client'

import { useEffect, useState } from 'react'
import { ReviewStar } from '@/modules/reviews-for-shop/components/public/ReviewStars'
import type { RvwFormRules, RvwViewer } from '@/modules/reviews-for-shop/lib/types'

// Where a member signs in. Only ever shown as a link, and only on a shop that has
// limited reviews to members - a shop set to ANYONE never mentions accounts.
const MEMBER_LOGIN_PATH = '/cactus-account/login'

type Props = {
  productId: string
  rules: RvwFormRules
  // Called once a review has been accepted AND published (auto-publish shops), so
  // the list above the form can refetch and the shopper sees their own words land.
  // A held review changes nothing on the page, so nothing is refetched for one.
  onPublished?: () => void
}

/**
 * The write-a-review form.
 *
 * The rules it enforces are the server's rules, handed down rather than guessed
 * at: the same checks run again in the POST route, because a form is a
 * convenience and never a control. What it does with them is explain them up
 * front - a shopper should not write four paragraphs and then be told that only
 * customers may review.
 */
export function ReviewForm({ productId, rules, onPublished }: Props) {
  const [rating, setRating] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [thanks, setThanks] = useState('')
  // null until the answer is back. Asked for from the browser rather than
  // rendered into the page, so the product page itself never reads a cookie and
  // stays statically renderable - see RvwViewer.
  const [viewer, setViewer] = useState<RvwViewer | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await fetch('/api/m/reviews-for-shop/public/viewer')
        if (!res.ok || !live) return
        const data = (await res.json()) as RvwViewer
        if (!live) return
        setViewer(data)
        // Only ever pre-fills an empty box, so it cannot overwrite what a shopper
        // has already started typing while the request was out.
        setName((current) => current || data.name)
        setEmail((current) => current || data.email)
      } catch {
        // A form that cannot tell whether you are signed in still works for
        // anyone the shop lets review, so this failure is left silent.
        if (live) setViewer({ isMember: false, name: '', email: '' })
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const membersOnly = rules.whoCanReview === 'MEMBERS'
  const membersOnlyLockedOut = membersOnly && viewer !== null && !viewer.isMember

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
      const res = await fetch('/api/m/reviews-for-shop/public/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, name, email, title, body }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Your review could not be saved. Please try again.')
      } else {
        setThanks(data.message || 'Thank you for your review.')
        if (data.status === 'PUBLISHED') onPublished?.()
      }
    } catch {
      setError('Your review could not be saved. Please try again.')
    }
    setBusy(false)
  }

  if (thanks) {
    return (
      <p className="rvw-thanks" role="status">
        {thanks}
      </p>
    )
  }

  if (membersOnlyLockedOut) {
    return (
      <p className="rvw-note">
        Reviews here are written by account holders. <a href={MEMBER_LOGIN_PATH}>Sign in</a> and you can leave one.
      </p>
    )
  }

  // A members-only shop waits for the answer before drawing anything. Showing the
  // whole form and snatching it back a moment later would be worse than a pause.
  if (membersOnly && viewer === null) {
    return <p className="rvw-note">Checking your account…</p>
  }

  return (
    <form className="rvw-form" onSubmit={submit} noValidate>
      <h3>Write a review</h3>

      {rules.whoCanReview === 'VERIFIED_BUYERS' && (
        <p className="rvw-note">
          Reviews here are limited to customers, so please use the email address you ordered with.
        </p>
      )}

      {/* A radio group rather than five buttons: it arrows left and right with the
          keyboard, announces itself as "1 of 5" to a screen reader, and would
          still submit a rating with the JavaScript stripped out. */}
      <fieldset className="rvw-picker">
        <legend>Your rating</legend>
        <div className="rvw-picks">
          {[1, 2, 3, 4, 5].map((n) => (
            <label className={`rvw-pick ${n <= rating ? 'rvw-pick-on' : ''}`} key={n}>
              <input
                className="rvw-sr"
                type="radio"
                name="rvw-rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
              />
              <ReviewStar filled={n <= rating} />
              <span className="rvw-sr">
                {n} star{n === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rvw-row">
        <div className="rvw-field">
          <label htmlFor="rvw-name">Your name</label>
          <input
            id="rvw-name"
            type="text"
            value={name}
            maxLength={80}
            required
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="rvw-field">
          <label htmlFor="rvw-email">Your email</label>
          <input
            id="rvw-email"
            type="email"
            value={email}
            maxLength={200}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <p className="rvw-note">Your name appears with the review. Your email never does.</p>

      {rules.askForTitle && (
        <div className="rvw-field">
          <label htmlFor="rvw-title">Headline (optional)</label>
          <input id="rvw-title" type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}

      <div className="rvw-field">
        <label htmlFor="rvw-body">Your review</label>
        <textarea id="rvw-body" value={body} maxLength={4000} required onChange={(e) => setBody(e.target.value)} />
        {rules.minCommentLength > 0 && (
          <p className="rvw-note">At least {rules.minCommentLength} characters, please.</p>
        )}
      </div>

      {error && (
        <p className="rvw-error" role="alert">
          {error}
        </p>
      )}

      <button className="rvw-submit" type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send my review'}
      </button>
    </form>
  )
}
