import type { APIRoute } from 'astro';

/**
 * IndexNow ownership-verification key file. The protocol requires the
 * domain to host `https://<host>/<key>.txt` whose body is exactly `<key>`,
 * proving the submitter controls the domain. We serve it dynamically from
 * the `INDEXNOW_KEY` env var so rotating the key only needs a re-deploy
 * (no extra file to commit). Any request for a different `.txt` segment
 * falls through to a 404.
 *
 * Reference: https://www.indexnow.org/documentation
 */
export const GET: APIRoute = async ({ params }) => {
  const expected = (process.env.INDEXNOW_KEY ?? '').trim();
  const requested = (params.indexnowKey ?? '').trim();

  if (!expected || !requested || requested !== expected) {
    return new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(expected, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
