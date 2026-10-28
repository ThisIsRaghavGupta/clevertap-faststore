# @clevertap/faststore

CleverTap for **VTEX FastStore** storefronts. FastStore has no equivalent of the
CleverTap VTEX app's Store Framework pixel, so browser-side tracking has to live in
the storefront code. This package is that code in one import. It loads the CleverTap
Web SDK on the main thread (not Partytown). It translates FastStore's analytics events
into the CleverTap VTEX app's event names and documented properties, so segments and
reports read the same as on Store Framework. It also identifies logged-in shoppers
with `onUserLogin`. Order events, Charged and catalog sync stay with the CleverTap VTEX
app, which works from the VTEX backend and does not depend on the storefront.

Author: **Jose Luis Duarte Mesa**

> **Version 1.0.0.** Covered by unit and jsdom tests, and checked in Chromium in a
> Next 16 pages-router app that mounts the component the way FastStore 4.9.2 does.
> The first deployed-store validation happens in the pilot. Use the checklist in
> "Validate in a real store" below.

## Install

```bash
yarn add @clevertap/faststore
```

## Use

Create `src/scripts/ThirdPartyScripts.tsx` in the store repo (the FastStore v4
starter doesn't include it):

```tsx
import { CleverTapScripts } from '@clevertap/faststore'

const ThirdPartyScripts = () => (
  <>
    <CleverTapScripts
      accountId={process.env.NEXT_PUBLIC_CLEVERTAP_ACCOUNT_ID ?? ''}
      region={process.env.NEXT_PUBLIC_CLEVERTAP_REGION}
    />
  </>
)

export default ThirdPartyScripts
```

Restart `yarn dev` after creating the file. If you don't, FastStore returns a 500
error ("reading 'components'") until you delete `.next` and restart.

**Why one inline script and no hooks:** FastStore renders `ThirdPartyScripts` inside
`next/head` in `_app` (see `@faststore/core` `src/pages/_app.tsx`). It is only
server-rendered, so React effects never run there. Loading `clevertap-web-sdk` from
npm inside a hook fails for that reason. `<CleverTapScripts />` renders one
`<script>`, and all browser work happens inside it.

`accountId` and `region` must match the CleverTap app in **VTEX Admin › Apps › My
Apps › CleverTap › Settings**. If they differ, browsing and orders land in different
projects and never join in one profile. The Account Passcode is a backend credential
and is rejected if passed here.

> **Required app setting for FastStore:** in the CleverTap app, enable **Use Charged
> event only when order is approved**. With it enabled, the app backend sends Charged
> when the payment is approved. With it disabled, Charged is sent by the Store
> Framework pixel on the order-placed page, and the backend sends "Order Approved"
> instead. FastStore doesn't run that pixel, so a FastStore store with the option
> disabled gets **no Charged at all**. (Observed in CleverTap/clevertap-vtex-app
> 0.0.43: `node/middlewares/oms/omsFilteredEvents.ts` and
> `react/modules/manageEvents.ts`.)

## What it sends

| FastStore event | CleverTap event | Properties (as documented for the VTEX app) |
|---|---|---|
| `search` | Products Searched | keyword |
| `view_item_list` | Product List Viewed | list_id, category (shelf title) |
| `select_item` | Product Clicked | position + product props |
| `view_item` | Product Viewed | product_id, sku, name, brand, variant, price, quantity, url |
| `add_to_cart` | Product Added To Cart | product props |
| `remove_from_cart` | Product Removed From Cart | product props |
| `view_cart` | Cart Viewed | cart_id, items_qty, value (repeats with an identical payload are skipped) |
| `page_view` | Page Viewed | pageType, pageTitle, pageUrl (same as the app pixel) |

### Beyond the Store Framework pixel

FastStore keeps data in the browser that its analytics payload leaves out. The
package uses it to fill gaps (all on by default; see Options):

| Feature | How | Option |
|---|---|---|
| `cart_id` on cart events | FastStore cart in IndexedDB (`fs::cart`). It is the VTEX orderForm id, the same value the app backend sends as `checkout_id` | `events.enrich` |
| `image_url` on product and cart events | Cart item images, or the product page JSON-LD | `events.enrich` |
| `category` on Product Viewed | Product page JSON-LD (first breadcrumb) | `events.enrich` |
| **Checkout Started** | Click on FastStore's checkout button. Sends value, currency and `checkout_id`. Best effort, because the browser leaves for VTEX Checkout right after the click | `events.checkoutStarted` |
| **Product Filtered By Category** | A category filter added on a listing (FastStore keeps filters in the URL) | `events.categoryFilters` |
| Logout | `clevertap.logout()` when an identified shopper's session ends, so the next visitor on that browser does not inherit the profile | `identity.onSessionEnd` |

The first seven plus `page_view` are the only events FastStore 4.9.x and 4.10.x emit (checked in
the `@faststore/core` source). The package also maps `view_promotion`,
`select_promotion`, `add_to_wishlist`, `share`, `begin_checkout`, `add_payment_info`
and `purchase`, but FastStore never fires those. They only arrive if the store emits
them itself with `sendAnalyticsEvent`. Checkout runs on VTEX Checkout, outside
FastStore.

FastStore's payload doesn't include `image_url`, `cart_id`, `category` (on product
events) or `product_is_wishlisted`. If a store adds them to its own events, they are
picked up.

**Charged is never sent from the storefront.** The VTEX app sends it from the backend.
Mapping an event to Charged throws an error unless `events.allowFrontendCharged` is
set.

Every event also carries `'CT Source': 'vtex'`, the same property the CleverTap VTEX
app adds to all its events. Change it with `events.ctSource`, or pass `null` to omit
it.

## Options

| Option | Default | Notes |
|---|---|---|
| `accountId` | required | CleverTap Project ID |
| `region` | none (= eu1) | `eu1`, `in1`, `sg1`, `us1`, `aps3`, `mec1`, `sk1`… |
| `targetDomain` | none | custom proxy domain |
| `sdkUrl` | CleverTap CDN | point it at a self-hosted `clevertap-web-sdk/dist/clevertap.min.js` to pin a version |
| `spa` | `true` | |
| `consent.optOut` / `consent.useIP` | `false` / `false` | initial privacy flags |
| `consent.waitForConsent` | `false` | when true: no SDK and no events until `grantConsent()`; events before that are dropped |
| `events.map` | see above | override or add mappings; `null` disables an event |
| `events.strictProperties` | `true` | send only documented properties |
| `events.dedupeUntilChange` | `['Cart Viewed']` | |
| `events.ctSource` | `'vtex'` | value of the `CT Source` property on every event; `null` omits it |
| `events.enrich` | `true` | add `cart_id`, `image_url` and `category` from FastStore's browser stores |
| `events.checkoutStarted` | `true` | send Checkout Started on the checkout button click |
| `events.categoryFilters` | `true` | send Product Filtered By Category when a category filter is added |
| `identity.enabled` | `true` | reads the FastStore session (IndexedDB `keyval-store` / `fs::session`) |
| `identity.identityFrom` | `'email'` | sends `Identity` = email, matching the app backend, which uploads order events with `identity` = the order's email. `'none'` sends Email only (like the Store Framework pixel); `'userId'` uses the VTEX user ID |
| `identity.onSessionEnd` | `'logout'` | on logout, calls `clevertap.logout()` (or `clear()`); `'none'` disables it |
| `debug` | `false` | logs each event and keeps the last 50 in `CleverTapFastStore.getLog()` |

Browser API (`window.CleverTapFastStore`): `grantConsent({ useIP })`,
`setConsent({ optOut, useIP })`, `track(name, props)`, `identify()`, `getLog()`,
`flush()`, `version`.

Identity details: `onUserLogin` is called once per shopper per browser per 24 h with
`Identity`, `Email`, `Name`, `First Name` and `Last Name`. Only an FNV-1a hash is kept in
localStorage, never the email. `MSG-*` subscription flags are never sent; set them
only from the store's real consent capture.

## Web Push

Pop-ups, native display and web inbox work once the SDK is loaded. Web Push also
needs `clevertap_sw.js` served from the site root. In FastStore, put it in `public/`
and check that `https://<store>/clevertap_sw.js` responds. Its content is the one
line the CleverTap VTEX app also uses in its service worker:

```js
importScripts('https://s3-eu-west-1.amazonaws.com/static.wizrocket.com/js/sw_webpush.js')
```

You also need the channel configured in the dashboard. See
developer.clevertap.com/docs/web-push. Web Push hasn't been tested on FastStore yet.

## Validate in a real store

Run these with `debug` on in a deployed preview, with the CleverTap debugger open:

1. In Network, requests go to `{region}.clevertap-prod.com`.
2. Opening a product sends Product Viewed. Add to cart sends Product Added To Cart and
   Cart Viewed. Navigating with the cart drawer open does not repeat Cart Viewed.
3. A shopper who logs in is identified, and their anonymous history stays on the same
   profile.
4. A paid order from that shopper produces exactly one Charged **on the same
   profile** as the browsing events. This is the check that proves the integration
   works. Check that the profile's identity is the shopper's real email, not a VTEX
   masked alias ending in `ct.vtex.com.br`.
5. With `waitForConsent`, nothing is sent before consent.

## Develop

```bash
pnpm install
pnpm test        # unit + jsdom tests
pnpm simulate    # replays synthetic FastStore events, prints the CleverTap queue
pnpm verify      # typecheck + test + build + tarball content check
```

## Publishing (team)

1. Confirm the npm scope. Publishing under `@clevertap` needs a member of that npm
   org. Rename `name` in `package.json` if a different scope is used, and update
   the imports in the README and examples.
2. Set the license. `package.json` ships `"license": "UNLICENSED"` until the team
   decides.
3. Run `pnpm install && pnpm verify`. This runs the typecheck, the tests, the build
   and a check of the tarball contents (no unexpected files, no emails or
   project-ID-shaped tokens).
4. Run `npm publish` (`publishConfig.access` is `public`). From CI, add
   `--provenance`.

## Sources

- docs.clevertap.com/docs/vtex: app install and settings (fetched 2026-10-22)
- docs.clevertap.com/docs/vtex-advanced-customization: event names and properties,
  backend events, profile properties (fetched 2026-10-22)
- developer.clevertap.com/docs/web-quickstart-guide: snippet, CDN URL, regions,
  `spa`, privacy flags (fetched 2026-10-22)
- developer.clevertap.com/docs/web-user-profiles: `onUserLogin` semantics (fetched
  2026-10-22)
- developer.clevertap.com/docs/web-push: `clevertap_sw.js` at the root (fetched
  2026-10-22)
- CleverTap/clevertap-vtex-app 0.0.43 (public repository): backend order events,
  identity, Charged setting, pixel events, catalog sync
- Checked in source, not documented: `clevertap-web-sdk@3.1.0` (region →
  `{region}.clevertap-prod.com`, `account[1..2]`, `logout()`/`clear()`), and
  `@faststore/core`/`@faststore/sdk` 4.9.2 and 4.10.0 (events emitted, message
  wrapper, session store, `ThirdPartyScripts` in `next/head`)
