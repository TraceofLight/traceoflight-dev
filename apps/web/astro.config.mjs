// @ts-check

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

/**
 * @param {string} id
 * @param {string} scope
 */
function getScopedPackageChunkName(id, scope) {
	const normalizedId = id.replace(/\\/g, '/');
	const scopePrefix = `/node_modules/${scope}/`;
	const scopeIndex = normalizedId.indexOf(scopePrefix);

	if (scopeIndex < 0) {
		return null;
	}

	const packageName = normalizedId
		.slice(scopeIndex + '/node_modules/'.length)
		.split('/')
		.slice(0, 2)
		.join('-');

	return packageName.replace(/[^a-zA-Z0-9-_]/g, '-');
}

// https://astro.build/config
export default defineConfig({
	site: process.env.SITE_URL ?? 'https://www.traceoflight.dev',
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	security: {
		checkOrigin: false,
	},
	// Hover-prefetch on every internal <a>. Pairs with the persisted header
	// (`transition:persist` in Header.astro) so navigation feels SPA-like:
	// link hover triggers HTML fetch, click swaps body, header DOM stays put.
	// Per-link opt-out via `data-astro-prefetch="false"` if needed.
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'hover',
	},
	build: {
		// Inline page stylesheets to remove the LCP-blocking external <link rel="stylesheet">.
		// All shared CSS is bundled into one chunk (~70KB minified), and the SSR HTML payload
		// is served gzip/br compressed by the node adapter.
		inlineStylesheets: 'always',
	},
	integrations: [react(), mdx()],
	vite: {
		// @tailwindcss/vite 4.2.x ships Plugin types built against an older Vite. With
		// Vite 8's stricter HotUpdatePluginContext, the assignment fails ts(2322). The
		// runtime shape is fine — cast at this boundary instead of pinning Vite back.
		plugins: [/** @type {import('vite').PluginOption} */ (/** @type {unknown} */ (tailwindcss()))],
		build: {
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (!id.includes('node_modules')) {
							return;
						}

						if (id.includes('@milkdown')) {
							return 'writer-milkdown';
						}

						if (
							id.includes('crelt') ||
							id.includes('style-mod') ||
							id.includes('w3c-keyname')
						) {
							return 'writer-codemirror-core';
						}

						const codemirrorChunk = getScopedPackageChunkName(id, '@codemirror');
						if (codemirrorChunk) {
							return `writer-${codemirrorChunk}`;
						}

						const lezerChunk = getScopedPackageChunkName(id, '@lezer');
						if (lezerChunk) {
							return `writer-${lezerChunk}`;
						}

						if (id.includes('prosemirror')) {
							return 'writer-prosemirror';
						}

						if (id.includes('katex')) {
							return 'writer-katex';
						}

						if (id.includes('markdown-it') || id.includes('highlight.js')) {
							return 'writer-preview';
						}

						if (
							id.includes('@radix-ui') ||
							id.includes('@floating-ui') ||
							id.includes('lucide-react') ||
							id.includes('/node_modules/clsx/') ||
							id.includes('\\node_modules\\clsx\\') ||
							id.includes('/node_modules/tailwind-merge/') ||
							id.includes('\\node_modules\\tailwind-merge\\') ||
							id.includes('/node_modules/class-variance-authority/') ||
							id.includes('\\node_modules\\class-variance-authority\\')
						) {
							return 'ui-vendor';
						}

						if (
							id.includes('/react/') ||
							id.includes('\\react\\') ||
							id.includes('/react-dom/') ||
							id.includes('\\react-dom\\') ||
							id.includes('/scheduler/') ||
							id.includes('\\scheduler\\')
						) {
							return 'react-vendor';
						}
					},
				},
			},
		},
	},
});
