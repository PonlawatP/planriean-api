# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 as base
WORKDIR /usr/src/app

COPY . .
RUN bun install --frozen-lockfile --production

# run the app
USER bun
EXPOSE 3030/tcp
ENTRYPOINT [ "bun", "run", "index.js" ]