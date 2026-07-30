'use client'

import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/modules/shop/components/admin/dialogs'
import type { RvwReview, RvwStatus } from '@/modules/reviews-for-shop/lib/types'

// The moderation queue: Shop > Reviews. Everything an owner does with a review
// happens here - read it, publish it, hold it, turn it down, answer it, bin it.
//
// Deliberately one screen with filter chips rather than a tab per state: the job is
// "clear the waiting ones", and the count on the Waiting chip is the whole point of
// opening the page.

const PER_PAGE = 25

const card = {
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'var(--color-surface)',
  marginBottom: '1rem',
} as const

const chipRow = { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem', marginBottom: '1rem' }

const inputStyle = {
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg)',
  color: 'var(--color-fg)',
} as const

const mutedSmall = { fontSize: '0.8125rem', color: 'var(--color-text-muted)' } as const

type Filter = RvwStatus | 'ALL'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'PENDING', label: 'Waiting for you' },
  { key: 'PUBLISHED', label: 'On the site' },
  { key: 'REJECTED', label: 'Turned down' },
  { key: 'ALL', label: 'Everything' },
]

function chipStyle(active: boolean): React.CSSProperties {
  return {
    font: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0.4rem 0.75rem',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
    color: active ? 'var(--color-primary)' : 'var(--color-text)',
  }
}

