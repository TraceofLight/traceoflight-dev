import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			coverImage: z.union([image(), z.string()]).optional(),
			topMediaKind: z.enum(["image", "youtube", "video"]).optional(),
			topMediaImageUrl: z.string().optional(),
			topMediaYoutubeUrl: z.string().optional(),
			topMediaVideoUrl: z.string().optional(),
		}),
});

export const collections = { blog };
