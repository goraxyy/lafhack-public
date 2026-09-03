import { redirect } from 'next/navigation';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { getAccessDiagnostics } from '@/lib/accessDiagnostics';
import { getViewer } from '@/lib/admin';
import type { AvatarColor } from '@/lib/types';
import { ProfileView } from '@/app/profile/profile-view';

export const revalidate = 0;

async function getUserData() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Both reads go through the user client: `authenticated` now has SELECT on
  // profiles, and the policy scopes it to this person's own row.
  const [{ data: profile }, { data: projects }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, avatar_color')
      .eq('id', user.id)
      .maybeSingle<{ display_name: string | null; avatar_color: AvatarColor | null }>(),
    supabase
      .from('projects')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  return {
    user,
    nickname: profile?.display_name ?? null,
    avatarColor: profile?.avatar_color ?? null,
    projects: projects ?? [],
  };
}

export default async function ProfilePage() {
  const data = await getUserData();

  // "Access & setup" exists to tell an admin why /admin is refusing them. It
  // means nothing to an ordinary user, and it reports the Supabase project ref
  // and whether the server key works -- infrastructure detail that has no
  // business rendering for someone who is not an admin.
  const viewer = await getViewer();
  const diagnostics = viewer?.role === 'admin' ? await getAccessDiagnostics() : null;

  return (
    <ProfileView
      user={data.user}
      nickname={data.nickname}
      avatarColor={data.avatarColor}
      projects={data.projects}
      diagnostics={diagnostics}
    />
  );
}
