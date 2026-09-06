"use client";

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

interface NavLink {
  href: string;
  label: string;
}

export function NavMobileMenu({
  links,
  showProfile,
  showAdmin,
}: {
  links: NavLink[];
  showProfile?: boolean;
  showAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md p-2 text-ink-500 hover:bg-ink-50 hover:text-ink"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-16 border-b border-ink-100 bg-white px-4 py-4 shadow-sm" aria-label="Mobile">
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {showAdmin && (
              <li>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink"
                >
                  Admin
                </Link>
              </li>
            )}
            {showProfile && (
              <li>
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink"
                >
                  Profile
                </Link>
              </li>
            )}
            {!showProfile && (
              <li className="mt-2 flex gap-2 border-t border-ink-100 pt-3">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-md border border-ink-100 px-3 py-2 text-center text-sm font-medium text-ink"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-md bg-accent px-3 py-2 text-center text-sm font-medium text-white"
                >
                  Sign up
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </div>
  );
}
