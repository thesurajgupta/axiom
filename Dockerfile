# Axiom runs a real Chromium to audit pages, so the image needs the browser and
# its system libraries. Microsoft's Playwright image ships both at the exact
# version our playwright-core expects, which avoids the classic "works locally,
# missing libnss3 in production" failure.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- dependencies ---------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime --------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production

# Next's standalone output bundles only the server and the modules it traced,
# which keeps the image small. playwright-core and axe-core are marked external
# in next.config.ts, so they are traced in as real files rather than bundled.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The Playwright base image installs browsers for the root user; run as the
# unprivileged user it also provides.
USER pwuser

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
