import type { MetadataRoute } from 'next';

/**
 * The web app manifest.
 *
 * Without one, a browser that installs the site -- added to a home screen, a
 * dock, or Chrome's "install app" -- has no icon to use and draws its own: a
 * grey rounded square with the first letter of the domain in it. That is what
 * "L on a grey rectangle" was. The favicon is a separate thing entirely and
 * was working; nothing in <link rel="icon"> is consulted for an installed app.
 *
 * `maskable` is not the same image as `any`. Android crops an installed icon
 * to whatever shape the launcher uses, taking up to a fifth off each edge, so
 * the maskable copy keeps the mark inside the central safe zone on a
 * full-bleed ground. Shipping only a rounded tile gets the corners shaved off.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LafHack — projects made at Lafayette College',
    short_name: 'LafHack',
    description:
      'Projects made at Lafayette College, playable in the browser. Put your own work in front of people, or just play what everybody else has made.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#910029',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
