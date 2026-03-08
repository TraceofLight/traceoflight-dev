FROM node:20-bookworm-slim
WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=6543

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
RUN npm prune --omit=dev && npm cache clean --force

EXPOSE 6543

CMD ["node", "./dist/server/entry.mjs"]
