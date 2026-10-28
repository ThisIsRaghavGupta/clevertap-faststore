/**
 * Event names and per-event properties.
 *
 * CleverTap side — names and property lists are the CleverTap VTEX app's
 * frontend (pixel) events, so segments and reports read the same as in a
 * Store Framework store.
 *   src: docs.clevertap.com/docs/vtex-advanced-customization (fetched 2026-10-22)
 *
 * FastStore side — observed in @faststore/core 4.9.2 and 4.10.0 source: the
 * storefront itself only emits view_item_list, view_item, select_item,
 * add_to_cart, remove_from_cart, view_cart, search and page_view. The other GA4
 * names below are typed in @faststore/sdk but only fire if the store emits them
 * with sendAnalyticsEvent (or if a future FastStore version starts to).
 */

/** FastStore (GA4) event name → CleverTap VTEX app event name. `null` = not sent. */
export const DEFAULT_EVENT_MAP: Record<string, string | null> = {
  // Emitted natively by FastStore 4.9.x / 4.10.x
  search: 'Products Searched',
  view_item_list: 'Product List Viewed',
  view_item: 'Product Viewed',
  select_item: 'Product Clicked',
  add_to_cart: 'Product Added To Cart',
  remove_from_cart: 'Product Removed From Cart',
  view_cart: 'Cart Viewed',
  // Same custom event the CleverTap VTEX app pixel sends (react/modules/manageEvents.ts).
  page_view: 'Page Viewed',

  // Typed in @faststore/sdk, NOT emitted by FastStore core — fire only if the store emits them.
  view_promotion: 'Promotion Viewed',
  select_promotion: 'Promotion Clicked',
  add_to_wishlist: 'Product Added to Wishlist',
  share: 'Product Shared',
  begin_checkout: 'Checkout Started',
  // Docs write "Payment Info"; the app's Settings screen shows "Payment info".
  // CleverTap treated both as the same event in the Oct-2026 tests.
  add_payment_info: 'Payment Info',
  purchase: 'Order Created',
  // Not CleverTap events: identity is handled through onUserLogin.
  login: null,
  signup: null,
  refund: null,
  add_shipping_info: null,
}

const PRODUCT = ['product_id', 'sku', 'category', 'name', 'brand', 'variant', 'price', 'quantity', 'url', 'image_url']

/**
 * Documented properties of each CleverTap VTEX app frontend event.
 * src: docs.clevertap.com/docs/vtex-advanced-customization (fetched 2026-10-22)
 * Keys are lower-cased because CleverTap event names are case-insensitive
 * (observed: "Product Viewed" and "Product viewed" land on the same event).
 */
export const DOCUMENTED_PROPERTIES: Record<string, string[]> = {
  'products searched': ['keyword'],
  'product filtered by category': ['list_id', 'category'],
  'product list viewed': ['list_id', 'category'],
  'promotion viewed': ['promotion_id', 'name'],
  'promotion clicked': ['promotion_id', 'name'],
  'product viewed': PRODUCT,
  'product clicked': ['position', ...PRODUCT],
  'product added to cart': ['cart_id', ...PRODUCT, 'product_is_wishlisted'],
  'product removed from cart': ['cart_id', ...PRODUCT],
  'cart viewed': ['cart_id', 'items_qty', 'value', 'coupon'],
  'product added to wishlist': ['wishlist_id', 'wishlist_name', ...PRODUCT],
  'product removed from wishlist': ['wishlist_id', 'wishlist_name', ...PRODUCT],
  'product shared': ['share_via', ...PRODUCT],
  'order created': ['order_id', 'affiliation', 'value', 'revenue', 'shipping', 'tax', 'discount', 'coupon', 'payment_method', 'currency'],
  // checkout_id is a package extension: the orderForm id, the same value the app backend sends as checkout_id.
  'checkout started': ['checkout_id', 'order_id', 'affiliation', 'value', 'revenue', 'shipping', 'tax', 'discount', 'coupon', 'currency'],
  // Not in the docs table; properties follow the app pixel (react/modules/manageEvents.ts pageView).
  'page viewed': ['pageType', 'pageTitle', 'pageUrl'],
  'payment info': ['checkout_id', 'order_id', 'payment_method'],
  'checkout step viewed': ['checkout_id', 'step'],
  'checkout step completed': ['checkout_id', 'step'],
  'coupon applied': ['checkout_id', 'order_id', 'coupon_id'],
  'coupon denied': ['checkout_id', 'order_id', 'coupon_id', 'reason'],
}

/** Backend-only revenue event of the VTEX app. Never sent from the storefront by default. */
export const BACKEND_ONLY_EVENTS = ['charged']
