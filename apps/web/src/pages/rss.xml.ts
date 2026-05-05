import type { APIRoute } from 'astro';

/**
 * Legacy `/rss.xml` route. The feed is now per-locale at `/<locale>/rss.xml`,
 * so existing subscribers (whose readers still hit this URL) get a 302 to
 * the Korean feed — matching the historical default.
 */
export const GET: APIRoute = () => {
  return new Response(null, {
    status: 302,
    headers: {
      location: '/ko/rss.xml',
      'cache-control': 'public, max-age=86400',
    },
  });
};
