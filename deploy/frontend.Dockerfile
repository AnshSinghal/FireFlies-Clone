# Production frontend image (T-44).
#
# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME, so the
# API URL is a build arg, not a runtime env. We build with it EMPTY on purpose:
# an empty base makes every API call same-origin (`/api/v1/...`), nginx routes
# those to the backend, and the whole CORS problem ceases to exist (T-44.5 by
# construction).

FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build


FROM node:22-alpine

ENV NODE_ENV=production
RUN addgroup -S fireflies && adduser -S fireflies -G fireflies

WORKDIR /app
COPY --from=builder --chown=root:root /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=root:root /app/.next ./.next
COPY --from=builder --chown=root:root /app/public ./public
COPY --from=builder --chown=root:root /app/next.config.ts ./

USER fireflies

EXPOSE 3000
CMD ["npm", "run", "start"]
