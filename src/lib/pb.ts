import PocketBase, { ClientResponseError } from 'pocketbase'

// The music-cms PocketBase on the NAS, on port 8443 of its Tailscale address.
// (Port 443 there is the Nostalge Claude connector, not PocketBase.)
export const POCKETBASE_URL: string =
  import.meta.env.VITE_POCKETBASE_URL || 'https://polky.tail9c3d82.ts.net:8443'

export const pb = new PocketBase(POCKETBASE_URL)
pb.autoCancellation(false)

export type SignInResult = 'ok' | 'rejected' | 'unreachable'

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    await pb.collection('users').authWithPassword(email, password)
    return 'ok'
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 400) return 'rejected'
    return 'unreachable'
  }
}

export function signOut() {
  pb.authStore.clear()
}

export function signedInEmail(): string {
  const model = pb.authStore.model as { email?: string } | null
  return pb.authStore.isValid && model?.email ? model.email : ''
}

/** Extends the session. 'signed-out' only when the NAS answered and said no. */
export async function ensureSession(): Promise<'ok' | 'signed-out' | 'offline'> {
  if (!pb.authStore.token) return 'signed-out'
  try {
    await pb.collection('users').authRefresh()
    return 'ok'
  } catch (err) {
    if (err instanceof ClientResponseError && [401, 403, 404].includes(err.status)) {
      pb.authStore.clear()
      return 'signed-out'
    }
    return 'offline'
  }
}

/** Network trouble (or the NAS being off) as opposed to the NAS refusing a request. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ClientResponseError ? err.status === 0 || err.isAbort : true
}

export function statusOf(err: unknown): number {
  return err instanceof ClientResponseError ? err.status : 0
}
