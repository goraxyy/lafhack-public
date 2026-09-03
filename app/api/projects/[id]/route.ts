import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { ACCESS_COLUMNS, canViewProject } from '@/lib/projectAccess';

export const runtime = 'nodejs';

interface ProjectStatusRow {
  id: string;
  title: string;
  owner_id: string | null;
  visibility: string;
  status: string;
  review_status: string;
  error_message: string | null;
  bundle_pde_path: string | null;
  updated_at: string;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from('projects')
    .select(`id, title, error_message, bundle_pde_path, updated_at, ${ACCESS_COLUMNS}`)
    .eq('id', params.id)
    .maybeSingle<ProjectStatusRow>();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!canViewProject(project, viewer)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      title: project.title,
      visibility: project.visibility,
      status: project.status,
      reviewStatus: project.review_status,
      errorMessage: project.error_message,
      bundlePdePath: project.bundle_pde_path,
      updatedAt: project.updated_at,
      playUrl: project.status === 'ready' ? `/play/${project.id}` : null,
    },
  });
}
