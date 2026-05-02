export const SITE_TITLE = 'TraceofLight';
export const SITE_DESCRIPTION =
  '게임 개발, 그래픽스 프로그래밍, 데이터베이스 엔지니어링을 기록하는 TraceofLight의 기술 아카이브입니다.';
export const SITE_URL = 'https://www.traceoflight.dev';
export const SITE_AUTHOR = 'TraceofLight';

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
  { href: '/series', label: 'Series' },
  { href: '/projects', label: 'Projects' },
] as const;

export const GITHUB_URL = 'https://github.com/TraceofLight';

/**
 * Public asset paths used as fallbacks when no cover image is provided.
 */
export const DEFAULT_SERIES_IMAGE = '/images/empty-series-image.png';
export const DEFAULT_ARTICLE_IMAGE = '/images/empty-article-image.png';

/**
 * Standard image dimensions (width × height) used for SSR-rendered cover
 * images on detail and listing pages.
 */
export const IMAGE_SIZES = {
  postCard: { width: 960, height: 640 },
  blogPostCover: { width: 1400, height: 1000 },
  seriesCover: { width: 960, height: 720 },
  seriesSidebarThumb: { width: 224, height: 126 },
} as const;

/**
 * Pagination defaults shared across archive pages.
 */
export const PAGINATION = {
  ARCHIVE_PAGE_SIZE: 24,
} as const;

/**
 * Hostnames that are accepted as the origin for unsafe internal-api calls
 * coming from the browser. Used by the request middleware to validate
 * cross-site form submissions.
 */
export const INTERNAL_API_ORIGIN_HOSTS = [
  'https://traceoflight.dev',
  'https://www.traceoflight.dev',
] as const;
