# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# COPY . .
COPY ./src/middleware ./src/middleware
COPY ./src/routes ./src/routes
COPY ./src/utils ./src/utils
COPY ./src/db.js ./src/db.js
COPY ./src/redis.js ./src/redis.js
COPY ./src/index.js ./src/index.js
COPY ./bun.lockb ./bun.lockb
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
COPY ./.env.production ./.env
RUN bun install --frozen-lockfile --production

RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /usr/src/app
COPY --from=base /usr/src/app/dist ./dist
COPY --from=base /usr/src/app/.env ./.env

# run the app
USER bun
EXPOSE 3030/tcp
ENTRYPOINT [ "bun", "dist/index.js" ]
