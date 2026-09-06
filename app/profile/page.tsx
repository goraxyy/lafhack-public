import { redirect } from 'next/navigation';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
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
    // Rejected sketches are excluded: rejecting deletes the uploaded files,
    // so the row is a tombstone rather than something the owner can open,
    // play, or fix.
    supabase
      .from('projects')
      .select('*')
      .eq('owner_id', user.id)
      .neq('review_status', 'rejected')
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

  return (
    <ProfileView
      user={data.user}
      nickname={data.nickname}
      avatarColor={data.avatarColor}
      projects={data.projects}
    />
  );
}
