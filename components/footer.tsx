import { Github } from 'lucide-react';
import { Logo } from '@/components/logo';
import { DiscordIcon } from '@/components/discord-icon';
import { FeedbackWidget } from '@/components/feedback-widget';

export function Footer() {
  return (
    <footer className="border-t border-ink-100">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-start gap-3">
            <Logo />

            {/* Says whose site this is. Without it the wordmark is the only
                thing placing LafHack anywhere at all. */}
            <p className="text-xs uppercase tracking-[0.1em] text-ink-300">
              Lafayette College · Easton, Pennsylvania
            </p>

            <div className="flex flex-col items-start gap-2">
              {/*
                Points at lafhack-public, the reading copy. The repository this
                is built from is private, so linking it would send everyone to
                a 404.
              */}
              <a
                href="https://github.com/goraxyy/lafhack-public"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-ink-500 transition-colors hover:text-ink"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                Source
              </a>

              <a
                href="https://discord.gg/n6CJxnwZRS"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-ink-500 transition-colors hover:text-ink"
              >
                <DiscordIcon className="h-4 w-4" />
                ACM Discord
              </a>
            </div>
          </div>

          {/* Right-aligned, but the form inside needs to stay left-aligned to
              read properly -- so align the wrapper, not the contents. */}
          <div className="flex w-full justify-start sm:w-auto sm:justify-end">
            <FeedbackWidget />
          </div>
        </div>
      </div>
    </footer>
  );
}
