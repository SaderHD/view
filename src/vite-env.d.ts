/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLIENT_ID?: string
  readonly VITE_TENANT_ID?: string
  /** "1" = demo mode with fake data, no Microsoft sign-in (for testing). */
  readonly VITE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
