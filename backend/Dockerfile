# File do AI setup
# Build từ root repo (cần pnpm-lock.yaml của workspace):
#   docker build -f backend/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Cài đủ deps (cả devDeps) để build
FROM base AS build
RUN pnpm install --frozen-lockfile --filter backend
COPY backend backend
RUN pnpm --filter backend build

# Chỉ deps production để chạy
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter backend

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/backend/node_modules backend/node_modules
COPY --from=build /app/backend/dist backend/dist
COPY backend/package.json backend/
WORKDIR /app/backend
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
