# Single container running the demo (HTTP + SSE + auto-verify job). TypeScript runs directly on Node >= 22.18.
FROM node:22.18.0-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
# `npm start` creates .env from .env.example if missing; real environment variables (Render) take precedence.
CMD ["npm", "start"]
