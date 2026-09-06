/**
 * The placeholder a route shows while its server render is in flight.
 *
 * Every page here reads from Supabase before it can render anything, so
 * without a loading state the browser sits on the *previous* page until the
 * whole response arrives -- which reads as the click not having worked. A
 * `loading.tsx` turns that into an instant paint: the new page's frame appears
 * on click and fills in when the data lands.
 *
 * Deliberately vague. A skeleton that mimics the real layout too closely
 * flickers when the two do not line up; a title bar and a few blocks read as
 * "loading" without promising a shape.
 */
export function PageSkeleton({
  cards = 0,
  rows = 3,
}: {
  /** Draw a grid of card placeholders, for the gallery-shaped pages. */
  cards?: number;
  /** Lines of text placeholder under the heading. */
  rows?: number;
}) {
  return (
    <div
      className="mx-auto max-w-6xl animate-pulse px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
      aria-hidden="true"
    >
      <div className="h-8 w-56 rounded bg-ink-100" />

      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="h-4 rounded bg-ink-50"
            style={{ width: `${70 - index * 12}%` }}
          />
        ))}
      </div>

      {cards > 0 && (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-lg border border-ink-100">
              <div className="aspect-[16/10] w-full bg-ink-50" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-2/3 rounded bg-ink-100" />
                <div className="h-3 w-1/2 rounded bg-ink-50" />
              </div>
            </div>
          ))}
        </div>
      )}

      <span className="sr-only">Loading</span>
    </div>
  );
}
