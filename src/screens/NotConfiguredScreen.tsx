import { Logo } from './Logo'

/** Shown when the build has no Entra client/tenant ID yet. */
export function NotConfiguredScreen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo size={72} />
      <h1 className="text-2xl font-semibold">Almost there</h1>
      <p className="text-muted">
        This build doesn't have its Microsoft app registration yet. Set <code>VITE_CLIENT_ID</code> and{' '}
        <code>VITE_TENANT_ID</code> as described in <code>docs/SETUP.md</code>, then rebuild.
      </p>
    </main>
  )
}
