import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Where Supabase sends people back after they click an emailed link.
 *
 * Password recovery uses PKCE: the email link carries a one-time `code` that
 * has to be exchanged for a session server-side, so the session cookie is set
 * before the reset page renders. Without this hop the reset page loads with no
 * session and updateUser() fails with "Auth session missing".
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  // Only ever redirect within this site.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=missing-code', url.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/forgot-password?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
