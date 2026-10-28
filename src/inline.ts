import type { CleverTapFastStoreConfig } from './config'
import { RUNTIME_SOURCE } from './generated/runtime'
import { resolveConfig } from './resolve'

/**
 * JSON that is safe to embed inside an inline <script>: no `</script>`
 * break-out, no HTML comment openers, no JS line terminators.
 */
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), 'g')
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), 'g')

export function toInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEP, '\\u2028')
    .replace(PARA_SEP, '\\u2029')
}

/**
 * Full inline script: the runtime IIFE (scoped inside a function so its
 * global name does not leak) followed by boot(config).
 */
export function buildInlineScript(config: CleverTapFastStoreConfig): string {
  const resolved = resolveConfig(config)
  return `(function(){if(typeof window==='undefined')return;${RUNTIME_SOURCE}\n__ctfs.boot(${toInlineJson(resolved)});})();`
}
