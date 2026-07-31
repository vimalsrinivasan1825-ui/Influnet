# Base image — Node 22 (Node 20 is EOL; @supabase/supabase-js warns on <22)
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/landing/package.json ./apps/landing/package.json

RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
# npm workspaces hoist all dependencies to the ROOT node_modules (including the
# per-workspace symlinks like node_modules/web -> ../apps/web), so copying the
# root tree is sufficient. Per-app node_modules dirs are empty/absent and must
# NOT be copied — doing so breaks the build in a clean environment.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time — runtime
# env vars CANNOT change already-built client JS. Railway must pass these as
# *build* variables (build args). If omitted, the client bundle ships blank
# Supabase/Stream config and the browser app cannot authenticate.
#
# Every NEXT_PUBLIC_* var referenced by client ("use client") code MUST be
# listed here. A var missing from this list still resolves correctly in
# server code (Route Handlers read live process.env at request time), which
# is exactly what makes this failure mode confusing: server routes report the
# new value immediately, while every client bundle keeps the old one until a
# real rebuild happens with the ARG wired through. Bit us for
# NEXT_PUBLIC_PHONE_OTP_ENABLED on 2026-07-31 — see
# docs/operations/WEB_MOBILE_PARITY_2026-07-31.md.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STREAM_API_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PHONE_OTP_ENABLED
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_STREAM_API_KEY=$NEXT_PUBLIC_STREAM_API_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_PHONE_OTP_ENABLED=$NEXT_PUBLIC_PHONE_OTP_ENABLED \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID

# Build the Next.js app in standalone mode
RUN npm run build --workspace=web

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Leverage Next.js standalone output tracing to keep image size small
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build when output: 'standalone' is enabled
CMD ["node", "apps/web/server.js"]
