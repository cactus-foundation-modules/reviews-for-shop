import { prisma } from '@/lib/db/prisma'
import type { RvwProductSurface, RvwSettings, RvwWhoCanReview } from '@/modules/reviews-for-shop/lib/types'

// The defaults are duplicated from the migration's column defaults on purpose:
// this is what a read returns when the singleton row is somehow missing (a module
// installed but not yet migrated, most likely), and a page that draws itself with
// sensible defaults beats one that throws while the deploy catches up.
const DEFAULTS: RvwSettings = {
  autoPublish: false,
  whoCanReview: 'ANYONE',
  productSurface: 'TAB',
  showVerifiedBadge: true,
  askForTitle: true,
  minCommentLength: 20,
  onePerProductPerEmail: true,
  notifyEmail: '',
  reviewsPerPage: 10,
  thanksPublished: 'Thank you. Your review is now on the page.',
  thanksPending: 'Thank you. Your review has been sent to us and will appear once we have read it.',
  invitesEnabled: false,
  inviteDelayDays: 14,
}

export function reviewsSettingsDefaults(): RvwSettings {
  return { ...DEFAULTS }
}

export async function getSettings(): Promise<RvwSettings> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "rvw_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  const row = rows[0]
  if (!row) return { ...DEFAULTS }
  return {
    autoPublish: (row.auto_publish as boolean) ?? DEFAULTS.autoPublish,
    whoCanReview: (row.who_can_review as RvwWhoCanReview) ?? DEFAULTS.whoCanReview,
    productSurface: (row.product_surface as RvwProductSurface) ?? DEFAULTS.productSurface,
    showVerifiedBadge: (row.show_verified_badge as boolean) ?? DEFAULTS.showVerifiedBadge,
    askForTitle: (row.ask_for_title as boolean) ?? DEFAULTS.askForTitle,
    minCommentLength: Number(row.min_comment_length ?? DEFAULTS.minCommentLength),
    onePerProductPerEmail: (row.one_per_product_per_email as boolean) ?? DEFAULTS.onePerProductPerEmail,
    notifyEmail: (row.notify_email as string) ?? DEFAULTS.notifyEmail,
    reviewsPerPage: Number(row.reviews_per_page ?? DEFAULTS.reviewsPerPage),
    thanksPublished: (row.thanks_published as string) ?? DEFAULTS.thanksPublished,
    thanksPending: (row.thanks_pending as string) ?? DEFAULTS.thanksPending,
    invitesEnabled: (row.invites_enabled as boolean) ?? DEFAULTS.invitesEnabled,
    inviteDelayDays: Number(row.invite_delay_days ?? DEFAULTS.inviteDelayDays),
  }
}

/**
 * Patches the singleton. One statement of COALESCEd bound parameters rather than
 * a built string of SET clauses: the thank-you wording and the notification
 * address are free text an admin typed, and a hand-assembled UPDATE is exactly
 * where that goes wrong.
 *
 * Absent means "leave alone" throughout, which is what the COALESCE says. An
 * empty string is a value like any other and passes straight through, so
 * clearing the notification address (the form's way of saying "send none") and
 * blanking a thank-you line both work.
 */
export async function updateSettings(fields: Partial<RvwSettings>): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rvw_settings" SET
      "auto_publish" = COALESCE(${fields.autoPublish ?? null}::boolean, "auto_publish"),
      "who_can_review" = COALESCE(${fields.whoCanReview ?? null}::text, "who_can_review"),
      "product_surface" = COALESCE(${fields.productSurface ?? null}::text, "product_surface"),
      "show_verified_badge" = COALESCE(${fields.showVerifiedBadge ?? null}::boolean, "show_verified_badge"),
      "ask_for_title" = COALESCE(${fields.askForTitle ?? null}::boolean, "ask_for_title"),
      "min_comment_length" = COALESCE(${fields.minCommentLength ?? null}::integer, "min_comment_length"),
      "one_per_product_per_email" = COALESCE(${fields.onePerProductPerEmail ?? null}::boolean, "one_per_product_per_email"),
      "notify_email" = COALESCE(${fields.notifyEmail ?? null}::text, "notify_email"),
      "reviews_per_page" = COALESCE(${fields.reviewsPerPage ?? null}::integer, "reviews_per_page"),
      "thanks_published" = COALESCE(${fields.thanksPublished ?? null}::text, "thanks_published"),
      "thanks_pending" = COALESCE(${fields.thanksPending ?? null}::text, "thanks_pending"),
      "invites_enabled" = COALESCE(${fields.invitesEnabled ?? null}::boolean, "invites_enabled"),
      "invite_delay_days" = COALESCE(${fields.inviteDelayDays ?? null}::integer, "invite_delay_days"),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'singleton'
  `
}
