# LafHack

Upload a Processing sketch, get a link that plays it in the browser.

Processing is what a lot of people write their first real program in — an
animation, a game, something with sound. Then the course ends and the work
disappears, because sharing it means asking someone to install Processing and
open a folder of `.pde` files. LafHack exists so a sketch can be a URL instead.

**This repository is a reading copy of the source.** It is published so the
code can be looked at. It is not runnable: the database schema, the migrations,
the storage configuration and the environment templates are not included, and
no credentials are published. See the licence at the bottom.

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
which is what they are in Processing. Two tabs both defining `setup()` is a
duplicate method and is rejected here with the filenames, rather than surfacing
in the browser later as a stack trace nobody can act on.

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
are proxied through an authenticated route rather than served publicly.

`processing.sound.SoundFile` is shimmed over an HTML5 `<audio>` element,
including the retry hook browsers need because autoplay is blocked until the
viewer interacts with the page. The player has a volume control, which reaches
sounds a sketch creates after start-up and multiplies rather than replaces the
sketch's own `amp()` levels.

## The rest of it

**Review before publication.** Nothing reaches the gallery until an admin has
opened it and approved it. Approval gates the public, not the author — an
uploader can play their own sketch while it waits, and an admin has to be able
to play it in order to review it at all.

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
