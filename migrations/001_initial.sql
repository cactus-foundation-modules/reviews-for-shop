-- reviews-for-shop schema. Every table is prefixed rvw_ and all DDL is idempotent
-- (IF NOT EXISTS) so this file is both the fresh-install schema and safe to
-- re-run. Later schema changes ship as new numbered files (002_*.sql, ...) rather
-- than edits here: editing this one in place only ever reaches fresh installs,
-- never the sites already running.

-- ---------------------------------------------------------------------------
-- Settings (one row, id = 'singleton')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "rvw_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',

    -- The moderation decision, and the one every owner asks about first. False
    -- (the default) holds each new review as PENDING until someone looks at it;
    -- true publishes on submission. Deliberately defaulting to moderation: a shop
    -- that turns it off has chosen to, whereas a shop that never opened this
    -- screen has not chosen to have unread text appear on its product pages.
    "auto_publish" BOOLEAN NOT NULL DEFAULT false,

    -- Who is allowed to leave one at all.
    --   ANYONE          - anybody who can see the product page
    --   MEMBERS         - signed-in members only (needs the Members system on)
    --   VERIFIED_BUYERS - the email given must match a paid order containing
    --                     this product
    "who_can_review" TEXT NOT NULL DEFAULT 'ANYONE',

    -- Where reviews appear on a product page without the owner building anything.
    --   TAB  - a Reviews tab in the product's own tab strip
    --   NONE - nowhere, for a shop that would rather place the Reviews block on
    --          its Product Detail layout by hand (two of them would mean the same
    --          reviews twice on one page)
    "product_surface" TEXT NOT NULL DEFAULT 'TAB',

    -- Show "Verified purchase" against reviews whose email matched a paid order.
    -- The match is recorded either way, so turning this back on later labels the
    -- reviews already collected rather than only the new ones.
    "show_verified_badge" BOOLEAN NOT NULL DEFAULT true,

    -- Ask the shopper for a one-line headline as well as the review itself.
    "ask_for_title" BOOLEAN NOT NULL DEFAULT true,

    -- Shortest review the form will accept, in characters. Stops "ok" being a
    -- review. 0 accepts anything.
    "min_comment_length" INTEGER NOT NULL DEFAULT 20,

    -- One review per product per email address. Not a security control (an email
    -- address is not proof of anything) - it is what keeps an enthusiastic
    -- customer from filling a product page on their own.
    "one_per_product_per_email" BOOLEAN NOT NULL DEFAULT true,

    -- Where to send the "a new review has arrived" note. Empty means send none.
    -- Nothing is sent if the site has no email provider configured either way.
    "notify_email" TEXT NOT NULL DEFAULT '',

    -- How many reviews a product page shows before "Show more".
    "reviews_per_page" INTEGER NOT NULL DEFAULT 10,

    -- What the shopper is told once their review is in. Two versions, because
    -- "thank you, it is now live" is a lie on a moderated shop and "thank you, we
    -- will check it first" is needless bureaucracy on one that publishes at once.
    "thanks_published" TEXT NOT NULL DEFAULT 'Thank you. Your review is now on the page.',
    "thanks_pending" TEXT NOT NULL DEFAULT 'Thank you. Your review has been sent to us and will appear once we have read it.',

    -- Email past customers asking them to review what they bought. Off by
    -- default: installing a module should never start writing to a customer list
    -- on its own.
    "invites_enabled" BOOLEAN NOT NULL DEFAULT false,
    -- How long after the order was paid to ask, in days. Long enough for the
    -- thing to have arrived and been used.
    "invite_delay_days" INTEGER NOT NULL DEFAULT 14,

    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rvw_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rvw_settings_who_can_review_check" CHECK ("who_can_review" IN ('ANYONE', 'MEMBERS', 'VERIFIED_BUYERS')),
    CONSTRAINT "rvw_settings_product_surface_check" CHECK ("product_surface" IN ('TAB', 'NONE'))
);

-- The single row every read expects. ON CONFLICT DO NOTHING so a re-run leaves an
-- owner's saved settings alone rather than resetting them.
INSERT INTO "rvw_settings" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- One review of one product by one person.
--
-- Cross-module foreign keys to shp_products and shp_orders are safe because shop
-- installs first (requiresModules), so both tables always exist. Deleting a
-- product takes its reviews with it (CASCADE) - a review of something the shop no
-- longer sells has nowhere to appear and nothing to be about. Deleting an order
-- only clears the link (SET NULL): the review itself is still the customer's own
-- words, and `verified_purchase` records that the order was there when it landed.
CREATE TABLE IF NOT EXISTS "rvw_reviews" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "product_id" TEXT NOT NULL,
    -- The member who wrote it, when a signed-in member did. No FK: the Members
    -- system is optional and a review outlives an account being closed.
    "member_id" TEXT,

    -- Snapshot of who wrote it, captured at submission rather than read live from
    -- a member record, so an account rename does not rewrite a two-year-old
    -- review. The email is never shown on the storefront - it is there for the
    -- verified-purchase match, the one-per-product rule and for replying.
    "author_name" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,

    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,

    -- PENDING (waiting for the owner) | PUBLISHED (on the page) | REJECTED (kept,
    -- but never shown). Rejected rather than deleted by default, so the same
    -- person cannot quietly resubmit the same thing and so an owner can see what
    -- they turned down.
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    -- Whether the email matched a paid order containing this product at the time
    -- of writing, and which order it was. Recorded even when the badge is turned
    -- off, so switching the badge on later does not leave old reviews unlabelled.
    "verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "order_id" TEXT,

    -- The shop's own answer, shown under the review. NULL until someone writes
    -- one; blanking it in the admin removes it again.
    "reply_body" TEXT,
    "reply_at" TIMESTAMP(3),

    -- The submitter's IP, kept for the spam trail only. Never shown anywhere.
    "submitted_ip" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- When it went live, which is not when it was written on a moderated shop.
    -- The storefront orders on this so a batch published together reads newest
    -- first by the shopper's reckoning.
    "published_at" TIMESTAMP(3),

    CONSTRAINT "rvw_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rvw_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "rvw_reviews_status_check" CHECK ("status" IN ('PENDING', 'PUBLISHED', 'REJECTED')),
    CONSTRAINT "rvw_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "rvw_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE SET NULL
);

-- The storefront's query: this product, published only, newest first.
CREATE INDEX IF NOT EXISTS "rvw_reviews_product_status_idx" ON "rvw_reviews" ("product_id", "status", "published_at");
-- The admin queue's query, and the reviews wall's.
CREATE INDEX IF NOT EXISTS "rvw_reviews_status_created_at_idx" ON "rvw_reviews" ("status", "created_at");
-- The one-per-product-per-email check.
CREATE INDEX IF NOT EXISTS "rvw_reviews_author_email_idx" ON "rvw_reviews" ("author_email");

-- ---------------------------------------------------------------------------
-- Review invitations
-- ---------------------------------------------------------------------------
-- One row per (order, product) we have asked about, so the nightly job can never
-- ask twice. The unique constraint is the guard rather than the query: two runs
-- overlapping would otherwise both read "not asked yet" and both send.
CREATE TABLE IF NOT EXISTS "rvw_invites" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    -- Where it went, kept so an owner can answer "did you ever email me?" after
    -- the order's address has been changed.
    "email" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rvw_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rvw_invites_order_product_key" UNIQUE ("order_id", "product_id"),
    CONSTRAINT "rvw_invites_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "rvw_invites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);
