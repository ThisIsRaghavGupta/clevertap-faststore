/**
 * Pure translation from a FastStore analytics event to a CleverTap event.
 * No DOM access here (url is injected) so it is trivially unit-testable.
 */
import { DOCUMENTED_PROPERTIES } from '../events'

export type Scalar = string | number | boolean
export type Props = Record<string, Scalar>

export interface MappedEvent {
  name: string
  props: Props
}

const isScalar = (v: unknown): v is Scalar =>
  (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean'

/**
 * Builds every CleverTap property we can derive from GA4-shaped params.
 *
 * Field sources (observed in @faststore/core 4.9.2 payload builders):
 *   item_id = product group id, item_variant = SKU id, item_variant_name = SKU name,
 *   index = position, item_list_name/item_list_id = shelf title. FastStore does
 *   not send item_category, image_url or a cart id; they are read if a store
 *   adds them to its own events.
 *
 * CleverTap event properties must be scalars, so for multi-item events the
 * first item is used plus `items_qty` (number of line items).
 */
export function deriveProps(params: Record<string, any>, url: string, ctName: string): Props {
  const items: any[] = Array.isArray(params.items) ? params.items : []
  const first = items[0] ?? {}
  const isPromotion = /^promotion /i.test(ctName)

  const candidate: Record<string, unknown> = {
    product_id: first.item_id,
    sku: first.item_variant,
    name: isPromotion ? params.promotion_name ?? first.promotion_name : first.item_name,
    brand: first.item_brand,
    category: first.item_category ?? params.item_list_name,
    variant: first.item_variant_name,
    price: first.price,
    quantity: items.length ? first.quantity ?? 1 : undefined,
    image_url: first.image_url ?? params.image_url,
    position: first.index,
    url,
    cart_id: params.cart_id,
    product_is_wishlisted: first.product_is_wishlisted,
    wishlist_id: params.wishlist_id,
    wishlist_name: params.wishlist_name,
    list_id: params.item_list_id,
    items_qty: items.length || undefined,
    value: params.value,
    revenue: params.revenue,
    currency: params.currency ?? first.currency,
    coupon: params.coupon,
    discount: isPromotion ? undefined : params.discount ?? first.discount,
    keyword: params.search_term,
    promotion_id: params.promotion_id ?? first.promotion_id,
    share_via: params.method,
    payment_method: params.payment_type,
    order_id: params.transaction_id ?? params.order_id,
    checkout_id: params.checkout_id,
    affiliation: params.affiliation,
    shipping: params.shipping,
    tax: params.tax,
    step: params.step,
    coupon_id: params.coupon_id,
    reason: params.reason,
    pageTitle: params.page_title,
    pageUrl: params.page_location,
    pageType: /^page viewed$/i.test(ctName) ? pageTypeOf(params.page_location || url) : undefined,
  }

  const props: Props = {}
  for (const [k, v] of Object.entries(candidate)) if (isScalar(v)) props[k] = v
  return props
}

/** Page type labels as the app pixel uses them (home, search, product), plus "other". */
export function pageTypeOf(href: string): string {
  try {
    const path = new URL(href).pathname.replace(/\/+$/, '') || '/'
    if (path === '/') return 'home'
    if (path === '/s' || path.endsWith('/s')) return 'search'
    if (path.endsWith('/p')) return 'product'
  } catch {
    /* ignore */
  }
  return 'other'
}

export function filterDocumented(ctName: string, props: Props): Props {
  const allowed = DOCUMENTED_PROPERTIES[ctName.toLowerCase()]
  if (!allowed) return props
  const out: Props = {}
  for (const key of allowed) if (key in props) out[key] = props[key]
  return out
}

export const STORE_PREFIX = 'store:'

/**
 * Returns the FastStore event name (without prefix) and params if `data` is a
 * FastStore analytics message: { name: 'AnalyticsEvent', params: { name: 'store:x', params } }.
 * src: @faststore/sdk 4.9.2 src/analytics/wrap.ts (observed)
 */
export function unwrapFastStoreMessage(data: unknown): { name: string; params: Record<string, any> } | null {
  const d = data as any
  if (!d || d.name !== 'AnalyticsEvent' || !d.params || typeof d.params.name !== 'string') return null
  if (!d.params.name.startsWith(STORE_PREFIX)) return null
  return { name: d.params.name.slice(STORE_PREFIX.length), params: d.params.params ?? {} }
}

export function mapEvent(
  fsName: string,
  params: Record<string, any>,
  opts: { map: Record<string, string | null>; strictProperties: boolean; url: string },
): MappedEvent | null {
  const ctName = opts.map[fsName]
  if (!ctName) return null
  const all = deriveProps(params, opts.url, ctName)
  return { name: ctName, props: opts.strictProperties ? filterDocumented(ctName, all) : all }
}

/** Stable signature of an event's props, ignoring url — used for dedupe. */
export function signature(props: Props): string {
  return Object.keys(props)
    .filter((k) => k !== 'url')
    .sort()
    .map((k) => `${k}=${String(props[k])}`)
    .join('&')
}
