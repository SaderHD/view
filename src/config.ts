/**
 * App configuration.
 *
 * The client ID and tenant ID come from the "View" app registration in
 * Microsoft Entra ID (see docs/SETUP.md). They are public identifiers, not
 * secrets — they're safe to commit or put in GitHub repository variables.
 *
 * Locally: put them in `.env.local` (copy `.env.example`).
 * In CI:   set repository variables VITE_CLIENT_ID and VITE_TENANT_ID.
 */
export const config = {
  clientId: import.meta.env.VITE_CLIENT_ID ?? '',
  /**
   * Which accounts can sign in:
   *  - "consumers" → personal Microsoft accounts (@outlook.com, @hotmail.com, @live.com)
   *  - a directory (tenant) ID → work/school accounts in that organisation
   *  - "common" → both (the app registration must allow both)
   */
  tenantId: import.meta.env.VITE_TENANT_ID ?? '',
  /** Where Microsoft sends you back after sign-in — the app's own URL. */
  redirectUri: new URL(import.meta.env.BASE_URL, window.location.origin).href,
} as const

export const isConfigured =
  import.meta.env.VITE_DEMO === '1' || Boolean(config.clientId && config.tenantId)

/**
 * Delegated Microsoft Graph permissions. Requested all at once on first
 * sign-in so you only see one consent prompt.
 */
export const graphScopes = [
  'User.Read',
  'Calendars.ReadWrite',
  'Files.ReadWrite.All',
  'offline_access',
]
