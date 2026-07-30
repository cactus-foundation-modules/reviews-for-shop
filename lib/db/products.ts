import { prisma } from '@/lib/db/prisma'

// The few fields this module ever needs about a product. Read straight out of
// shop's table rather than through shop's own product loader, which resolves
// prices, media, stock and tax that a review has no use for.
type ProductRow = { id: string; name: string; slug: string; status: string; catalogue_hidden: boolean | null }

export type RvwProductRef = { id: string; name: string; slug: string; publiclyVisible: boolean }

// The same line shop's own product page draws (app/public/shop/products/[slug]):
// ACTIVE and not hidden from the catalogue. Anything else has no page for a review
// to sit on, so this module treats it as absent rather than as private - which is
// also why the public route answers "not found" either way, instead of confirming
// which drafts exist.
function toRef(row: ProductRow): RvwProductRef {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    publiclyVisible: row.status === 'ACTIVE' && !row.catalogue_hidden,
  }
}

export async function findProductBySlug(slug: string): Promise<RvwProductRef | null> {
  const rows = await prisma.$queryRaw<ProductRow[]>`
    SELECT "id", "name", "slug", "status", "catalogue_hidden" FROM "shp_products" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows[0] ? toRef(rows[0]) : null
}

export async function findProductById(id: string): Promise<RvwProductRef | null> {
  const rows = await prisma.$queryRaw<ProductRow[]>`
    SELECT "id", "name", "slug", "status", "catalogue_hidden" FROM "shp_products" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? toRef(rows[0]) : null
}
