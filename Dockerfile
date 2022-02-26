FROM node:16-bullseye-slim
RUN apt-get update && apt-get install --no-install-recommends --yes libpq-dev python3 build-essential
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
EXPOSE 3000
ENV PORT 3000
CMD ["node_modules/.bin/next", "start"]
