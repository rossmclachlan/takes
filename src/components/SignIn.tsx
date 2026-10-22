import { useState } from 'react'
import { signIn } from '../lib/pb'
import { signedIn } from '../lib/store'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const result = await signIn(email.trim(), password)
    setBusy(false)
    if (result === 'ok') signedIn(email.trim())
    else if (result === 'rejected') setError('That email and password didn’t match. Use the account you sign in to Nostalge with.')
    else setError('Couldn’t reach the NAS. Check you have signal, then try again.')
  }

  return (
    <div className="paper relative flex min-h-full items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
        <TapeLogo />
        <div>
          <h1 className="heading-page">Takes</h1>
          <p className="mt-1 text-ink-variant">Your demos, sorted. Sign in with your Nostalge account.</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="label-section">Email</span>
          <input id="email" className="input-field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-section">Password</span>
          <input id="password" className="input-field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="rounded-2xl bg-error-container px-3.5 py-2.5 text-sm text-on-error-container">{error}</p>}
        <button type="submit" className="btn-filled" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export function TapeLogo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.68} viewBox="0 0 100 68" aria-hidden>
      <rect x="6" y="6" width="90" height="58" rx="9" className="fill-ink" />
      <rect x="2" y="2" width="90" height="58" rx="9" className="fill-sun stroke-ink" strokeWidth="3" />
      <rect x="14" y="12" width="66" height="26" rx="5" className="fill-surface stroke-ink" strokeWidth="2.5" />
      <circle cx="31" cy="25" r="7" className="fill-accent" />
      <circle cx="63" cy="25" r="7" className="fill-accent" />
      <path d="M26 52 L32 44 H62 L68 52" className="fill-none stroke-ink" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}
