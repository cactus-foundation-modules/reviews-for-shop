import type { EmailTemplateDef } from '@/lib/email/registry'

// This module's two emails, declared for core's single email editor
// (Settings > Emails). Core owns the wording, the on/off switch, the wrapper
// design and the sending; this file is only the defaults.
//
// `reviewBody`, `orderItems` and `productList` are markup lib/emails.ts
// assembles, with the shopper's own words escaped on the way in - hence rawTags.
// Every other tag is escaped by core, as normal.
//
// `productList` is the plain bulleted list the invitation used to carry. The
// default body now prints `orderItems` instead - shop's own order table, with a
// photograph against each line - but the old tag is still filled in, because an
// owner who rewrote this email before today still has it in their wording and an
// update that quietly emptied their only list of products would be worse than the
// bullets ever were.

export const reviewsEmailTemplates: EmailTemplateDef[] = [
  {
    key: 'reviews-for-shop.new-review',
    label: 'New review (admin alert)',
    subject: '{{siteName}}: new review {{pendingWord}}: {{productName}}',
    bodyHtml:
      '<p><strong>{{productName}}</strong> has a new review.</p><p>{{stars}} ({{rating}} out of 5) from {{authorName}}</p>{{#if hasTitle}}<p><strong>{{reviewTitle}}</strong></p>{{/if}}<blockquote>{{reviewBody}}</blockquote>{{#if isPending}}<p>It is waiting for you and is not on the site yet.</p>{{/if}}{{#if isPublished}}<p>It is already on the product page.</p>{{/if}}{{#if hasLink}}<p><a href="{{adminUrl}}">Open your reviews</a></p>{{/if}}',
    mergeTags: ['siteName', 'productName', 'stars', 'rating', 'authorName', 'reviewTitle', 'reviewBody', 'adminUrl', 'pendingWord'],
    rawTags: ['reviewBody'],
    transactional: false,
  },
  {
    key: 'reviews-for-shop.review-invite',
    label: 'Review invitation (to the customer)',
    subject: '{{inviteSubject}}',
    bodyHtml:
      '<p>Hello {{firstName}},</p><p>You ordered {{thisOrThese}} from us a little while ago (order {{orderNumber}}), and we would like to know how {{itOrThey}} got on:</p>{{orderItems}}{{#if hasOrderUrl}}<p><a href="{{orderUrl}}">Review your order</a> - every item on one page, and you can rate the lot in a minute.</p>{{/if}}<p>A couple of honest lines helps the next person decide. No obligation, and we would rather have the truth than the compliment.</p><p>Thank you,<br />{{siteName}}</p>',
    mergeTags: [
      'siteName', 'firstName', 'orderNumber', 'orderItems', 'orderUrl', 'hasOrderUrl', 'productList',
      'thisOrThese', 'itOrThey', 'inviteSubject',
    ],
    // A review invitation with no links in it is a letter asking a favour and
    // not saying of what. The table carries a link per line whatever else the
    // owner has done to the wording, which the order page button does not: that
    // one is only there on a COMPLETED order at a shop with order tracking on.
    requiredTags: ['orderItems'],
    rawTags: ['orderItems', 'productList'],
    transactional: false,
  },
]
