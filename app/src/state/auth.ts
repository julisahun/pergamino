/**
 * The DM's token, kept on this device.
 *
 * Pasted once from the server's `.env`, remembered beside the campaign and mesa
 * choices. Never sent anywhere but the server it belongs to, and never shown
 * again once saved.
 */
const TOKEN_KEY = 'pantalla-dm.token'

export function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function rememberToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage off — the token will be asked for again */
  }
}
