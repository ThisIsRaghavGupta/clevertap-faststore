import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { CleverTapScripts, buildInlineScript, resolveConfig, toInlineJson } from '../src'

const ACCOUNT = 'TEST-000-0000' // placeholder, not a real project

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const c = resolveConfig({ accountId: ACCOUNT })
    expect(c.region).toBe('')
    expect(c.spa).toBe(true)
    expect(c.consent).toEqual({ optOut: false, useIP: false, waitForConsent: false })
    expect(c.identity.identityFrom).toBe('email')
    expect(c.events.ctSource).toBe('vtex')
    expect(c.identity.onSessionEnd).toBe('logout')
    expect(c.events).toMatchObject({ enrich: true, checkoutStarted: true, categoryFilters: true })
    expect(c.events.dedupeUntilChange).toEqual(['Cart Viewed'])
  })

  it('requires accountId', () => {
    expect(() => resolveConfig({ accountId: '' })).toThrow(/accountId is required/)
    expect(() => resolveConfig({ accountId: undefined as any })).toThrow(/accountId is required/)
  })

  it('rejects injection-shaped values', () => {
    expect(() => resolveConfig({ accountId: "x');alert(1)//" })).toThrow(/unexpected characters/)
    expect(() => resolveConfig({ accountId: ACCOUNT, region: 'eu1"<' })).toThrow(/unexpected characters/)
  })

  it('refuses anything that looks like a passcode', () => {
    expect(() => resolveConfig({ accountId: ACCOUNT, passcode: 'x' } as any)).toThrow(/passcode/)
  })

  it('refuses mapping an event to Charged unless explicitly allowed', () => {
    expect(() => resolveConfig({ accountId: ACCOUNT, events: { map: { purchase: 'Charged' } } })).toThrow(/Charged/)
    expect(() =>
      resolveConfig({ accountId: ACCOUNT, events: { map: { purchase: 'Charged' }, allowFrontendCharged: true } }),
    ).not.toThrow()
  })

  it('merges and disables events', () => {
    const c = resolveConfig({ accountId: ACCOUNT, events: { map: { purchase: null, page_view: 'Page Viewed' } } })
    expect(c.events.map.purchase).toBeNull()
    expect(c.events.map.page_view).toBe('Page Viewed')
    expect(c.events.map.view_item).toBe('Product Viewed')
  })
})

describe('inline script', () => {
  it('escapes </script> break-outs in config', () => {
    const json = toInlineJson({ a: '</script><script>alert(1)</script>' })
    expect(json).not.toContain('</script>')
    expect(JSON.parse(json)).toEqual({ a: '</script><script>alert(1)</script>' })
  })

  it('contains the runtime and boot call', () => {
    const s = buildInlineScript({ accountId: ACCOUNT, region: 'eu1' })
    expect(s).toContain('__ctfs.boot(')
    expect(s).toContain(ACCOUNT)
    expect(s).not.toContain('passcode')
  })

  it('component renders a single SSR-safe script without partytown', () => {
    const html = renderToStaticMarkup(React.createElement(CleverTapScripts, { accountId: ACCOUNT, region: 'us1' }))
    expect(html.startsWith('<script id="clevertap-faststore" type="text/javascript">')).toBe(true)
    expect(html).not.toContain('partytown')
    expect((html.match(/<script/g) ?? []).length).toBe(1)
  })
})
