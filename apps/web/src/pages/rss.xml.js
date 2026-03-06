import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { listAllPublishedDbPosts } from '../lib/blog-db';
import { getBlogSource, getContentProvider } from '../lib/content-source';

export async function GET(context) {
	const provider = getContentProvider();
	let items = [];
	if (provider === 'db') {
		try {
			const posts = await listAllPublishedDbPosts();
			items = posts.map((post) => ({
				title: post.title,
				description: post.description,
				pubDate: post.publishedAt,
				link: `/blog/${post.slug}/`,
			}));
		} catch {
			items = [];
		}
	} else {
		const posts = await getBlogSource().listPosts();
		items = posts.map((post) => ({
			...post.data,
			link: `/blog/${post.id}/`,
		}));
	}

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items,
	});
}
