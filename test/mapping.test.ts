import { DEFAULT_EVENT_MAP } from '../src/events'
import { mapEvent, signature, unwrapFastStoreMessage } from '../src/runtime/mapping'
import { fastStoreEvents, wrap } from './fixtures'

const opts = { map: DEFAULT_EVENT_MAP, strictProperties: true, url: 'https://example.com/synthetic-tee/p' }
const map = (name: string) => mapEvent(name, fastStoreEvents[name], opts)

describe('FastStore → CleverTap mapping (documented properties only)', () => {
  it('view_item → Product Viewed', () => {
    expect(map('view_item')).toEqual({
      name: 'Product Viewed',
      props: {
        product_id: 'synthetic_pg_1001',
        sku: 'synthetic_sku_2001',
        name: 'Synthetic Tee',
        brand: 'Acme Retail',
        variant: 'Synthetic Tee - M',
        price: 25,
        quantity: 1,
        url: opts.url,
      },
    })
  })

  it('select_item → Product Clicked with position', () => {
    expect(map('select_item')?.props.position).toBe(3)
    expect(map('select_item')?.name).toBe('Product Clicked')
  })

  it('view_item_list → Product List Viewed with list props only (no product noise)', () => {
    expect(map('view_item_list')).toEqual({
      name: 'Product List Viewed',
      props: { list_id: 'Synthetic Shelf', category: 'Synthetic Shelf' },
    })
  })

  it('add_to_cart / remove_from_cart', () => {
    expect(map('add_to_cart')?.name).toBe('Product Added To Cart')
    expect(map('add_to_cart')?.props.quantity).toBe(1)
    expect(map('remove_from_cart')?.name).toBe('Product Removed From Cart')
  })

  it('view_cart → Cart Viewed with cart-level props only', () => {
    expect(map('view_cart')).toEqual({ name: 'Cart Viewed', props: { items_qty: 2, value: 75 } })
  })

  it('search → Products Searched', () => {
    expect(map('search')).toEqual({ name: 'Products Searched', props: { keyword: 'synthetic hat' } })
  })

  it('page_view → Page Viewed with the app pixel properties', () => {
    expect(map('page_view')).toEqual({ name: 'Page Viewed', props: { pageTitle: 'Home', pageUrl: 'https://example.com/', pageType: 'home' } })
  })

  it('non-strict mode keeps extra derived props', () => {
    const r = mapEvent('view_item', fastStoreEvents.view_item, { ...opts, strictProperties: false })
    expect(r?.props).toMatchObject({ currency: 'USD', value: 25, discount: 5 })
  })

  it('custom events pass through with all derived props', () => {
    const r = mapEvent('coupon_applied', { coupon_id: 'SYNTH10', checkout_id: 'c1' }, {
      ...opts,
      map: { ...DEFAULT_EVENT_MAP, coupon_applied: 'Coupon Applied' },
    })
    expect(r).toEqual({ name: 'Coupon Applied', props: { checkout_id: 'c1', coupon_id: 'SYNTH10' } })
  })

  it('promotion events use promotion_name as name', () => {
    const r = mapEvent('view_promotion', { promotion_id: 'p1', promotion_name: 'Synthetic Sale', items: [] }, opts)
    expect(r).toEqual({ name: 'Promotion Viewed', props: { promotion_id: 'p1', name: 'Synthetic Sale' } })
  })

  it('drops non-scalar and empty values', () => {
    const r = mapEvent('search', { search_term: '' }, opts)
    expect(r?.props).toEqual({})
  })
})

describe('unwrapFastStoreMessage', () => {
  it('unwraps the store: prefix', () => {
    expect(unwrapFastStoreMessage(wrap('search', { search_term: 'x' }))).toEqual({
      name: 'search',
      params: { search_term: 'x' },
    })
  })
  it('ignores foreign messages', () => {
    expect(unwrapFastStoreMessage({ name: 'AnalyticsEvent', params: { name: 'view_item' } })).toBeNull()
    expect(unwrapFastStoreMessage({ type: 'webpackOk' })).toBeNull()
    expect(unwrapFastStoreMessage(null)).toBeNull()
  })
})

describe('signature', () => {
  it('ignores url and key order', () => {
    expect(signature({ a: 1, url: 'x', b: 2 })).toBe(signature({ b: 2, a: 1, url: 'y' }))
  })
})
