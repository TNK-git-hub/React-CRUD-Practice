# Coding Conventions

These rules are extracted from the existing code (onboarded 2026-11-27). Rules marked [PROPOSED] are accepted by the user but not yet visible in the code.

## Naming

| Element | Convention | Example |
|---|---|---|
| BE files | kebab-case + type suffix | `product-image.entity.ts`, `create-product.dto.ts`, `products.service.ts` |
| FE components / views | PascalCase `.tsx` | `ProductCard.tsx`, `ProductList.tsx` |
| FE hooks | `useX.ts` | `useProductMutations.ts` |
| FE utils | camelCase `.ts` | `listUrl.ts`, `priceRange.ts` |
| Classes / types / interfaces | PascalCase. DTO classes end in `Dto`. Props interfaces are `XProps` | `QueryProductDto`, `ProductCardProps` |
| Functions / methods | camelCase verbs | `getProducts`, `handleUniqueError` |
| Constants | UPPER_SNAKE | `DETAIL_TTL`, `UNDO_MS`, `SORTABLE_FIELDS` |
| DB tables | plural snake_case in `@Entity('...')` | `product_images` [UNVERIFIED exact names] |
| Tests [PROPOSED] | BE `*.spec.ts`, FE `*.test.ts(x)`. Names read `should <behavior> when <condition>` | |

## Code style

- No formatter or backend linter exists. ESLint covers the FE only (`frontend/eslint.config.js`). New code must pass `pnpm lint` with no new warnings.
- **Formatting: match the surrounding file.** Indentation (2 vs 4 spaces), quote style and semicolons vary between files. Follow the style of the file you edit. A new file copies its nearest sibling. Adding Prettier is a separate future change.
- **Imports:** relative paths only. There are no path aliases in either tsconfig, so do not add any. Use `import type` for type-only imports in the FE.
- **Exports:** FE components and views use a default export. Hooks, utils and API functions use named exports.
- **Comments:** new comments are in English. Existing Vietnamese comments and tutorial markers (`Step 4`, `//IMG_FeToBe`) are left alone unless the file is refactored.
- **User-facing copy:** Vietnamese. When a validation message exists in both the FE (`utils/productForm.ts`, `utils/priceRange.ts`) and the BE (DTOs, `price-bound.validator.ts`), update both.
- **Logging:** do not add `console.log`. Existing render-trace logs are known debt: `views/ProductList.tsx`, `ProductCard.tsx`, `ProList.tsx`, `SearchForm.tsx`.

## Patterns

- **Error handling (BE):** throw Nest HTTP exceptions. Postgres unique violation `23505` becomes `ConflictException` via `handleUniqueError` (`products.service.ts`). Validation errors use the custom `exceptionFactory` in `main.ts` (default shape + `errors` map).
- **Error handling (FE):** `apiFetch` throws `ApiError { status, path, errors }`. Catch blocks normalize with `toError()`. Show errors to the user with `StatusMessage`, `SaveErrorBanner` or a toast. Queries retry only on network errors and 5xx (`app/providers.tsx`).
- **Logging (BE):** use the Nest `Logger` as `private readonly logger = new Logger(X.name)` with `log` and `warn`. Never log request bodies, emails or secrets.
- **Dependency injection:** Nest constructor injection with `private readonly`. Each module uses `TypeOrmModule.forFeature([...])`.
- **Configuration:** use `ConfigService.get('X')`. Add new vars to `backend/.env.example` with placeholder values.
- **Async:** `async`/`await` throughout. Multi-entity writes go in `DataSource.transaction`.
- **Caching:** cache-aside through `CacheService`. Every write bumps the list version key (INCR). Cache errors are swallowed and logged, never thrown.
- **FE state:** server state lives in TanStack Query, with keys from `api/queryKeys.ts`. List state (page, sort, filters) lives in the URL via `utils/listUrl.ts`. Toasts use React context (`hooks/useToast.ts`). There is no global store, so do not add one.
- **FE mutations:** an optimistic update needs a rollback. Delete uses a 5s undo (`hooks/useProductMutations.ts`).
- **FE styling:** use Tailwind utilities built on tokens from `styles/index.css` only. The default palette is disabled. Dark mode works through `[data-theme="dark"]` var overrides; do not use `dark:`. Buttons, dialogs and form pages use the class maps in `utils/buttonStyles.ts`, `dialogStyles.ts` and `formPageStyles.ts`.
- **API shape:** mirrors dummyjson. Lists return `{ products, total, skip, limit }`, create is `POST /products/add`, delete returns `isDeleted`. Keep new endpoints consistent with this shape.

## Testing conventions [PROPOSED: no tests exist yet]

- **Frameworks:** Jest + `@nestjs/testing` (+ `supertest` for e2e) for BE. Vitest + React Testing Library (+ jsdom) for FE. The first feature that needs tests installs them behind the **dependency risk gate**.
- **Test split:**
  - Unit tests for services, validators, utils and hooks.
  - Integration tests for controllers via the Nest testing module.
  - Component tests for views and components.
- **Naming:** `describe('<Unit>')` with `it('should <behavior> when <condition>')`.
- **Mocks:** prefer fakes. Mock only at boundaries: the TypeORM `Repository` and `CacheService` in BE, `apiFetch` or network in FE. Do not mock the unit under test.
- **Fixtures:** factories live next to their tests or in `<pkg>/test/factories/`. Use fake data only, with no real emails or names.
- **Coverage:** every acceptance criterion has at least one test. No numeric threshold yet.

## Git

- **Branches:** `feat/<YYYYMMDD>-<slug>` for features, `fix/<YYYYMMDD>-<slug>` for bugs. Base branch is `new-project`.
- **Commits:** imperative mood, sentence case, no prefix (e.g. "Upgrade Next.js to 16.4.6 and fix audited vulnerabilities").

## Artifact language

- Context docs and code comments are in English. UI copy is in Vietnamese.
