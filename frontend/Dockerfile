# Build từ root repo (cần pnpm-lock.yaml của workspace):
#   docker build -f frontend/Dockerfile --build-arg VITE_API_URL=/api .
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter frontend
COPY frontend frontend
# Vite nhúng biến VITE_* vào bundle lúc build, nên phải truyền ở đây
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter frontend build

FROM nginx:1.29-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
