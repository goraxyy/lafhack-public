import { UploadCloud, Play, LayoutGrid, Sparkles } from 'lucide-react';
import { ClosingCta, HeroCta } from '@/app/home-cta';

const FEATURES = [
  {
    icon: UploadCloud,
    title: 'Upload sketches',
    description:
      'Drop in a Processing project folder and it is compiled and normalized automatically, ready to run in the browser.',
  },
  {
    icon: Play,
    title: 'Run anywhere',
    description:
      'Every sketch runs client-side via Processing.js. No installs, no plugins, just a link.',
  },
  {
    icon: LayoutGrid,
    title: 'Browse the gallery',
    description:
      'Search and filter public sketches from the community in a fast, minimal gallery view.',
  },
  {
    icon: Sparkles,
    title: 'No "works on my machine"',
    description:
      'Your sketch behaves the same in everyone\'s browser, so the only thing left to explain is the gameplay.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Run Processing sketches straight from the browser.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            LafHack compiles, hosts, and plays back Processing and Java
            sketches with no local setup. Upload once, share a link, done.
          </p>
          <HeroCta />
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 className="text-2xl font-semibold text-ink">Everything you need to share sketches</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-ink-100 bg-white">
                    <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-medium text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <ClosingCta />
      </section>
    </>
  );
}
