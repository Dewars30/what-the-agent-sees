FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY . .
EXPOSE 8080
CMD ["node", "server.mjs"]
