/**
 * Public configuration for the FastStore ↔ CleverTap integration.
 *
 * Everything here is serialised into an inline <script> and sent to the browser,
 * so it must only ever contain PUBLIC values. The CleverTap Account Passcode is
 * a backend credential (used by the VTEX app) and is never accepted here.
 */

/**
 * Region codes.
 * - Web SDK docs list eu1 (default), in1, sg1, us1, aps3, mec1.
 *   src: developer.clevertap.com/docs/web-quickstart-guide (fetched 2026-10-22)
 * - The VTEX app listing also offers sk1.
 *   src: apps.vtex.com/clevertappartnerbr-vtex-clevertap-app/p (fetched 2026-10-22)
 * - Observed in clevertap-web-sdk@3.1.0 source: the request host is
 *   `${region}.clevertap-prod.com`, or `eu1.clevertap-prod.com` when region is empty.
 * Any other string is passed through untouched (e.g. a dedicated region).
 */
export type CleverTapRegion = 'eu1' | 'in1' | 'sg1' | 'us1' | 'aps3' | 'mec1' | 'sk1' | (string & {})

/** What to do when a shopper who was identified in this browser logs out. */
export type SessionEndAction = 'none' | 'logout' | 'clear'

export interface ConsentConfig {
  /** Initial value of clevertap.privacy optOut. Default false. */
  optOut?: boolean
  /** Initial value of clevertap.privacy useIP. Default false. */
  useIP?: boolean
  /**
   * When true, the SDK script is NOT injected and no events are sent until
   * `window.CleverTapFastStore.grantConsent()` is called (wire it to the CMP).
   * Events that happen before consent are dropped, not queued. Default false.
   */
  waitForConsent?: boolean
}

export interface EventsConfig {
  /**
   * Overrides for the FastStore → CleverTap event-name map. Keys are FastStore
   * event names without the `store:` prefix (GA4 names such as `view_item`, or
   * custom names you emit with sendAnalyticsEvent). A value of `null` disables
   * the event. Merged on top of DEFAULT_EVENT_MAP.
   */
  map?: Record<string, string | null>
  /**
   * Only send the properties documented for each CleverTap VTEX app event.
   * Events not in the documented list are sent with every property we can
   * derive. Default true.
   */
  strictProperties?: boolean
  /**
   * CleverTap events that are skipped when their properties (ignoring `url`)
   * are identical to the last time that event was sent in this page session.
   * Default ['Cart Viewed'] — FastStore re-emits view_cart on every SPA
   * navigation while the cart drawer is open (observed in the Oct-2026 tests).
   */
  dedupeUntilChange?: string[]
  /**
   * Value of the `CT Source` property added to every event. The CleverTap VTEX
   * app adds 'CT Source': 'vtex' to all its events (observed in
   * clevertap-vtex-app react/lib/clevertap.ts), so the default keeps segments
   * that filter on it working. Set another value to tell storefronts apart, or
   * null to omit it.
   */
  ctSource?: string | null
  /**
   * Fill in cart_id, image_url and category from FastStore's own browser
   * stores (cart in IndexedDB, product page JSON-LD). Default true.
   */
  enrich?: boolean
  /** Send Checkout Started when the shopper clicks FastStore's checkout button. Default true. */
  checkoutStarted?: boolean
  /** Send Product Filtered By Category when a category filter is applied on a listing. Default true. */
  categoryFilters?: boolean
  /**
   * The frontend must never send Charged (the VTEX app sends it from the
   * backend). Mapping any event to "Charged" is refused unless this is true.
   */
  allowFrontendCharged?: boolean
}

export interface IdentityConfig {
  /** Read the FastStore session and call onUserLogin. Default true. */
  enabled?: boolean
  /**
   * Which value, if any, to send as the CleverTap `Identity` key in addition to
   * `Email`. Default 'email'. The CleverTap VTEX app backend uploads order events
   * with `identity` = the order's customer email (observed in
   * CleverTap/clevertap-vtex-app node/middlewares/oms/omsFilteredEvents.ts), so
   * Identity = email makes the storefront profile match it. Use 'none' to send
   * Email only (what the Store Framework pixel does), or 'userId' if the project
   * identifies shoppers by VTEX user ID.
   */
  identityFrom?: 'none' | 'email' | 'userId'
  /**
   * Action when a previously identified shopper's FastStore session no longer
   * has a person (logout). Default 'logout': the next visitor on that browser
   * does not inherit the profile. (In clevertap-web-sdk@3.1.0 source, logout()
   * flags the cached identity for reset; the same shopper logging in again is
   * matched to the same profile by identity.) The Store Framework pixel has no
   * logout handling.
   * `clevertap.logout()` / `clevertap.clear()` exist on the global in
   * clevertap-web-sdk@3.1.0 (observed in source) but their behaviour is not
   * described on developer.clevertap.com/docs/web-user-profiles — validate with
   * CleverTap before enabling in production.
   */
  onSessionEnd?: SessionEndAction
  /** Delays (ms) after page load at which the session is checked. */
  checkDelaysMs?: number[]
}

export interface CleverTapFastStoreConfig {
  /** CleverTap Project ID (a.k.a. Account ID). Public value. Must match the VTEX app. */
  accountId: string
  /** CleverTap region. Must match the VTEX app. Omit for eu1. */
  region?: CleverTapRegion
  /** Custom proxy domain. src: developer.clevertap.com/docs/web-custom-proxy-domain */
  targetDomain?: string
  /**
   * Web SDK script URL. Defaults to the CDN URL in the Web SDK quick start.
   * Point it at a self-hosted copy of clevertap-web-sdk/dist/clevertap.min.js
   * to pin a version.
   */
  sdkUrl?: string
  /** Sets clevertap.spa. Default true (FastStore navigates client-side). */
  spa?: boolean
  consent?: ConsentConfig
  events?: EventsConfig
  identity?: IdentityConfig
  /** Log every mapped event to the console and keep the last 50 in memory. */
  debug?: boolean
}

/** Fully-resolved config, as serialised into the page. */
export interface ResolvedConfig {
  accountId: string
  region: string
  targetDomain: string
  sdkUrl: string
  spa: boolean
  consent: Required<ConsentConfig>
  events: Required<Omit<EventsConfig, 'map'>> & { map: Record<string, string | null> }
  identity: Required<IdentityConfig>
  debug: boolean
}

/** src: developer.clevertap.com/docs/web-quickstart-guide (fetched 2026-10-22) */
export const DEFAULT_SDK_URL = 'https://d2r1yp2w7bby2u.cloudfront.net/js/clevertap.min.js'
