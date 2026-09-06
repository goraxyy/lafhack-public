import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { ACCESS_COLUMNS, canViewProject } from '@/lib/projectAccess';
import { STORAGE_BUCKET } from '@/lib/storage';

export const runtime = 'nodejs';

const TABLE_EXTENSIONS = ['.csv', '.tsv'];

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from('projects')
    .select(`id, title, bundle_pde_path, error_message, ${ACCESS_COLUMNS}`)
    .eq('id', params.id)
    .maybeSingle<{
      id: string;
      title: string;
      bundle_pde_path: string | null;
      error_message: string | null;
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

  if (project.status !== 'ready' || !project.bundle_pde_path) {
    return NextResponse.json(
      { error: project.error_message ?? 'Project is not ready yet.' },
      { status: 409 }
    );
  }

  const filesBase = `/api/projects/${project.id}/files/`;
  const bundleUrl = `${filesBase}bundle.pde`;
  const dataBase = `${filesBase}data/`;

  // Processing's loadTable() is synchronous, so the player has to have the CSV
  // text in hand before setup() runs. List them here rather than guessing.
  const tables = await listTableAssets(adminClient, project.id);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.title)}</title>
    <!--
      Sketch assets live in data/, which is also where Processing resolves
      loadImage("foo.png") and @font-face urls from. Making it the document
      base means unqualified asset names in the sketch just work.
    -->
    <base href="${escapeHtml(dataBase)}" />
    <style>
      html, body { margin: 0; padding: 0; background: #0b0f14; color: #fff; }
      canvas { display: block; margin: 0 auto; }
      /*
        Belt and braces for Processing.js's on-page console. The shim rewires
        println() to the browser console, but if the panel is ever appended
        anyway it must not sit on top of the sketch.
      */
      .pjsconsole { display: none !important; }
      #error {
        display: none;
        color: #ff8f8f;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        line-height: 1.5;
        padding: 16px;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div id="error"></div>
    <canvas id="sketch"></canvas>
    <script src="/processing-compat.js"></script>
    <script src="/processing.min.js"></script>
    <script>
      (function () {
        var reported = false;

        function report(message, detail) {
          if (reported) return;
          reported = true;

          var element = document.getElementById('error');
          element.style.display = 'block';
          element.textContent = 'Sketch runtime error: ' + message + (detail ? '\\n\\n' + detail : '');
          console.error('Sketch runtime error:', message, detail || '');
        }

        // Processing.js compiles the sketch with new Function(), so a bad
        // sketch surfaces here rather than as a rejected promise.
        window.addEventListener('error', function (event) {
          var error = event.error;
          report(
            (error && error.message) || event.message || 'Unknown error',
            error && error.stack ? String(error.stack) : ''
          );
        });

        window.addEventListener('unhandledrejection', function (event) {
          var reason = event.reason;
          report(
            (reason && reason.message) || String(reason) || 'Unknown error',
            reason && reason.stack ? String(reason.stack) : ''
          );
        });

        // Volume control lives in the page around this iframe. Only same-origin
        // messages are honoured -- the frame is sandboxed with
        // allow-same-origin, so anything else reaching it is not the player.
        window.addEventListener('message', function (event) {
          if (event.origin !== window.location.origin) return;

          var data = event.data;
          if (!data || data.type !== 'lafhack:volume') return;

          var level = Number(data.value);
          if (!isFinite(level)) return;

          window.ProcessingCompat.setMasterVolume(level);
        });

        // The sketch decides its own size(), and the frame around it cannot
        // know what that is until the sketch has run.
        //
        // Watching for it is the whole difficulty. Sketches with a @pjs
        // preload directive do not reach setup() until their images have
        // loaded, so the canvas is still the default 300x150 when
        // ProcessingCompat.run() resolves -- reporting once, there, pins the
        // frame at the wrong size. A ResizeObserver catches the change when
        // it comes, but only while the page is being rendered; a tab in the
        // background delivers nothing.
        //
        // So: both, plus a bounded poll that does not depend on either. Sizes
        // are deduplicated, so the repeats cost one comparison and the parent
        // hears only about real changes.
        var lastReported = '';

        function reportSize() {
          if (window.parent === window) return;

          var canvas = document.getElementById('sketch');
          var width = canvas.offsetWidth || canvas.width;
          var height = canvas.offsetHeight || canvas.height;
          if (!width || !height) return;

          var key = width + 'x' + height;
          if (key === lastReported) return;
          lastReported = key;

          window.parent.postMessage(
            { type: 'lafhack:size', width: width, height: height },
            window.location.origin
          );
        }

        function watchSize() {
          reportSize();

          if (window.ResizeObserver) {
            new ResizeObserver(reportSize).observe(document.getElementById('sketch'));
          }

          // Ten seconds is longer than any preload worth waiting for, and the
          // observer above covers a sketch that resizes itself after that.
          var polls = 0;
          var timer = setInterval(function () {
            reportSize();
            polls += 1;
            if (polls >= 40) clearInterval(timer);
          }, 250);
        }

        window.ProcessingCompat.run({
          canvas: document.getElementById('sketch'),
          bundleUrl: ${scriptJson(bundleUrl)},
          dataBase: ${scriptJson(dataBase)},
          tables: ${scriptJson(tables)},
          onError: function (error) {
            report(error.message, error.stack ? String(error.stack) : '');
          }
        }).then(watchSize);
      }());
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': SKETCH_CSP,
      'Cache-Control': 'no-store',
    },
  });
}

async function listTableAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  projectId: string
): Promise<string[]> {
  const { data, error } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .list(`normalized/${projectId}/data`, { limit: 1000 });

  if (error || !data) return [];

  return data
    .filter((item) =>
      TABLE_EXTENSIONS.some((extension) => item.name.toLowerCase().endsWith(extension))
    )
    .map((item) => item.name);
}

/**
 * The page runs arbitrary user code, so the job here is not to stop the sketch
 * scripting -- it cannot be stopped -- but to fence in what it can reach.
 *
 * `'unsafe-eval'` is unavoidable: Processing.js compiles the sketch with
 * `new Function()`. `'unsafe-inline'` covers the bootstrap below. What the
 * policy does buy is `default-src 'none'` plus `connect-src 'self'`: a sketch
 * (or anything injected into this page) cannot call out to another origin, so
 * it has nowhere to send what it scrapes. Every asset is proxied through
 * /api/projects/[id]/files/, and processing.min.js is served from /public, so
 * nothing here needs a third-party origin.
 */
const SKETCH_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

/**
 * JSON for embedding inside a <script> block.
 *
 * JSON.stringify alone is not enough: a string containing `</script>` closes
 * the block early no matter how the quotes are escaped, and U+2028/U+2029 are
 * literal line terminators in JS source. Asset names reach this from upload
 * filenames, so they are attacker-chosen.
 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
