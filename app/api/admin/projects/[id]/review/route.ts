import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminViewer } from '@/lib/admin';
import { projectStoragePrefixes } from '@/lib/storage';
import { clearStoragePrefix } from '@/lib/storageCleanup';

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
    .select('id, status, review_status, bundle_pde_path')
    .eq('id', params.id)
    .maybeSingle<{
      id: string;
      status: string;
      review_status: string;
      bundle_pde_path: string | null;
    }>();

  if (readError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // A decided review is final, and the notes with it.
  //
  // Rejecting deleted the sketch's files, so there is nothing left to review a
  // second time and nothing an edited note could change about it. Approving
  // published it, and the note is the record of that decision; letting it be
  // rewritten later would leave the record disagreeing with what happened.
  //
  // Note what this costs: there is now no way to take an approved sketch back
  // out of the gallery through this route. That is deliberate, but it means
  // un-publishing needs its own action rather than a second review.
  if (project.review_status !== 'pending') {
    return NextResponse.json(
      {
        error:
          project.review_status === 'rejected'
            ? 'This sketch was already rejected and its files were deleted. The decision and its notes cannot be changed — ask the uploader to submit it again.'
            : 'This sketch has already been approved. Its review and notes are final.',
      },
      { status: 409 }
    );
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

  // Belt and braces behind the check above: whatever emptied the path columns,
  // a project with no bundle has nothing to serve, and approving it would
  // publish a gallery tile with nothing behind it.
  if (decision === 'approved' && !project.bundle_pde_path) {
    return NextResponse.json(
      {
        error:
          'This sketch has no compiled bundle, so there is nothing to publish — ask the uploader to submit it again.',
      },
      { status: 409 }
    );
  }

  // Rejecting deletes the sketch's files: the raw upload, the compiled bundle
  // and assets, and the cover image. Nothing rejected is ever served again, so
  // keeping megabytes of it costs storage for no purpose.
  //
  // Storage first, then the row. The prefixes are derived from the project id
  // alone, so if this fails halfway the leftovers are still findable by id --
  // whereas clearing the path columns first would orphan files with no record
  // of where they went.
  let purgedFiles: number | null = null;
  if (decision === 'rejected') {
    try {
      let removed = 0;
      for (const prefix of projectStoragePrefixes(params.id)) {
        removed += await clearStoragePrefix(adminClient, prefix);
      }
      purgedFiles = removed;
    } catch (caught) {
      // The moderation decision matters more than the cleanup, and the files
      // remain locatable by id, so record the rejection anyway rather than
      // leaving the sketch live because Storage had a bad minute.
      console.error('Failed to purge storage for rejected project', params.id, caught);
    }
  }

  const { data: updated, error } = await adminClient
    .from('projects')
    .update({
      review_status: decision,
      review_notes: body.notes?.trim() || null,
      reviewed_by: guard.viewer.id,
      reviewed_at: new Date().toISOString(),
      // Only cleared when the files actually went, so the row never claims
      // storage is empty while objects are still sitting there.
      ...(purgedFiles !== null
        ? {
            raw_folder_path: null,
            bundle_pde_path: null,
            assets_folder_path: null,
            thumbnail_path: null,
          }
        : {}),
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

  return NextResponse.json({
    project: updated,
    ...(decision === 'rejected'
      ? { purgedFiles, filesPurged: purgedFiles !== null }
      : {}),
  });
}
