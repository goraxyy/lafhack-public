export type ProjectVisibility = 'public' | 'private';
export type ProjectStatus =
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'error';

/** Admin moderation state. Only `approved` sketches reach the gallery. */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type Semester = 'Fall' | 'Spring' | 'Summer' | 'Winter';

export const SEMESTERS: Semester[] = ['Fall', 'Spring', 'Summer', 'Winter'];

/** Suggested genres. The column is free text, so this is a starting point. */
export const GENRES = [
  'Game',
  'Generative art',
  'Simulation',
  'Data visualization',
  'Animation',
  'Interactive toy',
  'Audio visual',
  'Other',
] as const;

export interface Project {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  owner_id: string | null;
  raw_folder_path: string | null;
  bundle_pde_path: string | null;
  assets_folder_path: string | null;
  error_message: string | null;

  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;

  thumbnail_path: string | null;
  author_name: string | null;
  collaborators: string[];
  semester: Semester | null;
  year: number | null;
  genre: string | null;
  tags: string[];

  play_count: number;
  favorite_count: number;

  /** Answered on upload: was this handed in as a course final project? */
  is_final_project: boolean;
}

/** A project plus whether the current viewer has favorited it. */
export interface ProjectCard extends Project {
  is_favorite?: boolean;
}

export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string;
  email: string;
  /** Nickname. NULL falls back to the email local-part. */
  display_name: string | null;
  avatar_color: AvatarColor | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/** Longest nickname the profile form accepts. Matches the API's own check. */
export const MAX_NICKNAME_LENGTH = 40;

/**
 * Avatar swatches, keyed rather than stored as hex.
 *
 * The database keeps the key and the class pair lives here, so a profile row
 * can never push an arbitrary colour string into a `style` attribute and
 * Tailwind still sees every class name it has to generate.
 */
export type AvatarColor =
  | 'slate'
  | 'red'
  | 'amber'
  | 'green'
  | 'teal'
  | 'blue'
  | 'violet'
  | 'pink';

export const AVATAR_COLORS: AvatarColor[] = [
  'slate', 'red', 'amber', 'green', 'teal', 'blue', 'violet', 'pink',
];

export const DEFAULT_AVATAR_COLOR: AvatarColor = 'slate';

const AVATAR_COLOR_CLASSES: Record<AvatarColor, string> = {
  slate: 'bg-slate-200 text-slate-700',
  red: 'bg-red-200 text-red-800',
  amber: 'bg-amber-200 text-amber-800',
  green: 'bg-green-200 text-green-800',
  teal: 'bg-teal-200 text-teal-800',
  blue: 'bg-blue-200 text-blue-800',
  violet: 'bg-violet-200 text-violet-800',
  pink: 'bg-pink-200 text-pink-800',
};

export function isAvatarColor(value: unknown): value is AvatarColor {
  return typeof value === 'string' && AVATAR_COLORS.includes(value as AvatarColor);
}

/** Tailwind classes for a swatch, falling back to the default on bad input. */
export function avatarColorClasses(color: string | null | undefined): string {
  return AVATAR_COLOR_CLASSES[isAvatarColor(color) ? color : DEFAULT_AVATAR_COLOR];
}

/** The letter shown inside the avatar. */
export function avatarInitial(nickname: string | null, email: string | null): string {
  const source = nickname?.trim() || email?.split('@')[0] || '';
  return source.charAt(0).toUpperCase() || '?';
}

/** True when a sketch is browsable by anyone, rather than only its owner. */
export function isPubliclyBrowsable(project: {
  visibility: string;
  status: string;
  review_status: string;
}): boolean {
  return (
    project.visibility === 'public' &&
    project.status === 'ready' &&
    project.review_status === 'approved'
  );
}

/** "Fall 2025", "2025", or null when neither is set. */
export function formatTerm(project: {
  semester: string | null;
  year: number | null;
}): string | null {
  if (project.semester && project.year) return `${project.semester} ${project.year}`;
  if (project.year) return String(project.year);
  return project.semester;
}

export function thumbnailUrl(project: { id: string; thumbnail_path: string | null }): string | null {
  return project.thumbnail_path ? `/api/projects/${project.id}/thumbnail` : null;
}

/** Longest feedback message the footer box accepts. */
export const MAX_FEEDBACK_LENGTH = 4000;

export type FeedbackStatus = 'new' | 'triaged' | 'done';

export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'triaged', 'done'];

/** One submission from the footer feedback box. */
export interface Feedback {
  id: string;
  created_at: string;
  user_id: string | null;
  email: string | null;
  message: string;
  page_path: string | null;
  status: FeedbackStatus;
  handled_by: string | null;
  handled_at: string | null;
}
