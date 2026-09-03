import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminViewer } from '@/lib/admin';

export const runtime = 'nodejs';

const DECISIONS = ['approved', 'rejected', 'pending'] as const;
type Decision = (typeof DECISIONS)[number];

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminViewer();
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => ({}))) as {
    decision?: string;
    notes?: string;
  };

  if (!DECISIONS.includes(body.decision as Decision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${DECISIONS.join(', ')}` },
      { status: 400 }
    );
  }

  const decision = body.decision as Decision;
  const adminClient = createAdminClient();

  const { data: project, error: readError } = await adminClient
    .from('projects')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle<{ id: string; status: string }>();

  if (readError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Approving a sketch that never compiled would put a broken tile in the
  // gallery -- the whole point of the review step is that someone played it.
  if (decision === 'approved' && project.status !== 'ready') {
    return NextResponse.json(
      {
        error: `Cannot approve a sketch that is "${project.status}". It has to compile first.`,
      },
      { status: 409 }
    );
  }

  const { data: updated, error } = await adminClient
    .from('projects')
    .update({
      review_status: decision,
      review_notes: body.notes?.trim() || null,
      reviewed_by: guard.viewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, review_status, review_notes, reviewed_at')
    .maybeSingle();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to record the review.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ project: updated });
}
