import { getViewer } from '@/lib/admin';
import { getApprovedProjects, withFavorites } from '@/lib/queries';
import { GalleryGrid } from '@/app/gallery/gallery-grid';

export const revalidate = 0;

export default async function GalleryPage() {
  const viewer = await getViewer();
  const projects = await withFavorites(await getApprovedProjects(), viewer?.id ?? null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold text-ink">Gallery</h1>
        <p className="mt-2 text-ink-500">
          Every sketch here has been played and approved by an admin. Browse by semester,
          genre, or tag.
        </p>
      </div>

      <GalleryGrid projects={projects} canFavorite={Boolean(viewer)} />
    </div>
  );
}
