import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { ACCESS_COLUMNS, canViewProject } from '@/lib/projectAccess';
import {
  ensureThumbnailFile,
  MAX_THUMBNAIL_BYTES,
  thumbnailContentType,
} from '@/lib/uploadSecurity';
import { STORAGE_BUCKET } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from('projects')
    .select(`thumbnail_path, ${ACCESS_COLUMNS}`)
    .eq('id', params.id)
    .maybeSingle<{
      thumbnail_path: string | null;
      owner_id: string | null;
      visibility: string;
      status: string;
      review_status: string;
    }>();

  if (error || !project || !project.thumbnail_path) {
    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  }

  if (!canViewProject(project, viewer)) {
    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  }

  // The stored path is written by the upload route, never by the client.
  if (!project.thumbnail_path.startsWith(`thumbnails/${params.id}/`)) {
    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  }

  const { data: file, error: downloadError } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .download(project.thumbnail_path);

  if (downloadError || !file) {
    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  }

  const extension = project.thumbnail_path.split('.').pop() ?? '';

  return new NextResponse(file, {
    headers: {
      // From the extension, never file.type -- the stored type comes from
      // whatever the uploader declared, same hole the asset route had.
      'Content-Type': thumbnailContentType(extension),
      'X-Content-Type-Options': 'nosniff',
      // Thumbnails are replaceable now, so a long cache would show a stale
      // image after a change. Revalidate instead of guessing.
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

/**
 * Replace a sketch's cover image.
 *
 * The file comes through this route rather than a signed URL: it is capped at
 * 5MB, under Vercel's request body limit, and routing it through the
 * server means the size and type are checked before anything is stored --
 * unlike the sketch upload, where the browser talks to Storage directly.
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();

  if (!viewer) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from('projects')
    .select('id, owner_id, thumbnail_path')
    .eq('id', params.id)
    .maybeSingle<{ id: string; owner_id: string | null; thumbnail_path: string | null }>();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // The owner, or an admin fixing someone's broken cover.
  if (project.owner_id !== viewer.id && viewer.role !== 'admin') {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get('file');
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'Choose an image first.' }, { status: 400 });
  }

  let extension: string;
  try {
    extension = ensureThumbnailFile(file.name, file.size);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : 'Unsupported image.' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: 'Thumbnail is too large.' }, { status: 400 });
  }

  const storagePath = `thumbnails/${params.id}/cover.${extension}`;

  const { error: uploadError } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: thumbnailContentType(extension),
      upsert: true,
    });

  if (uploadError) {
    console.error('Thumbnail upload failed', uploadError);
    return NextResponse.json({ error: 'Could not store the image.' }, { status: 500 });
  }

  // A different extension means a different object; drop the old one so the
  // folder does not accumulate covers.
  if (project.thumbnail_path && project.thumbnail_path !== storagePath) {
    await adminClient.storage.from(STORAGE_BUCKET).remove([project.thumbnail_path]);
  }

  const { error: updateError } = await adminClient
    .from('projects')
    .update({ thumbnail_path: storagePath })
    .eq('id', params.id);

  if (updateError) {
    console.error('Thumbnail path update failed', updateError);
    return NextResponse.json({ error: 'Could not save the image.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, thumbnailPath: storagePath });
}
