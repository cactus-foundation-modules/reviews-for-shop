'use client'

import { useState } from 'react'
import { OrderReviewForm } from '@/modules/reviews-for-shop/components/public/OrderReviewForm'
import { REVIEWS_CSS } from '@/modules/reviews-for-shop/components/public/reviews-css'
import type { RvwOrderPanelPayload } from '@/modules/reviews-for-shop/lib/types'

// The card on a customer's own finished order: a row per product, each waiting
// for a star.
//
// A client component because it holds the count of what has been done, and
// because shop hands a contributed panel its payload as an opaque `unknown` -
// this is where that becomes a shape again.
//
// The panel never disappears once every product has been reviewed. A card that
// tidied itself away the moment the last star went in would leave somebody who
// had just written three reviews looking at a page that had swallowed them.

export function OrderReviewsPanel({ payload }: { payload: unknown }) {
  const data = payload as RvwOrderPanelPayload
  // Reviews written in this sitting. The forms keep their own thank-you, so this
  // is only for the line at the top that counts down.
  const [done, setDone] = useState<string[]>([])

  const left = data.products.length - done.length
  const previously = data.alreadyReviewed

  // Nothing at all before the first star goes in: the card's heading has already
  // said what it wants, and a second sentence explaining how a row of stars works
  // is a sentence nobody needed. There is something to say once the count starts
  // moving, and once it reaches nought.
  const note =
    left === 0
      ? 'That is the lot - thank you. Your reviews help the next person decide.'
      : left === data.products.length
        ? null
        : `${left} to go, if you have the time.`

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REVIEWS_CSS }} />
      <div className="rvw-order">
        {(note || previously > 0) && (
          <p className="rvw-note">
            {note}
            {previously > 0 && (
              <>
                {note ? ' ' : ''}
                You have already reviewed {previously} {previously === 1 ? 'thing' : 'things'} from this order.
              </>
            )}
          </p>
        )}

        <div className="rvw-order-rows">
          {data.products.map((product) => (
            <OrderReviewForm
              key={product.id}
              orderId={data.orderId}
              product={product}
              rules={data.rules}
              onSent={(id) => setDone((current) => (current.includes(id) ? current : [...current, id]))}
            />
          ))}
        </div>
      </div>
    </>
  )
}
