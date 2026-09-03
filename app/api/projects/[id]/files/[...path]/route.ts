import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { ACCESS_COLUMNS, canViewProject } from '@/lib/projectAccess';
import {
  contentTypeFor,
  ensureAllowedExtension,
  sanitizeRelativePath,
} from '@/lib/uploadSecurity';
import { STORAGE_BUCKET } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string; path: string[] } }
) {
  let relativePath: string;
  try {
    relativePath = sanitizeRelativePath((params.path ?? []).join('/'));
    ensureAllowedExtension(relativePath);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid file path.' },
      { status: 400 }
    );
  }

  const viewer = await getViewer();

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from('projects')
    .select(`id, bundle_pde_path, ${ACCESS_COLUMNS}`)
    .eq('id', params.id)
    .maybeSingle<{
      id: string;
      bundle_pde_path: string | null;
      owner_id: string | null;
      visibility: string;
      status: string;
      review_status: string;
    }>();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!canViewProject(project, viewer)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.status !== 'ready') {
    return NextResponse.json({ error: 'Project is not ready.' }, { status: 409 });
  }

  const storagePath =
    relativePath === 'bundle.pde' && project.bundle_pde_path
      ? project.bundle_pde_path
      : `normalized/${project.id}/${relativePath}`;

  const { data: fileData, error: downloadError } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  // From the extension, never from fileData.type. Uploads go straight to
  // Storage through a signed URL, so the uploader chooses the stored content
  // type -- a .png declared as text/html came back as HTML from our own
  // origin, and the player iframe runs `allow-scripts allow-same-origin`.
  const contentType = contentTypeFor(relativePath);

  return new NextResponse(fileData, {
    headers: {
      'Content-Type': contentType,
      // Belt and braces: stop the browser sniffing its way back to HTML.
      'X-Content-Type-Options': 'nosniff',
      // Navigating straight to an asset URL must not execute anything. This
      // has no effect on the same file loaded as an <img>/<audio>/font, which
      // is the only way the player uses it.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=60',
    },
  });
}
