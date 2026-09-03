"use client";

import { useMemo, useState } from 'react';
import { FolderX, Search, SlidersHorizontal, X } from 'lucide-react';
import clsx from 'clsx';
import type { ProjectCard } from '@/lib/types';
import { SketchCard } from '@/components/sketch-card';

type SortKey = 'newest' | 'played' | 'favorited' | 'title';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  played: 'Most played',
  favorited: 'Most favorited',
  title: 'A–Z',
};

const ALL = 'all';

export function GalleryGrid({
  projects,
  canFavorite,
}: {
  projects: ProjectCard[];
  canFavorite: boolean;
}) {
  const [query, setQuery] = useState('');
  const [semester, setSemester] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [genre, setGenre] = useState(ALL);
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');

  // Filter options come from what is actually in the gallery, so they never
  // offer a combination that returns nothing.
  const options = useMemo(() => {
    const semesters = new Set<string>();
    const years = new Set<number>();
    const genres = new Set<string>();
    const tags = new Map<string, number>();

    for (const project of projects) {
      if (project.semester) semesters.add(project.semester);
      if (project.year) years.add(project.year);
      if (project.genre) genres.add(project.genre);
      for (const entry of project.tags) {
        tags.set(entry, (tags.get(entry) ?? 0) + 1);
      }
    }

    return {
      semesters: [...semesters].sort(),
      years: [...years].sort((a, b) => b - a),
      genres: [...genres].sort(),
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = projects.filter((project) => {
      if (semester !== ALL && project.semester !== semester) return false;
      if (year !== ALL && String(project.year) !== year) return false;
      if (genre !== ALL && project.genre !== genre) return false;
      if (tag && !project.tags.includes(tag)) return false;

      if (!needle) return true;

      const haystack = [
        project.title,
        project.description ?? '',
        project.author_name ?? '',
        project.genre ?? '',
        ...project.collaborators,
        ...project.tags,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });

    return matches.sort((a, b) => {
      switch (sort) {
        case 'played':
          return b.play_count - a.play_count;
        case 'favorited':
          return b.favorite_count - a.favorite_count;
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [genre, projects, query, semester, sort, tag, year]);

  const activeFilters =
    (semester !== ALL ? 1 : 0) + (year !== ALL ? 1 : 0) + (genre !== ALL ? 1 : 0) + (tag ? 1 : 0);

  function clearFilters() {
    setSemester(ALL);
    setYear(ALL);
    setGenre(ALL);
    setTag(null);
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, author, tag"
            aria-label="Search sketches"
            className="w-full rounded-md border border-ink-100 bg-white py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-300 focus:border-accent"
          />
        </div>

        <Select
          label="Semester"
          value={semester}
          onChange={setSemester}
          options={options.semesters.map((value) => ({ value, label: value }))}
        />
        <Select
          label="Year"
          value={year}
          onChange={setYear}
          options={options.years.map((value) => ({ value: String(value), label: String(value) }))}
        />
        <Select
          label="Genre"
          value={genre}
          onChange={setGenre}
          options={options.genres.map((value) => ({ value, label: value }))}
        />

        <label className="sr-only" htmlFor="gallery-sort">
          Sort by
        </label>
        <select
          id="gallery-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="rounded-md border border-ink-100 bg-white px-3 py-2.5 text-sm text-ink"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {options.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
          {options.tags.slice(0, 12).map(([value, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTag(tag === value ? null : value)}
              aria-pressed={tag === value}
              className={clsx(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                tag === value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-ink-100 text-ink-500 hover:border-ink-200'
              )}
            >
              #{value} <span className="text-ink-300">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-sm text-ink-500">
        <p>
          {filtered.length} {filtered.length === 1 ? 'sketch' : 'sketches'}
        </p>
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-ink-500 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-100 py-20 text-center">
          <FolderX className="h-8 w-8 text-ink-300" aria-hidden="true" />
          <p className="text-sm text-ink-500">
            {projects.length === 0
              ? 'No sketches have been approved yet.'
              : 'No sketches match these filters.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <li key={project.id}>
              <SketchCard project={project} canFavorite={canFavorite} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  if (options.length === 0) return null;

  return (
    <>
      <label className="sr-only" htmlFor={`gallery-${label}`}>
        {label}
      </label>
      <select
        id={`gallery-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-ink-100 bg-white px-3 py-2.5 text-sm text-ink"
      >
        <option value={ALL}>{label}: any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
