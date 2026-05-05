import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '../../consts';
import { listAllPublishedDbPosts, renderDbMarkdown } from '../../lib/blog-db';
import { isSupportedPublicLocale } from '../../lib/i18n/locales';
import { buildLocalizedBlogPostPath } from '../../lib/i18n/pathnames';

const FEED_TITLE_BY_LOCALE: Record<string, string> = {
  ko: `${SITE_TITLE}`,
  en: `${SITE_TITLE} (EN)`,
  ja: `${SITE_TITLE} (JA)`,
  zh: `${SITE_TITLE} (ZH)`,
};

export const GET: APIRoute = async (context) => {
  const rawLocale = context.params.locale;
  if (!rawLocale || !isSupportedPublicLocale(rawLocale)) {
    return new Response('not found', { status: 404 });
  }
  const locale = rawLocale;

  let posts: Awaited<ReturnType<typeof listAllPublishedDbPosts>> = [];
  try {
    posts = await listAllPublishedDbPosts({ locale });
  } catch (error) {
    console.error('[rss] failed to fetch posts:', error);
  }
  // Belt-and-suspenders: backend may not yet filter by locale on this endpoint.
  const filtered = posts.filter((post) => (post.locale ?? 'ko') === locale);

  const siteOrigin = context.site ?? new URL(SITE_URL);
  const selfHref = new URL(`/${locale}/rss.xml`, siteOrigin).toString();
  const lastBuild = filtered.reduce<Date | null>((acc, post) => {
    const candidate = post.updatedAt ?? post.publishedAt;
    if (!acc || candidate.getTime() > acc.getTime()) return candidate;
    return acc;
  }, null);

  return rss({
    title: FEED_TITLE_BY_LOCALE[locale] ?? SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: siteOrigin,
    items: filtered.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.publishedAt,
      link: buildLocalizedBlogPostPath(locale, post.slug),
      content: renderDbMarkdown(post.bodyMarkdown ?? ''),
    })),
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
      content: 'http://purl.org/rss/1.0/modules/content/',
    },
    customData: [
      `<language>${locale}</language>`,
      `<atom:link href="${selfHref}" rel="self" type="application/rss+xml" />`,
      `<lastBuildDate>${(lastBuild ?? new Date()).toUTCString()}</lastBuildDate>`,
    ].join(''),
  });
};
