# Changelog

## Unreleased

- Always call through the live `window.clevertap` global for `event.push`, privacy, and identity (avoids talking to the pre-load stub after `clevertap.min.js` replaces it).
- License set to MIT.

## 1.0.0 — 2026-10-22

First release. Author: Jose Luis Duarte Mesa.

- `<CleverTapScripts />` for FastStore `src/scripts/ThirdPartyScripts.tsx`: one SSR-safe inline script.
- Web SDK loader (CDN or self-hosted URL), region, proxy domain, `spa`, privacy flags.
- Bridge of FastStore analytics events to CleverTap VTEX app event names and documented properties, plus Page Viewed and `CT Source: vtex` like the app pixel.
- Enrichment from FastStore browser stores: `cart_id`, `image_url`, `category`.
- Checkout Started (checkout button click) and Product Filtered By Category (URL filters), which FastStore does not emit.
- Cart Viewed dedupe, Charged guard, same-origin message check, double-mount guard.
- Shopper identification from the FastStore session (`onUserLogin` with Identity = email, matching the app backend), logout handling.
- Consent gating (`waitForConsent` + `grantConsent()`).
