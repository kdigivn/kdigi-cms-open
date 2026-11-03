FROM node:22-alpine AS base
# Update corepack first so it has current signing keys for the pinned pnpm version
# (packageManager in package.json), then enable it. Disable the download prompt so the
# non-interactive build never hangs on the first pnpm call.
RUN npm install -g corepack@latest && corepack enable pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS="--no-deprecation --max-old-space-size=8000"
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation"
# Remove config-discovery ambiguity for `payload migrate` (run by the entrypoint).
ENV PAYLOAD_CONFIG_PATH=/app/src/payload.config.ts
# Local-disk media (used for every site without Cloudflare R2 config) + generated secrets.
# Mount named volumes here to persist them.
ENV MEDIA_DIR=/app/media
ENV DATA_DIR=/app/data

COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/public ./public
# Required for `payload migrate` and the demo seed (load TS config + sources via tsx):
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/kdigi-entrypoint
RUN chmod +x /usr/local/bin/kdigi-entrypoint \
  && mkdir -p /app/media /app/data \
  && chown node:node /app /app/media /app/data

USER node
EXPOSE 3000
ENTRYPOINT ["kdigi-entrypoint"]
CMD ["node_modules/.bin/next", "start"]
