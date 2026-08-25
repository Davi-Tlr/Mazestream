# Build do frontend React e serve os arquivos estaticos com o servidor de token.
FROM node:20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server.cjs ./
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server.cjs"]
