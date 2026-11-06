# Build từ root repo (cần pnpm-lock.yaml của workspace):
#   docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=/api .
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter frontend
COPY frontend frontend
# Next nhúng biến NEXT_PUBLIC_* vào bundle lúc build, nên phải truyền ở đây
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter frontend build

# output: 'standalone' -> chỉ cần server.js + node_modules tối thiểu, ko cần cài lại package
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/frontend/.next/standalone ./
# standalone ko tự copy file tĩnh -> copy tay vào đúng chỗ server.js tìm
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
