# Build do frontend React e serve os arquivos estaticos com o servidor de token.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY discord-relay/package.json ./discord-relay/package.json
RUN npm ci
COPY frontend ./frontend
COPY scripts/build-info.mjs ./scripts/build-info.mjs
ARG MAZESTREAM_BUILD_PROFILE=host
ARG MAZESTREAM_REVISION=unknown
ENV MAZESTREAM_REVISION=$MAZESTREAM_REVISION
RUN if [ "$MAZESTREAM_BUILD_PROFILE" = "local" ]; then npm run build:local; elif [ "$MAZESTREAM_BUILD_PROFILE" = "host" ]; then npm run build:host; else exit 1; fi

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY frontend/server.cjs frontend/server-votekick.cjs ./
COPY --from=build /app/frontend/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "server.cjs"]
