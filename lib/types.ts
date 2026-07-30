// Shapes shared by this module's server code, its admin screens and its
// storefront components. Anything in here that a storefront component reads has
// to be JSON-serialisable: it crosses the RSC boundary as a prop.

export type RvwStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED'
export type RvwWhoCanReview = 'ANYONE' | 'MEMBERS' | 'VERIFIED_BUYERS'
export type RvwProductSurface = 'TAB' | 'NONE'

export type RvwSettings = {
  autoPublish: boolean
  whoCanReview: RvwWhoCanReview
  productSurface: RvwProductSurface
  showVerifiedBadge: boolean
  askForTitle: boolean
  minCommentLength: number
  onePerProductPerEmail: boolean
  notifyEmail: string
  reviewsPerPage: number
  thanksPublished: string
  thanksPending: string
  invitesEnabled: boolean
  inviteDelayDays: number
}

// A review as the admin sees it: everything, email included.
export type RvwReview = {
  id: string
  productId: string
  productName: string
  productSlug: string
  memberId: string | null
  authorName: string
  authorEmail: string
  rating: number
  title: string | null
  body: string
  status: RvwStatus
  verifiedPurchase: boolean
  orderId: string | null
  orderNumber: string | null
  replyBody: string | null
  replyAt: string | null
  createdAt: string
  publishedAt: string | null
}

// A review as the storefront sees it. No email, no IP, no order id: a product
// page is public, and none of those three are the shopper's business.
export type RvwPublicReview = {
  id: string
  authorName: string
  rating: number
  title: string | null
  body: string
  verified: boolean
  replyBody: string | null
  createdAt: string
}

// A published review with the product it is about, for the site-wide wall.
export type RvwWallReview = RvwPublicReview & {
  productName: string
  productHref: string
}

// The star line: how many, what the average is, and how the ratings split. The
// breakdown is indexed 1 to 5 rather than 0 to 4 so the code that reads it says
// what it means.
export type RvwSummary = {
  count: number
  average: number
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>
}

// What the storefront needs to draw the form: the rules it must enforce, so a
// shopper is told about them before submitting rather than after.
export type RvwFormRules = {
  whoCanReview: RvwWhoCanReview
  askForTitle: boolean
  minCommentLength: number
}

// Who is looking, asked for by the form itself rather than carried in the page.
//
// Deliberately kept out of RvwFormRules: the Reviews tab is resolved while the
// product page renders, and a page that reads a session cookie can no longer be
// rendered statically. Whether this visitor is signed in is worth one small
// request from the browser; it is not worth making every product page dynamic.
export type RvwViewer = {
  isMember: boolean
  // Pre-fills the form so a signed-in shopper is not asked to type what the site
  // already knows. Empty strings for a visitor who is not signed in.
  name: string
  email: string
}

// The whole product-page payload: one fetch (or one server load) covers the
// summary, the page of reviews and the form's rules.
export type RvwProductPayload = {
  productId: string
  summary: RvwSummary
  reviews: RvwPublicReview[]
  total: number
  perPage: number
  showVerifiedBadge: boolean
  rules: RvwFormRules
}
