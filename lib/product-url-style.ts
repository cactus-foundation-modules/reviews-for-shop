import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ProductUrlStyle } from '@/modules/shop/lib/product-url'

// Reads the shop's product URL style straight from its config rather than
// through a shop helper, so this module builds against shop v0.1.248 (where the
// helper sat in product-url.ts) and v0.1.249+ (where it moved to
// product-url-server.ts) alike. A site updating its modules one at a time
// passes through a moment where the two are out of step, and that moment should
// not be a failed deploy.
//
// Server-side only, by nature: it touches the database. Client files here must
// import productHref from shop's product-url and take the style as a prop - see
// scripts/check-client-graph.mjs in core for why that separation is load-bearing.
export async function getProductUrlStyle(): Promise<ProductUrlStyle> {
  return (await getShopConfigCached()).productUrlStyle
}
