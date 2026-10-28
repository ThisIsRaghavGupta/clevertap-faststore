// Runs the real inline script in jsdom, replays the FastStore events that
// FastStore 4.9/4.10 emits natively (synthetic payloads), and prints what would
// be pushed to CleverTap. No network, no credentials.
//   pnpm simulate
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Bundle src/inline.ts (+ generated runtime) for Node on the fly.
const out = await build({
  entryPoints: [join(root, 'src/inline.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const { buildInlineScript } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))

const dom = new JSDOM('<!doctype html><html><head><script></script></head><body></body></html>', {
  url: 'https://example.com/synthetic-tee/p',
  runScripts: 'outside-only',
})
const { window } = dom
window.eval(buildInlineScript({ accountId: 'TEST-000-0000', region: 'us1', identity: { enabled: false } }))

const item = {
  item_id: 'synthetic_pg_1001', item_name: 'Synthetic Tee', item_brand: 'Acme Retail',
  item_variant: 'synthetic_sku_2001', price: 25, discount: 5, currency: 'USD',
  item_variant_name: 'Synthetic Tee - M', product_reference_id: '0000000000000',
}
const events = [
  ['page_view', { page_title: 'PDP' }],
  ['search', { search_term: 'synthetic hat' }],
  ['view_item_list', { item_list_name: 'Synthetic Shelf', item_list_id: 'Synthetic Shelf', items: [{ ...item, index: 1 }] }],
  ['select_item', { items: [{ ...item, index: 1 }] }],
  ['view_item', { currency: 'USD', value: 25, items: [item] }],
  ['add_to_cart', { currency: 'USD', value: 25, items: [{ ...item, quantity: 1 }] }],
  ['view_cart', { currency: 'USD', value: 25, items: [{ ...item, quantity: 1 }] }],
  ['view_cart', { currency: 'USD', value: 25, items: [{ ...item, quantity: 1 }] }], // drawer open + SPA nav
  ['remove_from_cart', { currency: 'USD', value: 25, items: [{ ...item, quantity: 1 }] }],
]
for (const [name, params] of events) {
  window.dispatchEvent(
    new window.MessageEvent('message', {
      data: { name: 'AnalyticsEvent', isEcommerceEvent: true, params: { name: `store:${name}`, params } },
      source: window,
      origin: window.location.origin,
    }),
  )
}

await window.CleverTapFastStore.flush()
const ct = window.clevertap
console.log('account.push args :', JSON.stringify(ct.account))
console.log('privacy           :', JSON.stringify(ct.privacy), ' spa:', ct.spa)
console.log('SDK script        :', window.document.querySelector('script[data-clevertap-faststore]')?.src)
console.log(`\nFastStore emitted ${events.length} events → CleverTap queue:`)
for (let i = 0; i < ct.event.length; i += 2) console.log(' ', ct.event[i].padEnd(26), JSON.stringify(ct.event[i + 1]))
