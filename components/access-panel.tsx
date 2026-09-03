import Link from 'next/link';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import type { AccessDiagnostics } from '@/lib/accessDiagnostics';

/**
 * Shown on /profile so an admin who cannot reach /admin can see why. The page
 * 404s identically for every cause, which makes it impossible to tell a
 * misconfigured key from an ungranted role without something like this.
 */
export function AccessPanel({ diagnostics }: { diagnostics: AccessDiagnostics }) {
  const rows: Array<{ label: string; value: string; ok: boolean }> = [
    {
      label: 'Supabase project',
      value: diagnostics.projectRef ?? 'not configured',
      ok: Boolean(diagnostics.projectRef),
    },
    {
      label: 'Server key valid for that project',
      value: diagnostics.serviceRoleWorks
        ? 'yes'
        : `no — ${diagnostics.serviceRoleError ?? 'cannot read profiles'}`,
      ok: diagnostics.serviceRoleWorks,
    },
    {
      label: 'Your profile row',
      value: diagnostics.profileFound ? 'found' : 'missing',
      ok: diagnostics.profileFound,
    },
    {
      label: 'Your role',
      value: diagnostics.role ?? 'unknown',
      ok: diagnostics.isAdmin,
    },
    {
      label: 'Migrations 005 / 006',
      value:
        diagnostics.schema.missing.length === 0
          ? 'applied'
          : `missing: ${diagnostics.schema.missing.join(', ')}`,
      ok: diagnostics.schema.missing.length === 0,
    },
  ];

  return (
    <section className="mt-12 rounded-lg border border-ink-100 p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium text-ink">
        <ShieldAlert className="h-4 w-4 text-ink-300" aria-hidden="true" />
        Access &amp; setup
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        What the server sees for your account. Useful when <code>/admin</code> is not
        letting you in.
      </p>

      <dl className="mt-4 divide-y divide-ink-100 border-y border-ink-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-sm text-ink-500">{row.label}</dt>
            <dd className="flex items-center gap-2 text-right text-sm font-medium text-ink">
              <span className="break-all">{row.value}</span>
              {row.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              )}
            </dd>
          </div>
        ))}
      </dl>

      {!diagnostics.isAdmin && <Remedy diagnostics={diagnostics} />}

      {diagnostics.isAdmin && (
        <p className="mt-4 text-sm text-ink-500">
          You are an admin.{' '}
          <Link href="/admin" className="font-medium text-accent hover:underline">
            Open the admin dashboard
          </Link>
          .
        </p>
      )}
    </section>
  );
}

function Remedy({ diagnostics }: { diagnostics: AccessDiagnostics }) {
  let title: string;
  let body: React.ReactNode;

  if (!diagnostics.serviceRoleWorks) {
    title = 'The server cannot reach this project';
    body = (
      <>
        <code>SUPABASE_SERVICE_ROLE_KEY</code> is missing, or belongs to a different
        project than <code>NEXT_PUBLIC_SUPABASE_URL</code> (
        <code>{diagnostics.projectRef ?? 'unset'}</code>). Until this matches, every
        server-side read fails — the gallery looks empty and nobody can be an admin.
        Copy the service_role key from that project&apos;s API settings into Vercel and
        redeploy.
      </>
    );
  } else if (!diagnostics.profileFound) {
    title = 'You have no profile row';
    body = (
      <>
        Your account exists in <code>auth.users</code> but has no row in{' '}
        <code>public.profiles</code>, so it has no role. Running{' '}
        <code>006_lock_down_set_admin_role.sql</code> backfills it.
      </>
    );
  } else {
    title = 'Your role is not admin';
    body = (
      <>
        Run this in the SQL editor of project <code>{diagnostics.projectRef}</code> —
        granting it on any other project has no effect here:
        <code className="mt-2 block rounded bg-ink-50 px-2 py-1.5 text-xs">
          select public.set_admin_role(&apos;{diagnostics.signedInAs ?? 'you@example.com'}&apos;);
        </code>
        Then log out and back in.
      </>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">{title}</p>
      <div className="mt-1 space-y-1">{body}</div>
    </div>
  );
}
