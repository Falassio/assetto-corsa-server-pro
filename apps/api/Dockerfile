FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 8080
VOLUME ["/data"]

CMD ["npm", "start"]
