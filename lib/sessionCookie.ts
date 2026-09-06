/**
 * Reading the session's expiry straight out of the request cookies.
 *
 * The middleware refreshes Supabase's auth token, which costs a round trip to
 * the auth server in front of every page render. Almost every one of those was
 * wasted: signed-out visitors have no token, and a signed-in visitor's token
 * is good for an hour. Knowing when it actually expires means refreshing only
 * when it is nearly due.
 *
 * Getting this wrong in one direction costs a round trip; in the other it
 * signs people out mid-session. So anything unrecognised reports `'unknown'`
 * and the caller refreshes, which is exactly what it did before this existed.
 */

export interface SessionCookie {
  name: string;
  value: string;
}

/** `sb-<project-ref>-auth-token`, plus `.0`, `.1` … once it outgrows 4KB. */
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

const BASE64_PREFIX = 'base64-';

/**
 * Epoch milliseconds at which the session expires.
 *
 * `'absent'` — no Supabase auth cookie at all, so nobody is signed in.
 * `'unknown'` — a cookie is there but could not be read.
 */
export function sessionExpiry(
  cookies: SessionCookie[]
): number | 'absent' | 'unknown' {
  const parts = cookies
    .filter((cookie) => AUTH_COOKIE.test(cookie.name))
    // Chunk order is the cookie order, and `.10` must not sort before `.2`.
    .sort((a, b) => chunkIndex(a.name) - chunkIndex(b.name));

  if (parts.length === 0) return 'absent';

  try {
    let raw = parts.map((cookie) => cookie.value).join('');

    if (raw.startsWith(BASE64_PREFIX)) {
      raw = decodeBase64(raw.slice(BASE64_PREFIX.length));
    }

    const session = JSON.parse(raw) as { expires_at?: unknown };

    return typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)
      ? session.expires_at * 1000
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

function chunkIndex(name: string): number {
  const match = name.match(/\.(\d+)$/);
  return match ? Number(match[1]) : -1;
}

/** Supabase writes base64url, which `atob` does not accept unmodified. */
function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);

  // The session JSON carries display names and emails, so it is not ASCII.
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
