import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { ACCESS_COLUMNS, canViewProject } from '@/lib/projectAccess';
import { isPubliclyBrowsable } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Records one play: bumps the project's total, and (for a signed-in viewer)
 * updates their play history so /play can show what they were last playing.
 *
 * Owner and admin previews of a not-yet-approved sketch do not count -- the
 * numbers on the gallery should reflect actual players.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from('projects')
    .select(`id, ${ACCESS_COLUMNS}`)
    .eq('id', params.id)
    .maybeSingle<{
      id: string;
      owner_id: string | null;
      visibility: string;
      status: string;
      review_status: string;
    }>();

  if (error || !project || !canViewProject(project, viewer)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!isPubliclyBrowsable(project)) {
    return NextResponse.json({ counted: false });
  }

  const { error: recordError } = await adminClient.rpc('record_play', {
    target_project_id: params.id,
    viewer_id: viewer?.id ?? null,
  });

  if (recordError) {
    // A missed play count should never break the player.
    console.warn('Failed to record play', {
      projectId: params.id,
      message: recordError.message,
    });
    return NextResponse.json({ counted: false });
  }

  return NextResponse.json({ counted: true });
}
