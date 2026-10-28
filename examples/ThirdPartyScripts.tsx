// src/scripts/ThirdPartyScripts.tsx — in the FastStore store repo.
// FastStore v4 renders this file inside next/head (server-side only).
import { CleverTapScripts } from '@clevertap/faststore'

const ThirdPartyScripts = () => (
  <>
    <CleverTapScripts
      // Public values. Must be the SAME project and region as the CleverTap app in
      // VTEX Admin > Apps > My Apps > CleverTap > Settings. The Passcode never goes here.
      accountId={process.env.NEXT_PUBLIC_CLEVERTAP_ACCOUNT_ID ?? ''}
      region={process.env.NEXT_PUBLIC_CLEVERTAP_REGION}
      // Wire this to the store's consent banner before production:
      //   consent={{ waitForConsent: true }}  and call
      //   window.CleverTapFastStore.grantConsent({ useIP: false }) from the CMP.
      consent={{ optOut: false, useIP: false }}
      identity={{
        identityFrom: 'none', // Email only, until the VTEX app backend identifier is confirmed
        onSessionEnd: 'none', // switch to 'logout' after validating with CleverTap
      }}
      debug={process.env.NODE_ENV !== 'production'}
    />
  </>
)

export default ThirdPartyScripts