// What the import route answers with. Kept next to the screen that draws it
// rather than in lib/types: nothing outside this panel has any use for it.
type ImportResult = { created: number; updated: number; skipped: number; errors: Array<{ row: number; reason: string }> }

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} style={{ color: 'var(--color-warning)', letterSpacing: '0.05em' }}>
      {'★'.repeat(rating)}
      <span style={{ color: 'var(--color-border-strong)' }}>{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

function statusLabel(status: RvwStatus): string {
  if (status === 'PUBLISHED') return 'On the site'
  if (status === 'PENDING') return 'Waiting'
  return 'Turned down'
}

export function ReviewsScreen() {
  const [filter, setFilter] = useState<Filter>('PENDING')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [reviews, setReviews] = useState<RvwReview[]>([])
  const [counts, setCounts] = useState<Record<RvwStatus, number>>({ PENDING: 0, PUBLISHED: 0, REJECTED: 0 })
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, confirmNode] = useConfirm()
  const [transferOpen, setTransferOpen] = useState(false)
  const [importStatus, setImportStatus] = useState<'PUBLISHED' | 'PENDING'>('PUBLISHED')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Nothing here sets state before the fetch has been awaited, so the effect below
  // never causes a cascading render on the pass that scheduled it.
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) })
    if (filter !== 'ALL') params.set('status', filter)
    if (query) params.set('search', query)
    try {
      const res = await fetch(`/api/m/reviews-for-shop/admin/reviews?${params.toString()}`)
      if (!res.ok) {
        setError('Could not load the reviews.')
        return
      }
      const data = (await res.json()) as { reviews: RvwReview[]; total: number; counts: Record<RvwStatus, number> }
      setError('')
      setReviews(data.reviews)
      setTotal(data.total)
      setCounts(data.counts)
      setSelected(new Set())
    } catch {
      setError('Could not load the reviews.')
    }
  }, [filter, page, query])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after awaiting the fetch
    void load()
  }, [load])

  async function act(id: string, patch: { status?: RvwStatus; reply?: string }) {
    setBusy(true)
    try {
      const res = await fetch(`/api/m/reviews-for-shop/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) setError('That change could not be saved.')
      else await load()
    } catch {
      setError('That change could not be saved.')
    }
    setBusy(false)
  }

  async function remove(review: RvwReview) {
    const ok = await confirm({
      title: 'Delete this review?',
      message: `${review.authorName}'s review of ${review.productName} will be gone for good. Turning it down instead keeps it here without showing it on the site.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/m/reviews-for-shop/admin/reviews/${review.id}`, { method: 'DELETE' })
      if (!res.ok) setError('That review could not be deleted.')
      else await load()
    } catch {
      setError('That review could not be deleted.')
    }
    setBusy(false)
  }

  async function bulk(action: 'publish' | 'hold' | 'reject' | 'delete') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (action === 'delete') {
      const ok = await confirm({
        title: `Delete ${ids.length} review${ids.length === 1 ? '' : 's'}?`,
        message: 'Gone for good. Turning them down instead keeps them here without showing them on the site.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/m/reviews-for-shop/admin/reviews/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      if (!res.ok) setError('Those reviews could not be changed.')
      else await load()
    } catch {
      setError('Those reviews could not be changed.')
    }
    setBusy(false)
  }

  async function importFile(file: File) {
    setImportBusy(true)
    setImportError('')
    setImportResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('defaultStatus', importStatus)
    try {
      const res = await fetch('/api/m/reviews-for-shop/admin/reviews/import', { method: 'POST', body: form })
      const data = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) setImportError(data.error ?? 'Those reviews could not be imported.')
      else {
        setImportResult(data)
        // The queue behind the panel is now out of date by however many reviews
        // just landed, and the counts on the chips with it.
        await load()
      }
    } catch {
      setImportError('Those reviews could not be imported.')
    }
    setImportBusy(false)
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div>
      {confirmNode}

      <div style={chipRow}>
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            style={chipStyle(filter === entry.key)}
            onClick={() => {
              setFilter(entry.key)
              setPage(1)
            }}
          >
            {entry.label}
            {entry.key !== 'ALL' && ` (${counts[entry.key]})`}
          </button>
        ))}
      </div>

      <form
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setQuery(search.trim())
        }}
      >
        <label htmlFor="rvw-search" className="sr-only" style={{ position: 'absolute', left: -9999 }}>
          Search reviews
        </label>
        <input
          id="rvw-search"
          type="search"
          placeholder="Search by product, reviewer or wording"
          style={{ ...inputStyle, minWidth: 280, flex: '1 1 280px' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
        {query && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch('')
              setQuery('')
              setPage(1)
            }}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginLeft: 'auto' }}
          aria-expanded={transferOpen}
          onClick={() => setTransferOpen((open) => !open)}
        >
          Import / export
        </button>
      </form>

      {transferOpen && (
        <section style={card}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Import / export</h2>

          <p style={{ ...mutedSmall, margin: '0 0 0.5rem' }}>
            The spreadsheet has one line per review, and one line for every product nobody has reviewed yet - those say
            &ldquo;No reviews yet&rdquo; where the review would be. Variations are left out: reviews belong to the
            product, not to the size or colour someone picked.
          </p>
          <a className="btn btn-secondary" href="/api/m/reviews-for-shop/admin/reviews/export" download>
            Download reviews spreadsheet
          </a>

          <hr style={{ border: 0, borderTop: '1px solid var(--color-border)', margin: '1rem 0' }} />

          <p style={{ ...mutedSmall, margin: '0 0 0.5rem' }}>
            Upload the same spreadsheet to bring reviews in. Type them into the empty rows, or paste in a list from
            wherever you kept them before. Rows that still have their review id are updated rather than added again, so
            you can send the same file back as many times as you like.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="rvw-import-status" style={mutedSmall}>
              Reviews with no status of their own
            </label>
            <select
              id="rvw-import-status"
              style={inputStyle}
              value={importStatus}
              disabled={importBusy}
              onChange={(e) => setImportStatus(e.target.value === 'PENDING' ? 'PENDING' : 'PUBLISHED')}
            >
              <option value="PUBLISHED">go straight on the site</option>
              <option value="PENDING">wait for you</option>
            </select>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <label htmlFor="rvw-import-file" style={{ ...mutedSmall, display: 'block', marginBottom: '0.25rem' }}>
              Choose a spreadsheet
            </label>
            <input
              id="rvw-import-file"
              type="file"
              accept=".csv,text/csv"
              disabled={importBusy}
              style={{ font: 'inherit', fontSize: '0.875rem' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Cleared so choosing the same file twice still fires a change -
                // which is exactly what someone does after fixing a bad row.
                e.target.value = ''
                if (file) void importFile(file)
              }}
            />
          </div>

          {importBusy && <p style={{ ...mutedSmall, marginBottom: 0 }}>Reading the file…</p>}

          {importError && (
            <div className="alert alert-danger" role="alert" style={{ marginTop: '0.75rem' }}>
              {importError}
            </div>
          )}

          {importResult && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem' }}>
                {importResult.created} added, {importResult.updated} updated, {importResult.skipped} left alone
                {importResult.errors.length > 0 ? `, ${importResult.errors.length} could not be read` : ''}.
              </p>
              {importResult.errors.length > 0 && (
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', ...mutedSmall, color: 'var(--color-danger)' }}>
                  {importResult.errors.slice(0, 50).map((entry) => (
                    <li key={entry.row}>
                      Row {entry.row}: {entry.reason}
                    </li>
                  ))}
                  {importResult.errors.length > 50 && <li>…and {importResult.errors.length - 50} more.</li>}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {selected.size > 0 && (
        <div style={{ ...card, display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.875rem' }}>
            {selected.size} selected
          </strong>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => bulk('publish')}>
            Publish
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => bulk('hold')}>
            Hold
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => bulk('reject')}>
            Turn down
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => bulk('delete')}>
            Delete
          </button>
        </div>
      )}

      {reviews.length === 0 ? (
        <section style={card}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {filter === 'PENDING'
              ? 'Nothing waiting. Either your customers are quiet or you are very much on top of things.'
              : 'No reviews here yet.'}
          </p>
        </section>
      ) : (
        reviews.map((review) => (
          <article key={review.id} style={card}>
            <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={selected.has(review.id)}
                onChange={() => toggle(review.id)}
                aria-label={`Select ${review.authorName}'s review`}
                style={{ marginTop: '0.3rem' }}
              />
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Stars rating={review.rating} />
                  <strong style={{ fontSize: '0.9375rem' }}>{review.authorName}</strong>
                  {review.verifiedPurchase && (
                    <span style={{ ...mutedSmall, color: 'var(--color-success)' }}>
                      Verified purchase{review.orderNumber ? ` · ${review.orderNumber}` : ''}
                    </span>
                  )}
                </div>
                <div style={mutedSmall}>
                  <a href={`/shop/products/${review.productSlug}`} target="_blank" rel="noopener noreferrer">
                    {review.productName}
                  </a>
                  {' · '}
                  {review.authorEmail}
                  {' · '}
                  {new Date(review.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <span style={{ ...mutedSmall, marginLeft: 'auto' }}>{statusLabel(review.status)}</span>
            </header>

            {review.title && <p style={{ margin: '0.75rem 0 0.25rem', fontWeight: 600 }}>{review.title}</p>}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {review.body}
            </p>

            {review.replyBody && replyingTo !== review.id && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  borderLeft: '3px solid var(--color-primary)',
                  background: 'var(--color-bg-subtle)',
                  fontSize: '0.875rem',
                }}
              >
                <strong style={{ display: 'block', ...mutedSmall }}>Your reply</strong>
                <span style={{ whiteSpace: 'pre-wrap' }}>{review.replyBody}</span>
              </div>
            )}

            {replyingTo === review.id ? (
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                <textarea
                  style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                  value={replyText}
                  maxLength={2000}
                  onChange={(e) => setReplyText(e.target.value)}
                  aria-label="Your reply"
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={async () => {
                      await act(review.id, { reply: replyText })
                      setReplyingTo(null)
                    }}
                  >
                    Save reply
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setReplyingTo(null)}>
                    Cancel
                  </button>
                  {review.replyBody && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={async () => {
                        await act(review.id, { reply: '' })
                        setReplyingTo(null)
                      }}
                    >
                      Remove reply
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <footer style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', flexWrap: 'wrap' }}>
                {review.status !== 'PUBLISHED' && (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(review.id, { status: 'PUBLISHED' })}>
                    Publish
                  </button>
                )}
                {review.status === 'PUBLISHED' && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(review.id, { status: 'PENDING' })}>
                    Take down
                  </button>
                )}
                {review.status !== 'REJECTED' && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(review.id, { status: 'REJECTED' })}>
                    Turn down
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setReplyingTo(review.id)
                    setReplyText(review.replyBody ?? '')
                  }}
                >
                  {review.replyBody ? 'Edit reply' : 'Reply'}
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(review)}>
                  Delete
                </button>
              </footer>
            )}
          </article>
        ))
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span style={mutedSmall}>
            Page {page} of {pages} · {total} review{total === 1 ? '' : 's'}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
