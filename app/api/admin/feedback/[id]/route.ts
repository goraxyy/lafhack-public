import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminViewer } from '@/lib/admin';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@/lib/types';

export const runtime = 'nodejs';

/** Move one feedback item between new / triaged / done. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminViewer();
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => ({}))) as { status?: string };

  if (!FEEDBACK_STATUSES.includes(body.status as FeedbackStatus)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  }

  const status = body.status as FeedbackStatus;
  const handled = status === 'done';

  const { error } = await createAdminClient()
    .from('feedback')
    .update({
      status,
      handled_by: handled ? guard.viewer.id : null,
      handled_at: handled ? new Date().toISOString() : null,
    })
    .eq('id', params.id);

  if (error) {
    console.error('Failed to update feedback', error);
    return NextResponse.json({ error: 'Could not update it.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
