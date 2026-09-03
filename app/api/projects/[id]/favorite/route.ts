import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { ACCESS_COLUMNS, canViewProject } from '@/lib/projectAccess';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return toggleFavorite(params.id, 'add');
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  return toggleFavorite(params.id, 'remove');
}

async function toggleFavorite(projectId: string, action: 'add' | 'remove') {
  const viewer = await getViewer();

  if (!viewer) {
    return NextResponse.json(
      { error: 'Sign in to favorite a sketch.' },
      { status: 401 }
    );
  }

  const adminClient = createAdminClient();

  const { data: project, error } = await adminClient
    .from('projects')
    .select(`id, favorite_count, ${ACCESS_COLUMNS}`)
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      favorite_count: number;
      owner_id: string | null;
      visibility: string;
      status: string;
      review_status: string;
    }>();

  if (error || !project || !canViewProject(project, viewer)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (action === 'add') {
    const { error: insertError } = await adminClient
      .from('favorites')
      .upsert(
        { user_id: viewer.id, project_id: projectId },
        { onConflict: 'user_id,project_id', ignoreDuplicates: true }
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  } else {
    const { error: deleteError } = await adminClient
      .from('favorites')
      .delete()
      .eq('user_id', viewer.id)
      .eq('project_id', projectId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  // Read back rather than guessing: the count is trigger-maintained, and an
  // ignored duplicate insert must not look like it added one.
  const { data: updated } = await adminClient
    .from('projects')
    .select('favorite_count')
    .eq('id', projectId)
    .maybeSingle<{ favorite_count: number }>();

  return NextResponse.json({
    projectId,
    isFavorite: action === 'add',
    favoriteCount: updated?.favorite_count ?? project.favorite_count,
  });
}
