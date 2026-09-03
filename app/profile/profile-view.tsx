"use client";

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Calendar, Check, CircleAlert, Loader2, LogOut, Mail, Pencil } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import clsx from 'clsx';
import {
  AVATAR_COLORS,
  avatarColorClasses,
  avatarInitial,
  MAX_NICKNAME_LENGTH,
  type AvatarColor,
  type Project,
} from '@/lib/types';
import type { AccessDiagnostics } from '@/lib/accessDiagnostics';
import { AccessPanel } from '@/components/access-panel';
import { ReviewBadge, StatusBadge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

export function ProfileView({
  user,
  nickname,
  avatarColor,
  projects,
  diagnostics,
}: {
  user: SupabaseUser;
  nickname: string | null;
  avatarColor: AvatarColor | null;
  projects: Project[];
  diagnostics: AccessDiagnostics | null;
}) {
  // Saved state, kept separate from the draft so Cancel has something to
  // restore and a failed save does not leave the header showing a value the
  // database never accepted.
  const [savedNickname, setSavedNickname] = useState(nickname);
  const [savedColor, setSavedColor] = useState<AvatarColor | null>(avatarColor);

  const [editing, setEditing] = useState(false);
  const [draftNickname, setDraftNickname] = useState(nickname ?? '');
  const [draftColor, setDraftColor] = useState<AvatarColor | null>(avatarColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailLocalPart = user.email?.split('@')[0] ?? 'User';
  const shownName = savedNickname?.trim() || emailLocalPart;
  const initial = avatarInitial(savedNickname, user.email ?? null);

  // The avatar previews the draft colour while editing, so picking a swatch
  // shows what it will look like before it is saved.
  const previewColor = editing ? draftColor : savedColor;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  function startEditing() {
    setDraftNickname(savedNickname ?? '');
    setDraftColor(savedColor);
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: draftNickname, avatarColor: draftColor }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Could not save your profile.');
      }

      setSavedNickname(draftNickname.trim() || null);
      setSavedColor(draftColor);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  const joinDate = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              'flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-semibold',
              avatarColorClasses(previewColor)
            )}
            aria-hidden="true"
          >
            {initial}
          </div>

          <div>
            {editing ? (
              <form onSubmit={handleSave} className="max-w-sm">
                <label htmlFor="nickname" className="block text-sm font-medium text-ink">
                  Nickname
                </label>
                <input
                  id="nickname"
                  value={draftNickname}
                  onChange={(event) => setDraftNickname(event.target.value)}
                  maxLength={MAX_NICKNAME_LENGTH}
                  placeholder={emailLocalPart}
                  autoFocus
                  className="mt-1.5 w-full rounded-md border border-ink-100 px-3 py-2 text-sm text-ink placeholder:text-ink-300 focus:border-accent"
                />
                <p className="mt-1.5 text-xs text-ink-300">
                  Leave it empty to go back to {emailLocalPart}.
                </p>

                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-ink">Avatar colour</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AVATAR_COLORS.map((color) => {
                      const selected = draftColor === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setDraftColor(color)}
                          aria-label={color}
                          aria-pressed={selected}
                          className={clsx(
                            'h-8 w-8 rounded-full transition-transform hover:scale-110',
                            avatarColorClasses(color),
                            selected && 'ring-2 ring-ink ring-offset-2'
                          )}
                        >
                          {selected && <Check className="mx-auto h-4 w-4" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {error && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <Button type="submit" disabled={saving} className="px-4 py-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                    }}
                    disabled={saving}
                    className="px-4 py-2"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold text-ink">{shownName}</h1>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </div>

                <div className="mt-2 flex flex-col gap-1.5 text-sm text-ink-500">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    <span>{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                    <span>Joined {joinDate}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <Button variant="secondary" onClick={handleSignOut} className="shrink-0">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </Button>
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-medium text-ink">Your sketches</h2>
        <p className="mt-1 text-sm text-ink-500">
          A sketch reaches the gallery once an admin has played and approved it.
        </p>

        {projects.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-100 py-16 text-center">
            <p className="text-sm text-ink-500">You haven&apos;t uploaded any sketches yet.</p>
            <Link href="/gallery" className="text-sm font-medium text-accent hover:underline">
              Browse the gallery
            </Link>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-ink-100">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Title</th>
                  <th scope="col" className="px-4 py-3 font-medium">Compile</th>
                  <th scope="col" className="px-4 py-3 font-medium">Review</th>
                  <th scope="col" className="px-4 py-3 font-medium">Plays</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{project.title}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ReviewBadge reviewStatus={project.review_status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-500">{project.play_count}</td>
                    <td className="px-4 py-3 text-ink-500">
                      {new Date(project.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/play/${project.id}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {diagnostics && <AccessPanel diagnostics={diagnostics} />}
    </div>
  );
}
