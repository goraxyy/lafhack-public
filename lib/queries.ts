import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Feedback, Project, ProjectCard } from '@/lib/types';

/**
 * Reads go through the service-role client because every caller here has
 * already decided what the viewer may see, and the gallery has to work for
 * signed-out visitors too. The RLS policies remain the backstop for any
 * future client-side reads.
 */
function db() {
  return createAdminClient();
}

const BROWSABLE = {
  visibility: 'public',
  status: 'ready',
  review_status: 'approved',
} as const;

/** Every sketch that has been approved for the gallery, newest first. */
export async function getApprovedProjects(): Promise<Project[]> {
  const { data, error } = await db()
    .from('projects')
    .select('*')
    .match(BROWSABLE)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load gallery projects', error.message);
    return [];
  }

  return (data ?? []) as Project[];
}

export async function getMostPlayed(limit: number): Promise<Project[]> {
  const { data, error } = await db()
    .from('projects')
    .select('*')
    .match(BROWSABLE)
    .order('play_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to load most played projects', error.message);
    return [];
  }

  return (data ?? []) as Project[];
}

/** The viewer's favorites, most recently favorited first. */
export async function getFavoriteProjects(viewerId: string): Promise<Project[]> {
  const { data, error } = await db()
    .from('favorites')
    .select('created_at, projects (*)')
    .eq('user_id', viewerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load favorites', error.message);
    return [];
  }

  return unwrapJoined(data, 'projects');
}

/** What the viewer played most recently, with how many times they played it. */
export async function getRecentlyPlayed(
  viewerId: string,
  limit: number
): Promise<Array<{ project: Project; playCount: number; lastPlayedAt: string }>> {
  const { data, error } = await db()
    .from('play_history')
    .select('play_count, last_played_at, projects (*)')
    .eq('user_id', viewerId)
    .order('last_played_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to load play history', error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    play_count: number;
    last_played_at: string;
    projects: Project | Project[] | null;
  }>;

  return rows
    .map((row) => ({
      project: Array.isArray(row.projects) ? row.projects[0] : row.projects,
      playCount: row.play_count,
      lastPlayedAt: row.last_played_at,
    }))
    .filter(
      (row): row is { project: Project; playCount: number; lastPlayedAt: string } =>
        Boolean(row.project)
    );
}

/** The subset of `projectIds` the viewer has favorited. */
export async function getFavoriteIds(
  viewerId: string | null,
  projectIds: string[]
): Promise<Set<string>> {
  if (!viewerId || projectIds.length === 0) return new Set();

  const { data, error } = await db()
    .from('favorites')
    .select('project_id')
    .eq('user_id', viewerId)
    .in('project_id', projectIds);

  if (error) {
    console.error('Failed to load favorite state', error.message);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.project_id as string));
}

/** Tags each project with whether the viewer has favorited it. */
export async function withFavorites(
  projects: Project[],
  viewerId: string | null
): Promise<ProjectCard[]> {
  const favoriteIds = await getFavoriteIds(
    viewerId,
    projects.map((project) => project.id)
  );

  return projects.map((project) => ({
    ...project,
    is_favorite: favoriteIds.has(project.id),
  }));
}

/** Projects waiting on an admin decision, oldest first so the queue is fair. */
export async function getReviewQueue(reviewStatus: string): Promise<Project[]> {
  const { data, error } = await db()
    .from('projects')
    .select('*')
    .eq('review_status', reviewStatus)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load review queue', error.message);
    return [];
  }

  return (data ?? []) as Project[];
}

/**
 * Footer feedback, newest first, unhandled before handled so the queue reads
 * as a to-do list rather than a log.
 */
export async function getFeedback(limit = 50): Promise<Feedback[]> {
  const { data, error } = await db()
    .from('feedback')
    .select('*')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Missing table just means 008 has not been run; an empty list is the
    // right answer for the page either way.
    console.error('Failed to load feedback', error.message);
    return [];
  }

  return (data ?? []) as Feedback[];
}

/**
 * PostgREST types an embedded one-to-one join as an array. Flatten it and drop
 * rows whose project was deleted underneath us.
 */
function unwrapJoined<K extends string>(
  rows: unknown,
  key: K
): Project[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const value = (row as Record<string, unknown>)[key];
      return (Array.isArray(value) ? value[0] : value) as Project | undefined;
    })
    .filter((project): project is Project => Boolean(project));
}
