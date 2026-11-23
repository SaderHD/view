import {
  BrowserCacheLocation,
  EventType,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AuthenticationResult,
} from '@azure/msal-browser'
import { config, graphScopes } from '../config'

/**
 * Single MSAL instance for the whole app.
 *
 * - Redirect flow (not popups): popups are unreliable in an installed
 *   Android PWA, redirects always work.
 * - localStorage cache: keeps you signed in between app launches.
 */
let instance: PublicClientApplication | null = null

function msal(): PublicClientApplication {
  instance ??= new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: config.redirectUri,
      postLogoutRedirectUri: config.redirectUri,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
    },
  })
  return instance
}

export function getAccount() {
  return instance?.getActiveAccount() ?? null
}

/** Initialise MSAL and finish any sign-in redirect that just came back. */
export async function initAuth(): Promise<void> {
  await msal().initialize()

  msal().addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const result = event.payload as AuthenticationResult
      msal().setActiveAccount(result.account)
    }
  })

  const result = await msal().handleRedirectPromise()
  if (result?.account) {
    msal().setActiveAccount(result.account)
  } else if (!msal().getActiveAccount()) {
    const [first] = msal().getAllAccounts()
    if (first) msal().setActiveAccount(first)
  }
}

export function signIn(): Promise<void> {
  return msal().loginRedirect({ scopes: graphScopes, prompt: 'select_account' })
}

export function signOut(): Promise<void> {
  return msal().logoutRedirect({ account: msal().getActiveAccount() })
}

/**
 * Get an access token for Microsoft Graph. Uses the cached/refreshed token
 * when possible; falls back to a redirect if Microsoft needs you to sign in
 * again or approve new permissions.
 */
export async function getGraphToken(): Promise<string> {
  const account = msal().getActiveAccount()
  if (!account) throw new Error('Not signed in')
  try {
    const result = await msal().acquireTokenSilent({ scopes: graphScopes, account })
    return result.accessToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msal().acquireTokenRedirect({ scopes: graphScopes, account })
      // The page navigates away; this never resolves.
      return new Promise<string>(() => {})
    }
    throw err
  }
}
