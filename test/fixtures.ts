// SYNTHETIC DATA — shapes copied from @faststore/core 4.9.2 payload builders
// (ProductDetails, useBuyButton, CartSidebar, useProductLink,
// useViewItemListEvent, SearchInput). Values are invented.

const item = {
  item_id: 'synthetic_pg_1001', // productGroupID
  item_name: 'Synthetic Tee',
  item_brand: 'Acme Retail',
  item_variant: 'synthetic_sku_2001', // SKU id
  price: 25,
  discount: 5,
  currency: 'USD',
  item_variant_name: 'Synthetic Tee - M',
  product_reference_id: '0000000000000',
}

export const fastStoreEvents: Record<string, Record<string, any>> = {
  view_item: { currency: 'USD', value: 25, items: [item] },
  select_item: { items: [{ ...item, index: 3 }] },
  view_item_list: {
    item_list_name: 'Synthetic Shelf',
    item_list_id: 'Synthetic Shelf',
    items: [{ ...item, index: 1 }, { ...item, item_id: 'synthetic_pg_1002', index: 2 }],
  },
  add_to_cart: { currency: 'USD', value: 25, items: [{ ...item, quantity: 1 }] },
  remove_from_cart: { currency: 'USD', value: 25, items: [{ ...item, quantity: 1 }] },
  view_cart: {
    currency: 'USD',
    value: 75,
    items: [{ ...item, quantity: 2 }, { ...item, item_id: 'synthetic_pg_1002', quantity: 1 }],
  },
  search: { search_term: 'synthetic hat' },
  page_view: { page_title: 'Home', page_location: 'https://example.com/' },
}

/** Wraps an event exactly like @faststore/sdk's wrap(). */
export const wrap = (name: string, params: Record<string, any>) => ({
  name: 'AnalyticsEvent',
  isEcommerceEvent: true,
  params: { name: `store:${name}`, params },
})

export const syntheticPerson = {
  id: 'synthetic_user_42',
  email: 'shopper.one@example.com',
  givenName: 'Shopper',
  familyName: 'One',
}
