import { NextRequest, NextResponse } from 'next/server';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAvatarColor, MAX_NICKNAME_LENGTH } from '@/lib/types';

export const runtime = 'nodejs';

interface UpdateProfileRequest {
  displayName?: string | null;
  avatarColor?: string | null;
}

/**
 * Update the signed-in user's nickname and avatar colour.
 *
 * The write goes through the service-role client with an explicit two-column
 * payload. `role` lives on this same row, so the set of writable columns is
 * whitelisted here rather than being whatever the request body happens to
 * contain.
 */
export async function PATCH(request: NextRequest) {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Partial<UpdateProfileRequest>;

  const update: { display_name?: string | null; avatar_color?: string | null } = {};

  if ('displayName' in payload) {
    const nickname = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';

    if (nickname.length > MAX_NICKNAME_LENGTH) {
      return NextResponse.json(
        { error: `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }

    // Clearing the field falls back to the email local-part everywhere it is
    // rendered, so an empty string is stored as NULL rather than as "".
    update.display_name = nickname || null;
  }

  if ('avatarColor' in payload) {
    if (payload.avatarColor === null) {
      update.avatar_color = null;
    } else if (isAvatarColor(payload.avatarColor)) {
      update.avatar_color = payload.avatarColor;
    } else {
      return NextResponse.json({ error: 'Unknown avatar color.' }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // Missing SUPABASE_SERVICE_ROLE_KEY. Worth naming: otherwise this route
    // 500s with no body and the form shows its generic fallback.
    return NextResponse.json(
      { error: 'The server is missing its Supabase credentials.' },
      { status: 500 }
    );
  }

  const { data, error } = await admin
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select('id, email, display_name, avatar_color, role')
    .maybeSingle();

  if (error) {
    console.error('Failed to update profile', error);

    // 42703 is undefined_column; PGRST204 is PostgREST's schema cache saying
    // the same thing. Both mean the migration has not been run, which is a
    // very different fix from "try again".
    if (error.code === '42703' || error.code === 'PGRST204') {
      return NextResponse.json(
        {
          error:
            'The profiles table has no display_name/avatar_color column yet. ' +
            'Run supabase/migrations/007_profile_identity_and_final_project.sql.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `Could not save your profile: ${error.message}` },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  return NextResponse.json({ profile: data });
}
