import { DEFAULT_SDK_URL, type CleverTapFastStoreConfig, type ResolvedConfig } from './config'
import { BACKEND_ONLY_EVENTS, DEFAULT_EVENT_MAP } from './events'

const SAFE_TOKEN = /^[A-Za-z0-9._-]*$/

export class ConfigError extends Error {
  constructor(message: string) {
    super(`[@clevertap/faststore] ${message}`)
    this.name = 'ConfigError'
  }
}

/**
 * Applies defaults and validates. Throws ConfigError at render time (SSR/build),
 * so a misconfigured store fails loudly instead of silently sending nothing.
 */
export function resolveConfig(input: CleverTapFastStoreConfig): ResolvedConfig {
  if (!input || typeof input !== 'object') throw new ConfigError('config object is required')

  const accountId = String(input.accountId ?? '').trim()
  if (!accountId) {
    throw new ConfigError('accountId is required (CleverTap Project ID, Settings > Project).')
  }
  if (!SAFE_TOKEN.test(accountId)) throw new ConfigError('accountId contains unexpected characters.')
  if (/passcode/i.test(JSON.stringify(input))) {
    throw new ConfigError('a passcode must never be passed to the storefront. It belongs only in the VTEX app settings.')
  }

  const region = String(input.region ?? '').trim()
  if (!SAFE_TOKEN.test(region)) throw new ConfigError('region contains unexpected characters.')

  const map: Record<string, string | null> = { ...DEFAULT_EVENT_MAP, ...(input.events?.map ?? {}) }
  const allowFrontendCharged = input.events?.allowFrontendCharged === true
  if (!allowFrontendCharged) {
    for (const [fsName, ctName] of Object.entries(map)) {
      if (ctName && BACKEND_ONLY_EVENTS.includes(ctName.toLowerCase())) {
        throw new ConfigError(
          `"${fsName}" is mapped to "${ctName}". Charged is sent by the VTEX app backend; ` +
            'sending it from the storefront duplicates revenue. Set events.allowFrontendCharged to override.',
        )
      }
    }
  }

  return {
    accountId,
    region,
    targetDomain: String(input.targetDomain ?? '').trim(),
    sdkUrl: input.sdkUrl?.trim() || DEFAULT_SDK_URL,
    spa: input.spa ?? true,
    consent: {
      optOut: input.consent?.optOut ?? false,
      useIP: input.consent?.useIP ?? false,
      waitForConsent: input.consent?.waitForConsent ?? false,
    },
    events: {
      map,
      strictProperties: input.events?.strictProperties ?? true,
      dedupeUntilChange: input.events?.dedupeUntilChange ?? ['Cart Viewed'],
      allowFrontendCharged,
      ctSource: input.events?.ctSource === undefined ? 'vtex' : input.events.ctSource,
      enrich: input.events?.enrich ?? true,
      checkoutStarted: input.events?.checkoutStarted ?? true,
      categoryFilters: input.events?.categoryFilters ?? true,
    },
    identity: {
      enabled: input.identity?.enabled ?? true,
      identityFrom: input.identity?.identityFrom ?? 'email',
      onSessionEnd: input.identity?.onSessionEnd ?? 'logout',
      checkDelaysMs: input.identity?.checkDelaysMs ?? [0, 1500, 4000, 8000],
    },
    debug: input.debug ?? false,
  }
}
