FROM node:20-alpine
WORKDIR /app
COPY server.js index.html manifest.webmanifest sw.js icon-192.png icon-512.png ./
EXPOSE 3000
CMD ["node", "server.js"]
