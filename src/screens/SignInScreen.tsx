import { useState } from 'react'
import { signIn } from '../auth/msal'
import { Logo } from './Logo'

export function SignInScreen({ error }: { error?: string }) {
  const [busy, setBusy] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)

  async function handleSignIn() {
    setBusy(true)
    setSignInError(null)
    try {
      await signIn() // navigates to Microsoft; returns here afterwards
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const message = signInError ?? error

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo size={88} />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">View</h1>
        <p className="text-muted">Your Outlook calendar, jobs and OneDrive files in one place.</p>
      </div>

      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-brand px-5 py-4 text-base font-medium text-white shadow-sm active:scale-[0.99] disabled:opacity-60"
      >
        <MicrosoftMark />
        {busy ? 'Opening Microsoft…' : 'Sign in with Microsoft'}
      </button>

      {message && (
        <p role="alert" className="w-full rounded-lg bg-danger-soft px-4 py-3 text-left text-sm text-danger">
          {message}
        </p>
      )}

      <p className="text-xs text-muted">Signs in with your work account. Your data stays in Microsoft 365.</p>
    </main>
  )
}

function MicrosoftMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
