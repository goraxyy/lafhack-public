import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createUserClient } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/lib/types';

export interface Viewer {
  id: string;
  email: string | null;
  role: UserRole;
}

/**
 * The signed-in user plus their role, or null when signed out.
 *
 * The role is read with the service-role client on purpose: the `profiles`
 * RLS policies are for client-side reads, and every server route here already
 * decides access itself.
 *
 * Two Supabase round trips -- validate the token, then read the role -- so it
 * is memoised for the length of one request. `isAdmin()` calls it, pages call
 * it, and a page that does both would otherwise pay for all four.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return null;

  const adminClient = createAdminClient();
  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle<Pick<Profile, 'id' | 'role'>>();

  // A *failed* read is not the same as "this person is not an admin", and
  // silently conflating them cost a long debugging session: service_role was
  // missing its grant on public.profiles, so this errored, the role fell back
  // to 'user', and /admin returned 404 -- while the nav still showed the Admin
  // link, because that lookup runs client-side as `authenticated`. Downgrading
  // is still the safe default, but it must not happen quietly.
  if (error) {
    console.error(
      `getViewer: could not read profiles for ${user.id} -- treating as non-admin. ` +
        `This is an infrastructure failure, not a permissions decision. ` +
        `[${error.code}] ${error.message}`
    );
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role === 'admin' ? 'admin' : 'user',
  };
});

export async function isAdmin(): Promise<boolean> {
  const viewer = await getViewer();
  return viewer?.role === 'admin';
}

/**
 * Guard for admin API routes. Returns the viewer, or the Response to send
 * back -- 401 when signed out, 404 when signed in without the admin role so
 * the route's existence is not advertised.
 */
export async function requireAdminViewer(): Promise<
  { viewer: Viewer; response?: never } | { viewer?: never; response: Response }
> {
  const viewer = await getViewer();

  if (!viewer) {
    return {
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (viewer.role !== 'admin') {
    return {
      response: Response.json({ error: 'Not found' }, { status: 404 }),
    };
  }

  return { viewer };
}
