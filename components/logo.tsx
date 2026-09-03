import { Code2 } from 'lucide-react';

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold text-ink">
      <Code2 className="h-5 w-5" aria-hidden="true" />
      <span>LafHack</span>
    </span>
  );
}
