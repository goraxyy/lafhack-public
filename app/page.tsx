import Link from 'next/link';
import { UploadCloud, Play, LayoutGrid, Heart } from 'lucide-react';
import { ClosingCta, HeroCta } from '@/app/home-cta';

// `href` where the card names something you can go and do; the other two
// describe how the site works rather than a place to arrive at.
const FEATURES = [
  {
    icon: UploadCloud,
    href: '/upload',
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
    href: '/gallery',
    title: 'Browse the gallery',
    description:
      'Search and filter public sketches from the community in a fast, minimal gallery view.',
  },
  {
    icon: Heart,
    title: 'Rate what others made',
    description:
      'Play through the gallery and favourite the sketches worth keeping. The hearts and play counts on every card come from the people using it.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24 lg:px-8">
        <div className="max-w-2xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Lafayette College
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Show your work.
            <br className="hidden sm:block" /> Play everyone else&rsquo;s.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
            Everything here was made by someone at Lafayette. Put yours up and
            it gets played, favourited and credited to you by name — or skip
            all that and just play what everybody else has made.
          </p>
          <HeroCta />
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Everything you need to share sketches
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-ink-100 bg-white">
                    <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="font-display mt-4 text-base font-semibold text-ink">
                    {feature.href ? (
                      <Link href={feature.href} className="transition-colors hover:text-accent">
                        {feature.title}
                      </Link>
                    ) : (
                      feature.title
                    )}
                  </h3>
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
