FROM node:22-bookworm-slim AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm prune --prod && rm -rf .next/cache .next/dev tsconfig.tsbuildinfo

FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client procps util-linux \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

ENV NODE_ENV=production
ENV DIO_DATA_DIR=/var/lib/dockio-panel
ENV DIO_BIND_HOST=0.0.0.0
ENV DIO_PORT=3099

COPY --from=builder /app /app

EXPOSE 3099
CMD ["sh", "-lc", "pnpm start --hostname ${DIO_BIND_HOST:-0.0.0.0} --port ${DIO_PORT:-3099}"]
