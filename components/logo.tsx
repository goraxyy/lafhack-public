import { CodeMark } from '@/components/code-mark';

/**
 * The wordmark.
 *
 * Set in the display serif rather than the UI sans: a serif wordmark is what
 * separates a college's mark from a product's, and it reads that way even at
 * nav size. The maroon lands twice and lightly -- the slash in the mark, and
 * the "Laf" in the name -- so the Lafayette half of both is what the colour
 * picks out.
 */
export function Logo() {
  return (
    <span className="flex items-center gap-2 text-ink">
      <CodeMark />
      <span className="flex items-baseline gap-px font-display text-[19px] font-semibold tracking-[-0.01em]">
        <span className="text-accent">Laf</span>
        <span>Hack</span>
      </span>
    </span>
  );
}
