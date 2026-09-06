export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-display text-4xl font-semibold text-ink">404</h1>
      <p className="mt-4 text-lg text-ink-500">Page not found</p>
      <a
        href="/"
        className="mt-6 inline-flex items-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
      >
        Go home
      </a>
    </div>
  );
}
