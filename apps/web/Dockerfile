FROM oven/bun:1-debian
WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=6543
ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
ENV NODE_ENV=production
RUN rm -rf node_modules && bun install --production --frozen-lockfile && rm -rf /root/.bun/install/cache

EXPOSE 6543

CMD ["bun", "./dist/server/entry.mjs"]
