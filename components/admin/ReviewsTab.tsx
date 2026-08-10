import { getSessionFromCookie } from '@/lib/auth/session'
import { hasReviewsPermission } from '@/modules/reviews-for-shop/lib/access'
import { ReviewsScreen } from '@/modules/reviews-for-shop/components/admin/ReviewsScreen'

// This screen is a tab on Shop > Catalogue rather than a sidebar link of its own.
// The permission check stays here rather than leaning on the host's: this is a
// component, and one that renders whatever it is handed is a refactor away from
// showing the screen to a role that should never reach it.
export async function ReviewsTab() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasReviewsPermission(user, 'reviews.access', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to manage reviews.</div>

  return <ReviewsScreen />
}
