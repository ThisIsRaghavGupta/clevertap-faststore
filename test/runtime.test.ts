import 'fake-indexeddb/auto'
import { buildInlineScript } from '../src'
import type { CleverTapFastStoreConfig } from '../src'
import { fastStoreEvents, syntheticPerson, wrap } from './fixtures'

const ACCOUNT = 'TEST-000-0000'

/** Runs the exact inline script the component renders. */
function bootInPage(cfg: Partial<CleverTapFastStoreConfig> = {}) {
  // eslint-disable-next-line no-new-func
  new Function(buildInlineScript({ accountId: ACCOUNT, identity: { enabled: false }, events: { enrich: false }, ...cfg }))()
  return (window as any).clevertap
}

/** Delivers a message the way sendAnalyticsEvent does (same window, same origin). */
function emit(name: string, params: Record<string, any>) {
  window.dispatchEvent(
    new MessageEvent('message', { data: wrap(name, params), source: window, origin: window.location.origin }),
  )
}

function seedSession(person: object | null) {
  return new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('keyval-store')
    open.onupgradeneeded = () => open.result.createObjectStore('keyval')
    open.onsuccess = () => {
      const tx = open.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put({ locale: 'en-US', person }, 'fs::session')
      tx.oncomplete = () => {
        open.result.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

const flush = () => (window as any).CleverTapFastStore.flush()

function seedStore(key: string, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('keyval-store')
    open.onupgradeneeded = () => open.result.createObjectStore('keyval')
    open.onsuccess = () => {
      const tx = open.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(value, key)
      tx.oncomplete = () => {
        open.result.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

const pushedEvents = (ct: any) => {
  const out: Array<[string, any]> = []
  for (let i = 0; i < ct.event.length; i += 2) out.push([ct.event[i], ct.event[i + 1]])
  return out
}

beforeEach(() => {
  const w = window as any
  delete w.clevertap
  delete w.CleverTapFastStore
  document.head.innerHTML = ''
  localStorage.clear()
})

describe('boot', () => {
  it('sets account, region, privacy, spa and injects the SDK once', () => {
    const ct = bootInPage({ region: 'eu1' })
    expect(ct.account).toEqual([{ id: ACCOUNT }, 'eu1'])
    expect(ct.privacy).toEqual([{ optOut: false }, { useIP: false }])
    expect(ct.spa).toBe(true)
    bootInPage() // second mount is a no-op
    const scripts = document.querySelectorAll('script[data-clevertap-faststore]')
    expect(scripts.length).toBe(1)
    expect((scripts[0] as HTMLScriptElement).src).toContain('clevertap.min.js')
  })

  it('omits region when not set (SDK default eu1)', () => {
    expect(bootInPage().account).toEqual([{ id: ACCOUNT }])
  })

  it('passes target domain as the third account argument', () => {
    expect(bootInPage({ targetDomain: 'ct.example.com' }).account).toEqual([{ id: ACCOUNT }, undefined, 'ct.example.com'])
  })
})

describe('analytics bridge', () => {
  it('translates native FastStore events', async () => {
    const ct = bootInPage()
    for (const name of Object.keys(fastStoreEvents)) emit(name, fastStoreEvents[name])
    await flush()
    expect(pushedEvents(ct).map(([n]) => n)).toEqual([
      'Product Viewed',
      'Product Clicked',
      'Product List Viewed',
      'Product Added To Cart',
      'Product Removed From Cart',
      'Cart Viewed',
      'Products Searched',
      'Page Viewed',
    ])
  })

  it('ignores messages from other windows or origins', async () => {
    const ct = bootInPage()
    window.dispatchEvent(new MessageEvent('message', { data: wrap('search', { search_term: 'x' }), source: null }))
    window.dispatchEvent(
      new MessageEvent('message', { data: wrap('search', { search_term: 'x' }), source: window, origin: 'https://evil.example' }),
    )
    await flush()
    expect(ct.event.length).toBe(0)
  })

  it('suppresses repeated identical Cart Viewed (cart drawer open during SPA navigation)', async () => {
    const ct = bootInPage()
    emit('view_cart', fastStoreEvents.view_cart)
    emit('view_cart', fastStoreEvents.view_cart)
    emit('view_cart', { ...fastStoreEvents.view_cart, value: 100 })
    await flush()
    expect(pushedEvents(ct).map(([, p]) => p.value)).toEqual([75, 100])
  })

  it('does not dedupe other events', async () => {
    const ct = bootInPage()
    emit('view_item', fastStoreEvents.view_item)
    emit('view_item', fastStoreEvents.view_item)
    await flush()
    expect(ct.event.length).toBe(4)
  })

  it('track() refuses Charged', () => {
    const ct = bootInPage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(window as any).CleverTapFastStore.track('Charged', { value: 1 })
    expect(ct.event.length).toBe(0)
    expect(warn).toHaveBeenCalled()
  })
})

describe('consent', () => {
  it('waitForConsent: no SDK and no events until grantConsent()', async () => {
    const ct = bootInPage({ consent: { waitForConsent: true } })
    emit('search', { search_term: 'before' })
    await flush()
    expect(document.querySelector('script[data-clevertap-faststore]')).toBeNull()
    expect(ct.event.length).toBe(0)
    ;(window as any).CleverTapFastStore.grantConsent({ useIP: true })
    emit('search', { search_term: 'after' })
    await flush()
    expect(document.querySelector('script[data-clevertap-faststore]')).not.toBeNull()
    expect(pushedEvents(ct)).toEqual([['Products Searched', { keyword: 'after', 'CT Source': 'vtex' }]])
    expect(ct.privacy).toContainEqual({ useIP: true })
  })
})

describe('identity', () => {
  it('calls onUserLogin once with Email/Name and stores only a hash', async () => {
    await seedSession(syntheticPerson)
    const ct = bootInPage({ identity: { checkDelaysMs: [] } })
    const api = (window as any).CleverTapFastStore
    expect(await api.identify()).toBe('identified')
    expect(await api.identify()).toBe('unchanged')
    expect(ct.onUserLogin).toEqual([
      { Site: { Email: 'shopper.one@example.com', Name: 'Shopper One', 'First Name': 'Shopper', 'Last Name': 'One', Identity: 'shopper.one@example.com' } },
    ])
    const marker = localStorage.getItem('ct_fs_identified') ?? ''
    expect(marker).not.toContain('example.com')
  })

  it('identityFrom=none sends Email only (Store Framework pixel parity)', async () => {
    await seedSession(syntheticPerson)
    const ct = bootInPage({ identity: { checkDelaysMs: [], identityFrom: 'none' } })
    await (window as any).CleverTapFastStore.identify()
    expect(ct.onUserLogin[0].Site.Identity).toBeUndefined()
  })

  it('ctSource can be changed or omitted', async () => {
    const ct = bootInPage({ events: { enrich: false, ctSource: 'faststore' } })
    emit('search', { search_term: 'x' })
    await flush()
    expect(ct.event[1]['CT Source']).toBe('faststore')
    delete (window as any).clevertap; delete (window as any).CleverTapFastStore
    const ct2 = bootInPage({ events: { enrich: false, ctSource: null } })
    emit('search', { search_term: 'y' })
    await flush()
    expect(ct2.event[1]).toEqual({ keyword: 'y' })
  })

  it('identityFrom=userId adds Identity', async () => {
    await seedSession(syntheticPerson)
    const ct = bootInPage({ identity: { checkDelaysMs: [], identityFrom: 'userId' } })
    await (window as any).CleverTapFastStore.identify()
    expect(ct.onUserLogin[0].Site.Identity).toBe('synthetic_user_42')
  })

  it('on logout calls clevertap.logout() by default', async () => {
    await seedSession(syntheticPerson)
    const ct = bootInPage({ identity: { checkDelaysMs: [] } })
    ct.logout = vi.fn()
    const api = (window as any).CleverTapFastStore
    await api.identify()
    await seedSession(null)
    expect(await api.identify()).toBe('session-ended')
    expect(ct.logout).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('ct_fs_identified')).toBeNull()
  })

  it('anonymous visitor: nothing happens', async () => {
    await seedSession(null)
    const ct = bootInPage({ identity: { checkDelaysMs: [] } })
    expect(await (window as any).CleverTapFastStore.identify()).toBe('anonymous')
    expect(ct.onUserLogin.length).toBe(0)
  })
})

describe('features beyond the Store Framework pixel', () => {
  beforeEach(async () => {
    await seedStore('fs::session', { currency: { code: 'USD' }, person: null })
    await seedStore('fs::cart', {
      id: 'synthetic_orderform_1',
      items: [{ id: 'i1', price: 25, quantity: 2, itemOffered: { sku: 'synthetic_sku_2001', image: [{ url: 'https://example.com/img/tee.jpg' }] } }],
    })
  })

  it('adds cart_id and image_url to cart events from the FastStore cart', async () => {
    const ct = bootInPage({ events: { enrich: true } })
    emit('remove_from_cart', fastStoreEvents.remove_from_cart)
    emit('view_cart', fastStoreEvents.view_cart)
    await flush()
    const [[n1, p1], [n2, p2]] = pushedEvents(ct)
    expect(n1).toBe('Product Removed From Cart')
    expect(p1).toMatchObject({ cart_id: 'synthetic_orderform_1', image_url: 'https://example.com/img/tee.jpg', sku: 'synthetic_sku_2001' })
    expect(n2).toBe('Cart Viewed')
    expect(p2.cart_id).toBe('synthetic_orderform_1')
  })

  it('adds image_url and category to Product Viewed from the product page JSON-LD', async () => {
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.textContent = JSON.stringify({ '@type': 'Product', sku: 'synthetic_sku_2001', image: ['https://example.com/img/pdp.jpg'], category: 'Synthetic Apparel' })
    document.head.appendChild(ld)
    const ct = bootInPage({ events: { enrich: true } })
    emit('view_item', fastStoreEvents.view_item)
    await flush()
    expect(pushedEvents(ct)[0][1]).toMatchObject({ image_url: 'https://example.com/img/pdp.jpg', category: 'Synthetic Apparel' })
  })

  it('sends Checkout Started when the FastStore checkout button is clicked', async () => {
    const ct = bootInPage({ events: { enrich: true } })
    await new Promise((r) => setTimeout(r, 50)) // initial cart/session read
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'checkout-button')
    btn.innerHTML = '<span>Checkout</span>'
    document.body.appendChild(btn)
    ;(btn.firstChild as HTMLElement).click()
    expect(pushedEvents(ct)).toEqual([['Checkout Started', { value: 50, currency: 'USD', checkout_id: 'synthetic_orderform_1', 'CT Source': 'vtex' }]])
    btn.remove()
  })

  it('sends Product Filtered By Category when a category filter is added to the URL', async () => {
    window.history.replaceState({}, '', '/apparel')
    const ct = bootInPage()
    window.history.pushState({}, '', '/apparel?facets=category-1,category-2&category-1=apparel&category-2=t-shirts')
    await new Promise((r) => setTimeout(r, 10))
    window.history.pushState({}, '', '/apparel?facets=category-1,category-2,brand&category-1=apparel&category-2=t-shirts&brand=acme')
    await new Promise((r) => setTimeout(r, 10))
    expect(pushedEvents(ct)).toEqual([['Product Filtered By Category', { list_id: 'category-2', category: 't-shirts', 'CT Source': 'vtex' }]])
    window.history.replaceState({}, '', '/')
  })

  it('sends Page Viewed like the app pixel', async () => {
    const ct = bootInPage()
    emit('page_view', { page_title: 'Synthetic Tee', page_location: 'https://example.com/synthetic-tee/p' })
    await flush()
    expect(pushedEvents(ct)).toEqual([['Page Viewed', { pageType: 'product', pageTitle: 'Synthetic Tee', pageUrl: 'https://example.com/synthetic-tee/p', 'CT Source': 'vtex' }]])
  })
})
