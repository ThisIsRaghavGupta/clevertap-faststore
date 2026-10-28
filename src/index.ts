export { CleverTapScripts } from './component'
export { buildInlineScript, toInlineJson } from './inline'
export { resolveConfig, ConfigError } from './resolve'
export { DEFAULT_EVENT_MAP, DOCUMENTED_PROPERTIES } from './events'
export { DEFAULT_SDK_URL } from './config'
export type {
  CleverTapFastStoreConfig,
  CleverTapRegion,
  ConsentConfig,
  EventsConfig,
  IdentityConfig,
  ResolvedConfig,
  SessionEndAction,
} from './config'
export type { PublicApi as CleverTapFastStoreApi } from './runtime/boot'
export { RUNTIME_VERSION as VERSION } from './generated/runtime'
