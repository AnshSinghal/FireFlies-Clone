# Development image used by docker-compose (T-01.9).
# T-44.1 deploys the frontend to Vercel, which builds from source and does not
# use this file.

FROM node:22-alpine

WORKDIR /app

# Install dependencies in their own layer so source edits do not re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
