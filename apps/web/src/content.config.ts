import { existsSync, readdirSync } from "node:fs";
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogContentRoot = new URL("./content/blog/", import.meta.url);
const hasBlogEntries = existsSync(blogContentRoot) && readdirSync(blogContentRoot, { recursive: true }).some((entry) =>
	typeof entry === "string" && /\.(md|mdx)$/i.test(entry),
);

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: hasBlogEntries
		? glob({ base: './src', pattern: 'content/blog/**/*.{md,mdx}' })
		: async () => [],
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
