import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminViewer } from '@/lib/admin';

export const runtime = 'nodejs';

/**
 * Clear a failed compile off the admin dashboard, or put it back.
 *
 * Only the moderation columns move. `status` and `error_message` are left
 * exactly as the compile left them, because the error text is the most useful
 * thing this app produces for debugging itself, and "I have dealt with this"
 * is not the same claim as "this did not happen".
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminViewer();
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => ({}))) as { cleared?: unknown };

  if (typeof body.cleared !== 'boolean') {
    return NextResponse.json({ error: 'cleared must be true or false.' }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: project, error: readError } = await adminClient
    .from('projects')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle<{ id: string; status: string }>();

  if (readError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Clearing something that did not fail would hide it from a list it was
  // never on, and quietly stamp a moderation column on a healthy project.
  if (!['failed', 'error'].includes(project.status)) {
    return NextResponse.json(
      { error: `This project is "${project.status}", not a failed compile.` },
      { status: 409 }
    );
  }

  const { error } = await adminClient
    .from('projects')
    .update({
      failure_cleared_at: body.cleared ? new Date().toISOString() : null,
      failure_cleared_by: body.cleared ? guard.viewer.id : null,
    })
    .eq('id', params.id);

  if (error) {
    console.error('Failed to update failure triage', params.id, error);
    return NextResponse.json({ error: 'Could not update it.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleared: body.cleared });
}
