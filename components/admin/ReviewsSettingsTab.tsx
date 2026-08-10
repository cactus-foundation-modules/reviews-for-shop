'use client'

import { useEffect, useState } from 'react'
import type { RvwSettings } from '@/modules/reviews-for-shop/lib/types'

// A sub-tab of shop's settings tab rather than a top-level Settings tab, hosted
// through the 'shop.settings-sub-tabs' slot (manifest `host`). Shop lends the space
// and nothing else: own fetch, own save, own permission, own module API. Shop's
// "Save settings" button stands down while this is showing.

const card = {
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'var(--color-surface)',
  marginBottom: '1.25rem',
} as const

const legend = { fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.25rem' } as const
const hint = { display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' } as const
const field = { display: 'grid', gap: '0.25rem', marginBottom: '1rem' } as const
const input = {
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg)',
  color: 'var(--color-fg)',
  maxWidth: 420,
} as const

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: '0.2rem' }} />
        <span>
          <span style={{ display: 'block', color: 'var(--color-text)' }}>{label}</span>
          <span style={hint}>{detail}</span>
        </span>
      </label>
    </div>
  )
}

export function ReviewsSettingsTab() {
  const [settings, setSettings] = useState<RvwSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/m/reviews-for-shop/admin/settings')
      .then((r) => r.json())
      .then((d: { settings?: RvwSettings }) => {
        if (d.settings) setSettings(d.settings)
      })
      .catch(() => setError('Could not load these settings. Please refresh the page.'))
  }, [])

  function patch<K extends keyof RvwSettings>(key: K, value: RvwSettings[K]) {
    setSaved(false)
    setSettings((current) => (current ? { ...current, [key]: value } : current))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/m/reviews-for-shop/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save these settings.')
      } else {
        if (data.settings) setSettings(data.settings)
        setSaved(true)
      }
    } catch {
      setError('Could not save these settings.')
    }
    setSaving(false)
  }

  if (!settings) {
    return <p style={{ color: 'var(--color-text-secondary)' }}>{error || 'Loading…'}</p>
  }

  return (
    <form onSubmit={save}>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
        How customer reviews are collected, checked and shown on your shop.
      </p>

      <section style={card}>
        <h3 style={legend}>Before they appear</h3>
        <Toggle
          label="Publish new reviews straight away"
          detail="Leave this off and every review waits in Shop > Reviews until you say so. Turn it on and reviews go up the moment they are written, which is faster and rather more exciting."
          checked={settings.autoPublish}
          onChange={(v) => patch('autoPublish', v)}
        />

        <div style={field}>
          <label htmlFor="rvw-who" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Who may leave a review
          </label>
          <select
            id="rvw-who"
            style={input}
            value={settings.whoCanReview}
            onChange={(e) => patch('whoCanReview', e.target.value as RvwSettings['whoCanReview'])}
          >
            <option value="ANYONE">Anyone who can see the product</option>
            <option value="MEMBERS">Signed-in members only</option>
            <option value="VERIFIED_BUYERS">Customers who bought it only</option>
          </select>
          <span style={hint}>
            Customers are matched on the email address they ordered with. It is not proof of identity - nothing here is -
            but it does keep a product page to the people who have actually had the thing.
          </span>
        </div>

        <div style={field}>
          <label htmlFor="rvw-min" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Shortest review you will accept (characters)
          </label>
          <input
            id="rvw-min"
            type="number"
            min={0}
            max={1000}
            style={{ ...input, maxWidth: 140 }}
            value={settings.minCommentLength}
            onChange={(e) => patch('minCommentLength', Math.max(0, Number(e.target.value) || 0))}
          />
          <span style={hint}>Stops &quot;ok&quot; counting as a review. Set it to 0 to accept anything.</span>
        </div>

        <Toggle
          label="One review per product per email address"
          detail="Keeps one enthusiastic customer from filling a product page on their own."
          checked={settings.onePerProductPerEmail}
          onChange={(v) => patch('onePerProductPerEmail', v)}
        />
      </section>

      <section style={card}>
        <h3 style={legend}>On the shop</h3>
        <div style={field}>
          <label htmlFor="rvw-surface" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Where reviews appear on a product page
          </label>
          <select
            id="rvw-surface"
            style={input}
            value={settings.productSurface}
            onChange={(e) => patch('productSurface', e.target.value as RvwSettings['productSurface'])}
          >
            <option value="TAB">In a Reviews tab, beside Description</option>
            <option value="NONE">Nowhere - I will place the Reviews block myself</option>
          </select>
          <span style={hint}>
            The tab needs nothing building and puts the reviews in the page itself, which search engines read. Choose
            Nowhere only if you are placing the Reviews block on your Product Detail layout by hand, or you will have the
            same reviews on the page twice.
          </span>
        </div>

        <Toggle
          label="Show a Verified purchase badge"
          detail="Against reviews whose email matched a paid order. The match is recorded either way, so switching this on later labels the reviews you have already collected too."
          checked={settings.showVerifiedBadge}
          onChange={(v) => patch('showVerifiedBadge', v)}
        />
        <Toggle
          label="Ask for a headline as well as the review"
          detail="A one-line summary above the review itself. Optional for the shopper either way."
          checked={settings.askForTitle}
          onChange={(v) => patch('askForTitle', v)}
        />

        <div style={field}>
          <label htmlFor="rvw-per-page" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Reviews shown before &quot;Show more&quot;
          </label>
          <input
            id="rvw-per-page"
            type="number"
            min={1}
            max={50}
            style={{ ...input, maxWidth: 140 }}
            value={settings.reviewsPerPage}
            onChange={(e) => patch('reviewsPerPage', Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
      </section>

      <section style={card}>
        <h3 style={legend}>What the shopper is told</h3>
        <div style={field}>
          <label htmlFor="rvw-thanks-live" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            After a review that goes up straight away
          </label>
          <input
            id="rvw-thanks-live"
            type="text"
            maxLength={300}
            style={{ ...input, maxWidth: '100%' }}
            value={settings.thanksPublished}
            onChange={(e) => patch('thanksPublished', e.target.value)}
          />
        </div>
        <div style={field}>
          <label htmlFor="rvw-thanks-held" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            After a review that waits for you
          </label>
          <input
            id="rvw-thanks-held"
            type="text"
            maxLength={300}
            style={{ ...input, maxWidth: '100%' }}
            value={settings.thanksPending}
            onChange={(e) => patch('thanksPending', e.target.value)}
          />
        </div>
      </section>

      <section style={card}>
        <h3 style={legend}>Emails</h3>
        <div style={field}>
          <label htmlFor="rvw-notify" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Tell this address when a review arrives
          </label>
          <input
            id="rvw-notify"
            type="email"
            maxLength={200}
            placeholder="you@yourshop.co.uk"
            style={input}
            value={settings.notifyEmail}
            onChange={(e) => patch('notifyEmail', e.target.value)}
          />
          <span style={hint}>Leave it empty for no notices. Nothing is sent if your site has no email set up.</span>
        </div>

        <Toggle
          label="Ask past customers for a review"
          detail="One email per order, a while after it went out, linking to what they bought. Nothing is ever sent to someone who has already reviewed the product, and nobody is asked twice about the same order."
          checked={settings.invitesEnabled}
          onChange={(v) => patch('invitesEnabled', v)}
        />
        <div style={field}>
          <label htmlFor="rvw-delay" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            How long after the order to ask (days)
          </label>
          <input
            id="rvw-delay"
            type="number"
            min={0}
            max={365}
            style={{ ...input, maxWidth: 140 }}
            value={settings.inviteDelayDays}
            onChange={(e) => patch('inviteDelayDays', Math.min(365, Math.max(0, Number(e.target.value) || 0)))}
          />
          <span style={hint}>Long enough for the thing to have arrived and been used. Two weeks is a fair default.</span>
        </div>
      </section>

      {error && <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>}
      {saved && !error && <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Saved.</p>}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
