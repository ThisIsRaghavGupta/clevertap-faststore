/**
 * Browser runtime. Bundled to an IIFE (scripts/build-runtime.mjs) and inlined
 * into the page by <CleverTapScripts />. Runs on the main thread, not in
 * Partytown: the SDK needs the DOM, and Web Push needs a service worker.
 */
import type { ResolvedConfig } from '../config'
import { checkIdentity } from './identity'
import { enrich, getCartSnapshot, getCurrency, refreshCart, refreshCurrency } from './enrich'
import { mapEvent, signature, unwrapFastStoreMessage, type Props } from './mapping'

declare const __VERSION__: string

type Logged = { at: number; name: string; props: Props; skipped?: string }

export interface PublicApi {
  version: string
  /** Load the SDK (if waitForConsent) and apply privacy flags. Call from the CMP. */
  grantConsent(flags?: { useIP?: boolean }): void
  /** Push privacy flags to the SDK, e.g. { optOut: true } on revocation. */
  setConsent(flags: { optOut?: boolean; useIP?: boolean }): void
  /** Send a custom CleverTap event through the same pipeline (consent + debug). */
  track(name: string, props?: Props): void
  /** Re-check the FastStore session now (e.g. right after a login redirect). */
  identify(): Promise<string>
  /** Last 50 events seen by the bridge (debug mode only). */
  getLog(): Logged[]
  /** Resolves when every queued FastStore event has been processed. */
  flush(): Promise<void>
}

