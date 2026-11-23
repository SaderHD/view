import { useEffect, useState } from 'react'
import { getAccount, initAuth } from './auth/msal'
import { isConfigured } from './config'
import { HomeScreen } from './screens/HomeScreen'
import { NotConfiguredScreen } from './screens/NotConfiguredScreen'
import { SignInScreen } from './screens/SignInScreen'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; name: string; username: string }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!isConfigured) return
    initAuth()
      .then(() => {
        const account = getAccount()
        setState(
          account
            ? { kind: 'signedIn', name: account.name ?? account.username, username: account.username }
            : { kind: 'signedOut' },
        )
      })
      .catch((err: unknown) => {
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })
  }, [])

  if (!isConfigured) return <NotConfiguredScreen />

  switch (state.kind) {
    case 'loading':
      return (
        <div className="flex min-h-dvh items-center justify-center text-muted">Loading…</div>
      )
    case 'error':
      return <SignInScreen error={state.message} />
    case 'signedOut':
      return <SignInScreen />
    case 'signedIn':
      return <HomeScreen name={state.name} username={state.username} />
  }
}
