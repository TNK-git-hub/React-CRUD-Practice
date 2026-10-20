import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,
  // build ra server.js + node_modules tối thiểu -> image Docker nhỏ (xem Dockerfile)
  output: 'standalone',
  // pnpm workspace: node_modules nằm ở root repo -> trace file từ root
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
}

export default nextConfig
