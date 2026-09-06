/**
 * The `</>` mark that sits before the wordmark.
 *
 * The brackets are ink and the slash is maroon: one stroke of Lafayette
 * colour, the same trick the wordmark plays by putting "Laf" in maroon and
 * leaving "Hack" black. Drawn to match app/icon.svg, which is the same mark at
 * favicon size -- keep the two in step if either changes.
 */
export function CodeMark({ className = 'h-[18px] w-[26px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 18"
      className={className}
      fill="none"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6,3 1.4,9 6,15" stroke="currentColor" />
      <line x1="15.6" y1="2" x2="10.4" y2="16" className="stroke-accent" />
      <polyline points="20,3 24.6,9 20,15" stroke="currentColor" />
    </svg>
  );
}
