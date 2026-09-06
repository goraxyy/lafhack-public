# LafHack

Projects made at Lafayette College, playable in the browser.

Processing is what a lot of people write their first real program in — an
animation, a game, something with sound. Then the course ends and the work goes
quiet, because showing it to anyone means asking them to install Processing and
open a folder of `.pde` files. LafHack exists so a project can be a URL
instead: uploaded once, played by anyone with the link, and credited to whoever
made it.

Processing is what runs today. Unity builds, static sites and research projects
are the shape of the thing next.

**This repository is a reading copy of the source.** It is published so the
code can be looked at. It is not runnable: the database schema, the migrations,
the storage configuration, the CI workflows and the environment templates are
not included, and no credentials are published. See the licence at the bottom.

---

## What it does

Someone uploads a folder or a ZIP. LafHack works out which file is the main
sketch, merges the tabs, rewrites the parts of Java that Processing.js cannot
run, copies the assets, and stores the result. An admin plays it and approves
it. Then it is in the gallery, playable by anyone with the link.

The interesting problem is the middle step, because Processing sketches are
Java, and browsers are not.

## How a sketch becomes a web page

**1. Upload.** The browser sends a manifest first and receives one signed URL
per file, then uploads straight to storage. Nothing large passes through a
serverless function, which is what makes a 25MB sketch of images and audio
possible at all.

**2. Compile** — `lib/compileProject.ts`. Processing treats every `.pde` tab in
a folder as one class, so the first job is finding the real sketch. It reads
`sketch.properties` if there is one, otherwise looks for the tab that defines
both `setup()` and `draw()`. `.java` tabs come along as supplementary classes,
which is what they are in Processing.

Most of this file exists because of what real uploads turn out to look like.
Finder's leftovers — `__MACOSX/` resource forks, `.DS_Store` at every level —
are filtered ahead of the filename rules rather than tripping them. A folder
holding several sketches, which Processing cannot merge and this used to
silently pick one of, is refused by name (`lib/sketchLayout.ts`). A `data/`
folder that exists but is missing one image compiles and reports the gap,
because that is what Processing itself does.

**3. Make it browser-compatible** — `lib/processingCompat.ts`. Processing.js
is an old, incomplete Java. This pass rewrites what it cannot take:

- `import processing.sound.*` and friends are dropped — there is no browser
  equivalent to import.
- Lambdas become anonymous classes, because Processing.js predates them.
- A nested `interface` is hoisted out of its enclosing class.
- A function shadowed by a field of the same name is renamed, since Processing.js
  resolves both through one scope.
- `key + "text"` is wrapped, because `key` is a char and JavaScript would do
  arithmetic on it.
- Referenced images, fonts and tables are collected into `@pjs preload`
  directives, so they exist before `setup()` runs.

All of it works on a brace-depth map of the source rather than plain regex, so
a lambda inside a string literal or a commented-out `setup()` is not treated as
code. There is a test suite for exactly these cases.

**4. Play** — `app/api/projects/[id]/sketch/route.ts`. The sketch runs in a
sandboxed iframe with its own Content-Security-Policy. `'unsafe-eval'` is
unavoidable, since Processing.js compiles sketches with `new Function()`, so
the containment is everything around it: `default-src 'none'`, and
`connect-src 'self'` so a sketch has nowhere to send anything it reads. Assets
are proxied through an authorised route rather than served publicly.

Two gaps in Processing.js are filled at run time in `public/processing-compat.js`:

- `processing.sound.SoundFile` is shimmed over an HTML5 `<audio>` element,
  including the retry hook browsers need because autoplay is blocked until the
  viewer interacts with the page.
- `delay()` — which Processing.js ships as a function whose whole body throws —
  becomes a real pause. JavaScript cannot sleep, so it holds the thread, which
  is what Processing does too; the difference is that here the thread belongs
  to the page, so it comes with a budget no sketch can exceed.

The frame around the sketch sizes itself to whatever `size()` the sketch asked
for, reported up over `postMessage`. The sketch is not scaled to fit the frame,
because Processing.js reads `mouseX`/`mouseY` from the canvas's own
coordinates and a scaled canvas would put every click in the wrong place.

## The rest of it

**Review before publication.** Nothing reaches the gallery until an admin has
opened it and approved it. Approval gates the public, not the author — an
uploader can play their own sketch while it waits, and an admin has to be able
to play it in order to review it at all. Rejecting deletes the sketch's files;
a decided review is final, and its notes are the record of why.

**Uploads are treated as hostile.** An extension allowlist, per-file and total
size caps, a file-count cap, path-traversal checks on both the write and the
read path, and a filename character restriction. Content types are derived from
the extension and never from what the uploader declared, because uploads go
straight to storage and the uploader picks that header.

**Everything is server-authorised.** One access predicate decides who may open
a sketch, and every route that serves bytes calls it. Row-level security is the
backstop rather than the mechanism.

Also: a gallery with search and filters, favourites, play counts, per-viewer
history, profiles with a nickname and avatar colour, a thumbnail cropper that
frames to the gallery card's aspect ratio, password reset, and a feedback box
that reports which page it was sent from.

## Built with

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth,
Storage) · Processing.js · deployed on Vercel

## Licence

All rights reserved. This code is published to be read, not reused — see
[LICENSE](LICENSE). If you want to use part of it, ask.
