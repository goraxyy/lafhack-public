"use client";

import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

/**
 * The hero buttons. "Create account" is pointless once you have one, so it is
 * only rendered for signed-out visitors -- and not while auth is still
 * resolving, otherwise it flashes in and out on every load.
 */
export function HeroCta() {
  const { user, loading } = useAuth();

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <ButtonLink href="/gallery" variant="primary">
        Browse gallery
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ButtonLink>

      {!loading &&
        (user ? (
          <ButtonLink href="/upload" variant="secondary">
            Upload a project
          </ButtonLink>
        ) : (
          <ButtonLink href="/signup" variant="secondary">
            Create account
          </ButtonLink>
        ))}
    </div>
  );
}

/**
 * The closing banner, which is a signup pitch until you have signed up.
 *
 * Signed out it says what an account is *for* -- putting your own work in
 * front of people -- and that browsing needs no account, because most visitors
 * are here to play rather than to upload.
 */
export function ClosingCta() {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);

  return (
    <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-l-2 border-ink-100 border-l-accent p-10 sm:flex-row sm:items-center">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          {signedIn ? 'Got something else to show?' : 'Let people play what you made.'}
        </h2>
        <p className="mt-2 text-ink-500">
          {signedIn
            ? 'Drop in a folder or a ZIP and people can be playing it in minutes.'
            : 'An account is for putting your own work up. Playing what is already here needs nothing at all.'}
        </p>
      </div>

      <ButtonLink href={signedIn ? '/upload' : '/signup'} variant="primary" className="shrink-0">
        {signedIn ? 'Upload a project' : 'Get started'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ButtonLink>
    </div>
  );
}
