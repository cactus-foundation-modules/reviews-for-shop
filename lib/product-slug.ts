// Which product a storefront island is sitting on. Shop hands its server-side
// `_ctx` only to its own detail parts, so a block contributed by another module
// has to work the product out for itself - and the URL is the one thing every
// product page agrees on. Same approach advanced-shipping-for-shop takes, kept in
// one place here so a change to shop's product URLs is a one-line change.
//
// The Reviews TAB does not need any of this: shop hands the tab provider the
// product id server-side. This is only for the blocks, which shop knows nothing
// about.
export function slugFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const parts = window.location.pathname.split('/').filter(Boolean)
  const idx = parts.indexOf('products')
  const slug = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1]
  return slug || null
}
