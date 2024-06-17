# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# COPY . .
COPY ./middleware ./middleware
COPY ./routes ./routes
COPY ./services ./services
COPY ./utils ./utils
COPY ./db.js ./db.js
COPY ./index.js ./index.js
COPY ./bun.lockb ./bun.lockb
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
COPY ./.env.production ./.env
RUN bun install --frozen-lockfile --production
# RUN bun run build

# run the app
USER bun
EXPOSE 3030/tcp
ENTRYPOINT [ "bun", "start" ]