export function boot(cfg: ResolvedConfig): PublicApi | undefined {
  const w = window as any
  if (w.CleverTapFastStore) return w.CleverTapFastStore // already installed (Fast Refresh, double mount)

  const ct = (w.clevertap = w.clevertap || {
    event: [],
    profile: [],
    account: [],
    onUserLogin: [],
    notifications: [],
    privacy: [],
  })

  // src: developer.clevertap.com/docs/web-quickstart-guide; account[1] = region,
  // account[2] = target domain (observed in clevertap-web-sdk@3.1.0 source).
  const accountArgs: unknown[] = [{ id: cfg.accountId }]
  if (cfg.region || cfg.targetDomain) accountArgs.push(cfg.region || undefined)
  if (cfg.targetDomain) accountArgs.push(cfg.targetDomain)
  ct.account.push(...accountArgs)
  ct.privacy.push({ optOut: cfg.consent.optOut })
  ct.privacy.push({ useIP: cfg.consent.useIP })
  ct.spa = cfg.spa

  let consented = !cfg.consent.waitForConsent
  let sdkInjected = false
  const log: Logged[] = []
  const lastSig: Record<string, string> = {}
  const dedupe = new Set(cfg.events.dedupeUntilChange.map((n) => n.toLowerCase()))

  const record = (entry: Logged) => {
    if (!cfg.debug) return
    log.push(entry)
    if (log.length > 50) log.shift()
    // eslint-disable-next-line no-console
    console.debug('[clevertap-faststore]', entry.skipped ? `skipped (${entry.skipped})` : 'sent', entry.name, entry.props)
  }

  const injectSdk = () => {
    if (sdkInjected) return
    sdkInjected = true
    const s = document.createElement('script')
    s.type = 'text/javascript'
    s.async = true
    s.src = cfg.sdkUrl
    s.setAttribute('data-clevertap-faststore', __VERSION__)
    const first = document.getElementsByTagName('script')[0]
    if (first?.parentNode) first.parentNode.insertBefore(s, first)
    else document.head.appendChild(s)
  }

  const send = (name: string, props: Props) => {
    if (!consented) return record({ at: Date.now(), name, props, skipped: 'no consent' })
    const key = name.toLowerCase()
    if (dedupe.has(key)) {
      const sig = signature(props)
      if (lastSig[key] === sig) return record({ at: Date.now(), name, props, skipped: 'duplicate' })
      lastSig[key] = sig
    }
    const payload = cfg.events.ctSource ? { ...props, 'CT Source': cfg.events.ctSource } : props
    // Always go through the live global — clevertap.min.js replaces window.clevertap
    // after load, so a captured stub reference would queue events the SDK never sees.
    ;(window as any).clevertap.event.push(name, payload)
    record({ at: Date.now(), name, props: payload })
  }

  // ---- identity -----------------------------------------------------------
  let identityTimer: ReturnType<typeof setTimeout> | undefined
  const identify = (): Promise<string> =>
    consented && cfg.identity.enabled
      ? checkIdentity((window as any).clevertap, cfg.identity).catch(() => 'error')
      : Promise.resolve('skipped')
  const scheduleIdentify = () => {
    clearTimeout(identityTimer)
    identityTimer = setTimeout(identify, 500)
  }

  // ---- analytics bridge ---------------------------------------------------
  // Events are processed in order through a promise chain, because enrichment
  // (cart, product page) is asynchronous.
  let queue: Promise<void> = Promise.resolve()
  const mapOpts = () => ({ map: cfg.events.map, strictProperties: cfg.events.strictProperties, url: window.location.href })
  window.addEventListener('message', (message: MessageEvent) => {
    // sendAnalyticsEvent posts to window.origin (observed in @faststore/sdk source).
    if (message.source !== window || message.origin !== window.location.origin) return
    const unwrapped = unwrapFastStoreMessage(message.data)
    if (!unwrapped || !cfg.events.map[unwrapped.name]) return
    if (cfg.identity.enabled) scheduleIdentify() // activity is a cheap moment to re-check login state
    const url = window.location.href
    queue = queue
      .then(async () => {
        const params = cfg.events.enrich ? await enrich(unwrapped.name, unwrapped.params).catch(() => unwrapped.params) : unwrapped.params
        const mapped = mapEvent(unwrapped.name, params, { ...mapOpts(), url })
        if (mapped) send(mapped.name, mapped.props)
      })
      .catch(() => undefined)
  })

  // ---- Checkout Started: FastStore emits no begin_checkout, so the click on
  // its checkout button (data-testid="checkout-button", observed in
  // @faststore/core useCheckoutButton) is used. Best effort: FastStore
  // navigates to VTEX Checkout right after the click.
  if (cfg.events.checkoutStarted) {
    if (cfg.events.enrich) {
      refreshCart().catch(() => undefined)
      refreshCurrency().catch(() => undefined)
    }
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null
        const btn = target && typeof target.closest === 'function' ? target.closest('[data-testid="checkout-button"]') : null
        if (!btn || (btn as HTMLButtonElement).disabled) return
        const snap = getCartSnapshot()
        const props: Props = {}
        if (snap?.value) props.value = snap.value
        if (getCurrency()) props.currency = getCurrency() as string
        if (snap?.id) props.checkout_id = snap.id
        send('Checkout Started', props)
      },
      true,
    )
  }

  // ---- Product Filtered By Category: FastStore keeps selected facets in the
  // URL (?facets=category-2&category-2=<value>, observed in @faststore/sdk
  // search serializer). Sent when a category facet value is added.
  if (cfg.events.categoryFilters) {
    const categoryFacets = (href: string) => {
      const set = new Set<string>()
      try {
        const u = new URL(href)
        const segments = new Set(u.pathname.split('/').filter(Boolean).map((x) => decodeURIComponent(x).toLowerCase()))
        for (const key of (u.searchParams.get('facets') || '').split(',')) {
          if (!/^category-\d+$/.test(key)) continue
          for (const v of u.searchParams.getAll(key)) {
            if (!segments.has(v.toLowerCase())) set.add(`${key}=${v}`) // skip the PLP's own category
          }
        }
      } catch {
        /* ignore */
      }
      return set
    }
    let lastFacets = categoryFacets(window.location.href)
    const onUrlChange = () => {
      const now = categoryFacets(window.location.href)
      now.forEach((f) => {
        if (lastFacets.has(f)) return
        const [key, value] = [f.slice(0, f.indexOf('=')), f.slice(f.indexOf('=') + 1)]
        send('Product Filtered By Category', { list_id: key, category: value })
      })
      lastFacets = now
    }
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method]
      history[method] = function (this: History, ...args: any[]) {
        const result = original.apply(this, args as any)
        setTimeout(onUrlChange, 0)
        return result
      } as any
    }
    window.addEventListener('popstate', onUrlChange)
  }

  const startIdentity = () => {
    if (!cfg.identity.enabled) return
    for (const ms of cfg.identity.checkDelaysMs) setTimeout(identify, ms)
    window.addEventListener('focus', scheduleIdentify)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleIdentify()
    })
  }

  const api: PublicApi = {
    version: __VERSION__,
    grantConsent(flags) {
      const live = (window as any).clevertap
      if (flags && typeof flags.useIP === 'boolean') live.privacy.push({ useIP: flags.useIP })
      live.privacy.push({ optOut: false })
      if (consented && sdkInjected) return
      consented = true
      injectSdk()
      startIdentity()
    },
    setConsent(flags) {
      const live = (window as any).clevertap
      if (typeof flags.optOut === 'boolean') live.privacy.push({ optOut: flags.optOut })
      if (typeof flags.useIP === 'boolean') live.privacy.push({ useIP: flags.useIP })
    },
    track(name, props = {}) {
      const n = String(name)
      if (n.toLowerCase() === 'charged' && !cfg.events.allowFrontendCharged) {
        // eslint-disable-next-line no-console
        console.warn('[clevertap-faststore] Charged is sent by the VTEX app backend; refusing to send it from the storefront.')
        return
      }
      send(n, props)
    },
    identify,
    getLog: () => log.slice(),
    flush: () => queue,
  }
  w.CleverTapFastStore = api

  if (consented) {
    injectSdk()
    startIdentity()
  }
  return api
}
