# OtoRent Backend — PRODUCTION image
# Node + Express + Prisma. Runs `prisma migrate deploy` on start, then the API
# (BullMQ workers start in-process inside server.js when Redis is reachable).
FROM node:20-alpine

WORKDIR /app

# Install ALL deps: the Prisma CLI (needed for `generate` + `migrate deploy`)
# lives in devDependencies, so `--omit=dev` would break migrations.
COPY package*.json ./
RUN npm install

# Generate the Prisma client at build time (schema first for layer caching).
COPY prisma ./prisma
RUN npx prisma generate

# App source
COPY . .

EXPOSE 4000

# Apply pending migrations (idempotent, no data loss) then boot the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
