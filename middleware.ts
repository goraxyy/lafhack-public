import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sessionExpiry } from '@/lib/sessionCookie';

/**
 * Keeps the Supabase auth cookies fresh for server-side code.
 *
 * `createBrowserClient` writes the session to cookies, but the access token
 * expires after an hour and a Server Component cannot write the refreshed one
 * back -- `cookieStore.set()` throws there, and lib/supabase/server.ts has to
 * swallow it. Without this middleware every server route therefore starts
 * seeing an expired session as "signed out": /admin 404s, /profile bounces to
 * /login, and uploads fail with 401, all while the client-side nav still shows
 * the account as signed in.
 *
 * Calling `getUser()` here is what triggers the refresh; the rewritten cookies
 * are copied onto both the outgoing request (so the page render sees them) and
 * the response (so the browser stores them).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Nothing to refresh if the app is not configured yet -- let the request
  // through rather than 500ing every route.
  if (!url || !anonKey) return response;

  // The refresh below is a network round trip to Supabase Auth, and it used to
  // happen on every single navigation -- ahead of the page's own queries, so it
  // was pure latency in front of every render. Two cases do not need it:
  //
  //   1. Nobody is signed in. There is no token, so there is nothing to
  //      refresh. Most gallery traffic is signed out and now pays nothing.
  //   2. The access token is nowhere near expiring. Refreshing an hour-long
  //      token on every click buys nothing.
  //
  // This is not a security shortcut. Nothing here decides access: every page
  // and route calls getViewer(), which validates the token with the auth
  // server. Skipping only means the cookie is left as it was found.
  const expiry = sessionExpiry(request.cookies.getAll());

  if (expiry === 'absent') return response;
  if (expiry !== 'unknown' && expiry - Date.now() > REFRESH_MARGIN_MS) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

/** Refresh once the token has this much life left, so it never lapses mid-visit. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

export const config = {
  matcher: [
    /*
     * Every path except Next's own assets and image files -- API routes are
     * included on purpose, since /api/projects also reads the session.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
