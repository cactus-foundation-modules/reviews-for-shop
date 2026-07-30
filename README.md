# Reviews for Shop

Customer reviews for the [Cactus](https://github.com/usersaynoso/cactus-foundation) shop. Shoppers rate a product out of five and say why, the ratings appear on the product page, and every review lands in an admin list where you publish it, answer it or bin it.

Requires the [shop](https://github.com/cactus-foundation-modules/shop) module (v0.1.144 or newer) and Cactus 0.5.793 or newer.

## What it does

- **A Reviews tab on the product page.** It sits in the product's own tab strip beside Description and Specification, dressed by whatever layout the page uses. The reviews are in the page itself rather than fetched afterwards, so a search engine reads them too.
- **Blocks, if you would rather place them yourself.** Three of them: **Product: Reviews** (the whole surface), **Product: Rating summary** (the star line, for under a title or beside a price), and **Shop: Reviews wall** (your latest reviews across every product, for a home page). Set "where reviews appear" to Nowhere if you are placing the Reviews block by hand, or the same reviews will be on the page twice.
- **Publish on your say-so, or straight away.** New reviews wait for you by default. One switch changes that.
- **Verified purchases.** A review whose email address matches a paid order for that product is badged as one. The match is recorded whether or not you show the badge, so switching it on later labels the reviews you have already collected.
- **Reviews limited to your customers, if you like.** Anyone, signed-in members only, or people who actually bought the thing.
- **Your own reply under any review.** The best answer to a three-star review is usually a good-natured one directly beneath it.
- **A note when one arrives.** To an address of your choosing. Leave it blank for none.
- **Asking past customers.** Optional, off by default: a nightly job emails customers a couple of weeks after their order went out, linking to what they bought. Nobody is asked twice about the same order, and nobody is asked about something they have already reviewed.

## Settings

**Shop settings → Reviews.**

| Setting | What it does |
| --- | --- |
| Publish new reviews straight away | Off: every review waits in Shop → Reviews. On: reviews go up as they are written. |
| Who may leave a review | Anyone, signed-in members only, or customers who bought it. |
| Shortest review you will accept | In characters. Stops "ok" counting as a review. 0 accepts anything. |
| One review per product per email | Keeps one keen customer from filling a product page on their own. |
| Where reviews appear | The Reviews tab, or nowhere because you are placing the block yourself. |
| Show a Verified purchase badge | Against reviews matched to a paid order. |
| Ask for a headline | A one-line summary above the review. Optional for the shopper either way. |
| Reviews shown before "Show more" | How many the product page draws at once. |
| Thank-you wording | Two versions: one for a review that went up, one for a review that is waiting. |
| Tell this address when a review arrives | Blank for no notices. Nothing is sent if the site has no email set up. |
| Ask past customers for a review | Off by default. Emails customers a while after their order. |
| How long after the order to ask | In days. Two weeks is a fair default. |

## Permissions

Two keys, both under Users → Roles:

- `reviews.access` - see the reviews list. This includes reviewers' email addresses.
- `reviews.manage` - publish, hold, turn down, reply, delete, and change the settings.

Shop's own keys are deliberately not accepted: whoever may edit the catalogue is not automatically allowed to read every reviewer's email or to put words on a product page in the shop's name. Grant both keys to the same role if you want that.

## What a "verified purchase" is and is not

It means: the email address on the review matches a paid, uncancelled order containing that product. Refunded orders count - the customer had the thing and formed a view of it, which is arguably the most honest review on the page.

It does not mean the reviewer proved who they are. Anyone can type a customer's email address. The badge and the customers-only setting are about keeping a product page honest, not about security, and nothing here grants access to anything.

## Shops with product options

If you have Shop Variations installed, each concrete variant is a hidden product row of its own, and that is what an order line records - not the product whose page the shopper was reading. Reviews belong on the page, so this module resolves those hidden rows back to their parent before deciding whether somebody bought the thing, and before asking them what they made of it. Three variants of one desk are one review page and one question, not three.

It does that through a seam Shop already publishes for the purpose, so this module does not require Shop Variations, does not read its tables, and carries on working if something else starts backing variants tomorrow.

## Storefront routes

| Route | Does |
| --- | --- |
| `GET /api/m/reviews-for-shop/public/reviews` | A product's reviews and star line, or the latest across the shop. |
| `POST /api/m/reviews-for-shop/public/reviews` | Takes a review. Rate limited per address. |
| `GET /api/m/reviews-for-shop/public/viewer` | Whether the browser asking is a signed-in member, for pre-filling the form. |

The viewer check is a route of its own on purpose. The Reviews tab is resolved while the product page renders, and a page that reads a session cookie can never be statically rendered again - one small request from the form costs far less than every product page on the shop going dynamic.

## Cron

One nightly job, `/api/m/reviews-for-shop/cron/review-invites` at 08:00, collected into `vercel.json` at build time like every other module's. It returns immediately unless review invitations are switched on, and it writes to at most 40 orders per run so the first run on a shop with years of history does not email everybody at once.

## Not included

- **Opening the Reviews tab from a link.** Invitation emails link to the product page and its `#reviews` anchor, which lands exactly where you want it when the Reviews block is on the page. With the tab, the shopper arrives at the product and clicks Reviews.

- **Photos with reviews.** A shopper uploading pictures is a media-library and moderation job of its own, and half-done it is worse than absent.
- **Star ratings on product cards in a grid.** Shop's card has no slot a module can contribute to yet, and reaching into shop to add one is exactly what module isolation is for.
- **Aggregate ratings in the product page's structured data.** Same reason: it belongs to whoever owns the product's structured data, not to this module.

## Licence

MIT.
