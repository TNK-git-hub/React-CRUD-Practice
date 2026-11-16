import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Hidden tests chỉ có trên máy này và agent không được thấy: `pnpm lint` (code-gate, ci:local) không được fail
  // vì chúng, cũng không được in vị trí hay nội dung lỗi của chúng.
  globalIgnores(['.next', 'dist', 'next-env.d.ts', '**/test/private/**']),
])
