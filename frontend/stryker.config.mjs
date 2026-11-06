/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // pnpm keeps packages in .pnpm/, so Stryker can't find the runner by scanning; declare it explicitly
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/**/*.{ts,tsx}', '!src/main.tsx'],
  reporters: ['clear-text', 'html', 'json'],
};
