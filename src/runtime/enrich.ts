/**
 * Fills in data the FastStore analytics payload does not carry, from sources
 * FastStore itself keeps in the browser (all observed in @faststore/core and
 * @faststore/sdk 4.9.2 / 4.10.0 source):
 *
 * - Cart: idb-keyval store, key "fs::cart" → { id, items[] }. `id` is the VTEX
 *   orderForm id (the same value the CleverTap VTEX app backend sends as
 *   checkout_id). Each item has itemOffered.sku, itemOffered.image[].url,
 *   price and quantity. FastStore writes the store to IndexedDB on every change.
 * - Session: key "fs::session" → currency.code.
 * - Product page: next-seo ProductJsonLd <script type="application/ld+json">
 *   with sku, image[] and category (first breadcrumb).
 */

export interface ProductInfo {
  image_url?: string
  category?: string
}

export interface CartSnapshot {
  id: string
  value: number
  itemsQty: number
}

const DB = 'keyval-store'
const STORE = 'keyval'

export function idbGet<T = any>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB)
      open.onerror = () => resolve(null)
      open.onupgradeneeded = () => open.transaction?.abort() // never create FastStore's DB
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.close()
          return resolve(null)
        }
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
        req.onsuccess = () => {
          db.close()
          resolve((req.result as T) ?? null)
        }
        req.onerror = () => {
          db.close()
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

/** Product info cache by SKU id, filled from the cart and the product page. */
export const productCache = new Map<string, ProductInfo>()
let cartSnapshot: CartSnapshot | null = null
let currency: string | undefined

export const getCartSnapshot = () => cartSnapshot
export const getCurrency = () => currency

export async function refreshCart(): Promise<CartSnapshot | null> {
  const cart = await idbGet<any>('fs::cart')
  if (!cart || typeof cart !== 'object') return cartSnapshot
  const items: any[] = Array.isArray(cart.items) ? cart.items : []
  let value = 0
  for (const it of items) {
    const sku = it?.itemOffered?.sku
    const img = it?.itemOffered?.image?.[0]?.url
    if (sku && img) productCache.set(String(sku), { ...productCache.get(String(sku)), image_url: img })
    const price = Number(it?.price), qty = Number(it?.quantity)
    if (Number.isFinite(price) && Number.isFinite(qty)) value += price * qty
  }
  cartSnapshot = { id: typeof cart.id === 'string' ? cart.id : '', value: Math.round(value * 100) / 100, itemsQty: items.length }
  return cartSnapshot
}

export async function refreshCurrency() {
  const session = await idbGet<any>('fs::session')
  const code = session?.currency?.code
  if (typeof code === 'string' && code) currency = code
}

/** Reads the product page JSON-LD for a SKU. Returns null when the page shows another product. */
export function productFromJsonLd(sku: string): ProductInfo | null {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  for (const s of scripts) {
    let data: any
    try {
      data = JSON.parse(s.textContent || '')
    } catch {
      continue
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      if (!node || node['@type'] !== 'Product' || String(node.sku) !== String(sku)) continue
      const image = Array.isArray(node.image) ? node.image[0] : node.image
      const info: ProductInfo = {}
      if (typeof image === 'string' && image) info.image_url = image
      if (typeof node.category === 'string' && node.category) info.category = node.category
      productCache.set(String(sku), { ...productCache.get(String(sku)), ...info })
      return info
    }
  }
  return null
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Adds cart_id / image_url / category where missing. Cart reads wait briefly
 * because FastStore sends add_to_cart just before it updates the cart.
 */
export async function enrich(fsName: string, params: Record<string, any>): Promise<Record<string, any>> {
  const items: any[] = Array.isArray(params.items) ? params.items : []
  const first = items[0]
  const out = { ...params }
  const isCartEvent = fsName === 'add_to_cart' || fsName === 'remove_from_cart' || fsName === 'view_cart'

  if (isCartEvent) {
    if (fsName === 'add_to_cart') await wait(400)
    const [snap] = await Promise.all([refreshCart(), refreshCurrency()])
    if (snap?.id && out.cart_id === undefined) out.cart_id = snap.id
  }

  if (fsName === 'view_item' && first?.item_variant) {
    let info = productFromJsonLd(first.item_variant)
    if (!info) {
      await wait(400) // head JSON-LD may update after the SPA navigation event
      info = productFromJsonLd(first.item_variant)
    }
  }

  if (first?.item_variant) {
    const cached = productCache.get(String(first.item_variant))
    if (cached) {
      out.items = [{ ...first, image_url: first.image_url ?? cached.image_url, item_category: first.item_category ?? cached.category }, ...items.slice(1)]
    }
  }
  return out
}
