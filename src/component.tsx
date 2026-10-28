import * as React from 'react'
import type { CleverTapFastStoreConfig } from './config'
import { buildInlineScript } from './inline'

/**
 * Renders one inline <script> that loads the CleverTap Web SDK, bridges
 * FastStore analytics events and identifies the shopper.
 *
 * Use it from `src/scripts/ThirdPartyScripts.tsx`. FastStore renders that file
 * inside next/head in _app (observed in @faststore/core 4.9.2), which means it
 * is only server-rendered: hooks and effects never run there. That is why this
 * component has no hooks and does all browser work in the inline script.
 *
 * Do not add type="text/partytown": the SDK must run on the main thread.
 */
export function CleverTapScripts(props: CleverTapFastStoreConfig): React.ReactElement {
  return React.createElement('script', {
    key: 'clevertap-faststore',
    id: 'clevertap-faststore',
    type: 'text/javascript',
    dangerouslySetInnerHTML: { __html: buildInlineScript(props) },
  })
}
