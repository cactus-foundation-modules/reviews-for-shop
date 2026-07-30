import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

// Permission gate for this module's admin surfaces, in the same shape shop's own
// requireShopUser has - so a route reads the same whichever module it belongs to.
//
// Two keys: reviews.access to read the queue, reviews.manage to publish, reply,
// delete or change the settings. Shop's own keys are deliberately NOT accepted
// here, following quote-for-shop: whoever is allowed to edit the catalogue is not
// automatically allowed to read every reviewer's email address or to put words on
// a product page in the shop's name. An owner who wants that grants both keys to
// the same role, which is a decision rather than an accident.
export type RvwPermissionKey = 'reviews.access' | 'reviews.manage'

export async function hasReviewsPermission(
  user: SessionUser,
  key: RvwPermissionKey,
  opts?: { allowAccess?: boolean },
): Promise<boolean> {
  if (await hasPermission(user, 'reviews.manage')) return true
  if (opts?.allowAccess && (await hasPermission(user, 'reviews.access'))) return true
  return hasPermission(user, key)
}

export async function requireReviewsUser(
  key: RvwPermissionKey,
  opts?: { allowAccess?: boolean },
): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: Response }> {
  const user = await getSessionFromCookie()
  if (!user) return { error: errorResponse('Not authenticated', 401) }
  if (!(await hasReviewsPermission(user, key, opts))) return { error: errorResponse('Forbidden', 403) }
  return { user }
}
