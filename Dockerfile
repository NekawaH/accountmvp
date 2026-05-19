# Dockerfile for the Yjs WebSocket server (server/yws.ts).
# Built and deployed independently of the Next.js app (which runs on Vercel).
# The Next app talks to this service via wss://<your-fly-app>.fly.dev,
# configured through NEXT_PUBLIC_YWS_URL.

FROM node:20-alpine AS deps
WORKDIR /app
# openssl is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# Install all deps (tsx is a devDep — we run TS directly without a build step).
RUN npm ci
# Generate the Prisma client against the schema.
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV WS_PORT=1234

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json ./
COPY tsconfig.json ./
COPY lib ./lib
COPY server ./server

EXPOSE 1234

# Run the TS server directly with tsx (no compile step). JWT_SECRET and
# DATABASE_URL come from Fly secrets at runtime.
CMD ["npx", "tsx", "server/yws.ts"]
