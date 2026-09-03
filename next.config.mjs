/** @type {import('next').NextConfig} */

/**
 * Headers applied to every page.
 *
 * The sketch runner sets its own, much stricter, policy -- it is the one page
 * that deliberately executes uploaded code, and it needs 'unsafe-eval' that
 * nothing else should have. These are the baseline for the rest of the site.
 *
 * No global Content-Security-Policy: Next's App Router injects inline
 * bootstrap scripts, so a meaningful script-src needs per-request nonces
 * threaded through middleware. A CSP with 'unsafe-inline' would only look like
 * protection, so the headers here are the ones that actually hold.
 */
const securityHeaders = [
  // The site frames its own sketch player; nobody else should frame the site.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here uses these, and a sketch should not be able to ask for them.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
