import { Github, MessageCircle } from 'lucide-react';
import { Logo } from '@/components/logo';
import { FeedbackWidget } from '@/components/feedback-widget';

export function Footer() {
  return (
    <footer className="border-t border-ink-100">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-start gap-3">
            <Logo />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href="https://github.com/goraxyy/lafhack"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                Source
              </a>

              <a
                href="https://discord.gg/n6CJxnwZRS"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
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
