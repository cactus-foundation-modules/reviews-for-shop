import { getSessionFromCookie } from '@/lib/auth/session'
import { hasReviewsPermission } from '@/modules/reviews-for-shop/lib/access'
import { ReviewsScreen } from '@/modules/reviews-for-shop/components/admin/ReviewsScreen'

export const metadata = { title: 'Reviews — Admin' }

export default async function ReviewsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasReviewsPermission(user, 'reviews.access', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to manage reviews.</div>

  return <ReviewsScreen />
}
