import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { getSchemaHealth, type SchemaHealth } from '@/lib/schemaHealth';

export interface AccessDiagnostics {
  /** Which Supabase project the server is talking to, from the URL. */
  projectRef: string | null;
  signedInAs: string | null;
  userId: string | null;
  /** False means the service-role key cannot read profiles at all. */
  serviceRoleWorks: boolean;
  serviceRoleError: string | null;
  profileFound: boolean;
  role: string | null;
  isAdmin: boolean;
  schema: SchemaHealth;
}

function projectRefFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

/**
 * Answers "why can't I get into /admin?" without needing database access.
 *
 * The three causes look identical from the outside -- the page just 404s -- so
 * this separates them: the service-role key pointing at a different project,
 * no profiles row for this user, or a row whose role is still 'user'.
 */
export async function getAccessDiagnostics(): Promise<AccessDiagnostics> {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  const projectRef = projectRefFrom(process.env.NEXT_PUBLIC_SUPABASE_URL);

  let serviceRoleWorks = false;
  let serviceRoleError: string | null = null;
  let profileFound = false;
  let role: string | null = null;

  try {
    const db = createAdminClient();

    // A count query touches no user data but proves the key is valid for this
    // project -- a key from a different project fails here.
    const probe = await db.from('profiles').select('id', { count: 'exact', head: true });
    serviceRoleWorks = !probe.error;
    serviceRoleError = probe.error?.message ?? null;

    if (serviceRoleWorks && user) {
      const { data } = await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle<{ role: string }>();

      profileFound = Boolean(data);
      role = data?.role ?? null;
    }
  } catch (error) {
    serviceRoleError = error instanceof Error ? error.message : 'Unknown error';
  }

  return {
    projectRef,
    signedInAs: user?.email ?? null,
    userId: user?.id ?? null,
    serviceRoleWorks,
    serviceRoleError,
    profileFound,
    role,
    isAdmin: role === 'admin',
    schema: await getSchemaHealth(),
  };
}
