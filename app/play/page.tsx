import Link from 'next/link';
import { Heart, History, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';
import { getViewer } from '@/lib/admin';
import { getFavoriteProjects, getMostPlayed, getRecentlyPlayed, withFavorites } from '@/lib/queries';
import { isPubliclyBrowsable, type ProjectCard } from '@/lib/types';
import { SketchCard } from '@/components/sketch-card';

export const revalidate = 0;

interface Card {
  project: ProjectCard;
  footnote?: string;
}

export default async function PlayHubPage() {
  const viewer = await getViewer();

  if (!viewer) {
    return <SignedOutHub />;
  }

  const [favorites, history, popular] = await Promise.all([
    getFavoriteProjects(viewer.id),
    getRecentlyPlayed(viewer.id, 8),
    getMostPlayed(6),
  ]);

  // A sketch can be un-approved or made private after someone favorited it.
  const browsableFavorites = favorites.filter(isPubliclyBrowsable);
  const browsableHistory = history.filter((entry) => isPubliclyBrowsable(entry.project));

  const seen = new Set([
    ...browsableFavorites.map((project) => project.id),
    ...browsableHistory.map((entry) => entry.project.id),
  ]);

  const [favoriteCards, historyCards, popularCards] = await Promise.all([
    withFavorites(browsableFavorites, viewer.id),
    withFavorites(
      browsableHistory.map((entry) => entry.project),
      viewer.id
    ),
    // Don't repeat back what is already in the two sections above.
    withFavorites(
      popular.filter((project) => !seen.has(project.id)),
      viewer.id
    ),
  ]);

  const playCounts = new Map(browsableHistory.map((entry) => [entry.project.id, entry.playCount]));

  const isEmpty =
    favoriteCards.length === 0 && historyCards.length === 0 && popularCards.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold text-ink">Your play hub</h1>
        <p className="mt-2 text-ink-500">
          Favorites and recent games, kept close so you can jump straight back in.
        </p>
      </div>

      {isEmpty ? (
        <EmptyHub />
      ) : (
        <div className="mt-12 space-y-12">
          <Section
            icon={Heart}
            title="Favorites"
            empty="Sketches you favorite show up here."
            action={{ href: '/gallery', label: 'Find sketches' }}
            canFavorite
            cards={favoriteCards.map((project) => ({ project }))}
          />

          <Section
            icon={History}
            title="Recently played"
            empty="Play a sketch and it will appear here."
            canFavorite
            cards={historyCards.map((project) => ({
              project,
              footnote: playedLabel(playCounts.get(project.id) ?? 0),
            }))}
          />

          <Section
            icon={TrendingUp}
            title="Popular right now"
            empty="Nothing else to show yet."
            canFavorite
            cards={popularCards.map((project) => ({ project }))}
          />
        </div>
      )}
    </div>
  );
}

async function SignedOutHub() {
  const cards = await withFavorites(await getMostPlayed(6), null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold text-ink">Play</h1>
        <p className="mt-2 text-ink-500">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>{' '}
          to keep favorites and pick up where you left off. Here is what everyone else is
          playing.
        </p>
      </div>

      <div className="mt-12">
        <Section
          icon={TrendingUp}
          title="Popular right now"
          empty="No sketches have been approved yet."
          canFavorite={false}
          cards={cards.map((project) => ({ project }))}
        />
      </div>
    </div>
  );
}

function EmptyHub() {
  return (
    <div className="mt-12 flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-ink-100 py-20 text-center">
      <Sparkles className="h-8 w-8 text-ink-300" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-ink">Nothing here yet</p>
        <p className="mt-1 text-sm text-ink-500">
          Favorite a sketch or play one and it will show up here.
        </p>
      </div>
      <Link
        href="/gallery"
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
      >
        Browse the gallery
      </Link>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  empty,
  action,
  cards,
  canFavorite,
}: {
  icon: LucideIcon;
  title: string;
  empty: string;
  action?: { href: string; label: string };
  cards: Card[];
  canFavorite: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-medium text-ink">
          <Icon className="h-4 w-4 text-ink-300" />
          {title}
          {cards.length > 0 && (
            <span className="text-sm font-normal text-ink-300">{cards.length}</span>
          )}
        </h2>
        {action && (
          <Link href={action.href} className="text-sm font-medium text-accent hover:underline">
            {action.label}
          </Link>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-ink-100 px-4 py-8 text-center text-sm text-ink-500">
          {empty}
        </p>
      ) : (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ project, footnote }) => (
            <li key={project.id}>
              <SketchCard project={project} canFavorite={canFavorite} footnote={footnote} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function playedLabel(count: number): string {
  return count <= 1 ? 'Played once' : `Played ${count} times`;
}
