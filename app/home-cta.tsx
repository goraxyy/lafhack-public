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
            Upload a sketch
          </ButtonLink>
        ) : (
          <ButtonLink href="/signup" variant="secondary">
            Create account
          </ButtonLink>
        ))}
    </div>
  );
}

/** The closing banner, which is a signup pitch until you have signed up. */
export function ClosingCta() {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);

  return (
    <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-ink-100 p-10 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-2xl font-semibold text-ink">
          {signedIn ? 'Ready to publish your next sketch?' : 'Ready to publish your first sketch?'}
        </h2>
        <p className="mt-2 text-ink-500">
          {signedIn
            ? 'Drop in a folder or a ZIP and it is playable in minutes.'
            : 'Sign up and upload a project in minutes.'}
        </p>
      </div>

      <ButtonLink href={signedIn ? '/upload' : '/signup'} variant="primary" className="shrink-0">
        {signedIn ? 'Upload a sketch' : 'Get started'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ButtonLink>
    </div>
  );
}
