# ember-discord-adapter — interactions sidecar (SPEC §4, AD-7). Command register is NOT run on boot.
FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN useradd --create-home --uid 10001 adapter
USER adapter

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 8787 8788

CMD ["node", "dist/index.js"]
