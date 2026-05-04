# traceoflight-dev

portfolio, personal blog, misc

## Apps

- `apps/web`: Astro frontend (landing, blog, projects)
- `apps/api`: FastAPI backend (posts + media metadata API)

## Translations

The site is multi-locale (ko/en/ja/zh). Korean posts are the source of truth;
en/ja/zh siblings are auto-generated via DeepL by a background `rq` worker.
Set `DEEPL_API_KEY` in `apps/api/.env.api` to enable translation; without a
key, the API still serves Korean content unchanged.

Design: `docs/plans/site-translations-design.md`.

## Infra

- `infra/docker/api`: `api + postgres + minio` stack for single-instance deployment

## Font License

This repository self-hosts the Pretendard Variable dynamic-subset web font.
The `pretendard` npm package is the upstream source, and
`apps/web/scripts/copy-pretendard-fonts.mjs` copies the dynamic-subset CSS
and woff2 chunks into `apps/web/public/fonts/pretendard/` on `predev` /
`prebuild`.

Served files:

- `apps/web/public/fonts/pretendard/pretendardvariable-dynamic-subset.css`
- `apps/web/public/fonts/pretendard/woff2-dynamic-subset/*.woff2`

License:

- SIL Open Font License 1.1 (OFL-1.1)
- Upstream: https://github.com/orioncactus/pretendard

Compliance notes:

- Keep copyright and license notices when redistributing.
- Do not sell the font by itself.
- If modified, follow OFL rules for renamed derivatives.

Full license text:

- `apps/web/public/fonts/LICENSE.Pretendard.OFL-1.1.txt`
