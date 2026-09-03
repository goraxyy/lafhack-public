import { NextRequest, NextResponse } from 'next/server';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_FEEDBACK_LENGTH } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Submissions allowed from one source per hour.
 *
 * This route is deliberately open to signed-out visitors, which also makes it
 * the only unauthenticated write in the app -- so without a cap anyone could
 * fill the table. Keyed on the user when signed in, and on the forwarded
 * client IP when not.
 */
const MAX_FEEDBACK_PER_HOUR = 10;

interface FeedbackRequest {
  message?: string;
  email?: string;
  pagePath?: string;
}

/**
 * Accepts a feedback submission from the footer box.
 *
 * Open to signed-out visitors on purpose: the people most likely to hit a
 * broken sign-up are the ones who cannot sign in to report it.
 */
export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as FeedbackRequest;

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
  }

  if (message.length > MAX_FEEDBACK_LENGTH) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_FEEDBACK_LENGTH} characters.` },
      { status: 400 }
    );
  }

  // Signed in is a bonus, not a requirement.
  let userId: string | null = null;
  let accountEmail: string | null = null;
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    userId = user?.id ?? null;
    accountEmail = user?.email ?? null;
  } catch {
    // A broken session must not stop someone reporting that it is broken.
  }

  const typedEmail = typeof payload.email === 'string' ? payload.email.trim() : '';

  // The path is only a hint for triage, so keep it same-origin and short
  // rather than storing whatever the client sent.
  const rawPath = typeof payload.pagePath === 'string' ? payload.pagePath : '';
  const pagePath =
    rawPath.startsWith('/') && !rawPath.startsWith('//') ? rawPath.slice(0, 200) : null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: 'The server is missing its Supabase credentials.' },
      { status: 500 }
    );
  }

  // A shared NAT can collapse several people onto one IP, so the cap is
  // generous enough not to catch a classroom and small enough to stop a script.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const identity = userId
    ? { column: 'user_id' as const, value: userId }
    : { column: 'client_ip' as const, value: clientIp(request) };

  if (identity.value) {
    const { count, error: countError } = await admin
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq(identity.column, identity.value)
      .gte('created_at', since);

    if (countError) {
      // Fail open: a broken count must not silence real feedback.
      console.error('Feedback rate-limit check failed', countError.message);
    } else if ((count ?? 0) >= MAX_FEEDBACK_PER_HOUR) {
      return NextResponse.json(
        { error: 'That is a lot of feedback in one hour. Try again later.' },
        { status: 429 }
      );
    }
  }

  const { error } = await admin.from('feedback').insert({
    client_ip: identity.column === 'client_ip' ? identity.value : null,
    user_id: userId,
    email: typedEmail || accountEmail,
    message,
    page_path: pagePath,
  });

  if (error) {
    console.error('Failed to save feedback', error);

    // 42P01 undefined_table / PGRST205 unknown table: the migration has not
    // been run, which is a different fix from "try again".
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'Feedback is not set up yet — run supabase/migrations/008_feedback.sql.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Could not send your feedback.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * The client address, from the proxy headers Vercel sets.
 *
 * Both are attacker-settable in principle, so this is a spam speed bump and
 * not an identity: someone determined can rotate the header and get a fresh
 * bucket. Signed-in submissions are keyed on the user id instead, which cannot
 * be spoofed.
 */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim().slice(0, 64) || null;

  const real = request.headers.get('x-real-ip');
  return real ? real.trim().slice(0, 64) : null;
}
