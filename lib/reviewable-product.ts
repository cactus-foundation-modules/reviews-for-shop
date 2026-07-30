import { getProductById } from '@/modules/shop/lib/db/products'
import { resolveAliasedProduct } from '@/modules/shop/lib/product-page-resolver'

// Which product a purchased line is a review OF.
//
// On a shop with options installed, an order line does not point at the product
// whose page the shopper was reading: shop-variations backs each concrete variant
// with its own catalogue-hidden child product row, and that child's id is what
// lands in shp_order_items. Reviews belong on the page, which is the parent.
//
// Miss this and every verified-purchase check on a variations shop comes back
// false, and review invitations never go out at all - the two features would look
// broken on precisely the shops that sell the most.
//
// Resolved through shop's own `shop.product-page-resolver` seam rather than by
// reading shop-variations' tables. That point exists to answer exactly this
// question ("whose page does this hidden row belong to?"), it is inert on a shop
// without options, and going through it means this module does not depend on
// shop-variations, does not name its tables, and keeps working if a different
// module starts backing variants tomorrow.

export type ReviewableProduct = { id: string; name: string; slug: string }

/**
 * Returns the product whose page carries reviews for `productId`, or null when
 * there is no such page (a draft, an archived row, or a hidden child whose parent
 * has since gone).
 *
 * `seen` is an optional memo shared across a batch - the invitation run resolves
 * dozens of lines at a time and orders repeat the same products.
 */
export async function resolveReviewableProduct(
  productId: string,
  seen?: Map<string, ReviewableProduct | null>,
): Promise<ReviewableProduct | null> {
  const cached = seen?.get(productId)
  if (cached !== undefined) return cached

  const resolved = await resolve(productId)
  seen?.set(productId, resolved)
  return resolved
}

async function resolve(productId: string): Promise<ReviewableProduct | null> {
  const product = await getProductById(productId)
  if (!product) return null

  // The ordinary case, and the only one on a shop without options.
  if (product.status === 'ACTIVE' && !product.catalogueHidden) {
    return { id: product.id, name: product.name, slug: product.slug }
  }

  // A hidden row: offer it to whichever module aliases hidden slugs to real pages.
  // Shop hands the resolver the slug and the row it found, exactly as its own
  // product page does.
  if (!product.catalogueHidden) return null
  const parent = await resolveAliasedProduct(product.slug, product)
  if (!parent || parent.status !== 'ACTIVE' || parent.catalogueHidden) return null
  return { id: parent.id, name: parent.name, slug: parent.slug }
}
