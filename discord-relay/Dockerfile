FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY index.js .
COPY bandwidth.cjs .
USER node
EXPOSE 8080
CMD ["node", "index.js"]
