import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = 'http://api.test';
const PAYLOAD = { rating: 4, reviewerName: 'An', reviewerEmail: 'an@x.vn' };

let calls: { url: string; method: string; body: string | null }[];
let client: QueryClient;
let mutateAsync: (p: typeof PAYLOAD) => Promise<unknown>;
let keys: typeof import('../../src/api/queryKeys').productKeys;
let ApiError: typeof import('../../src/api/client').ApiError;

function server(status: number, body: unknown) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

// Mounts the real hook inside a real QueryClientProvider and hands out its mutateAsync
async function mountHook(productId: number) {
  const { useAddReview } = await import('../../src/hooks/useProductMutations');
  function Probe() {
    mutateAsync = useAddReview(productId).mutateAsync as typeof mutateAsync;
    return null;
  }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
}

const invalidated = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;

beforeEach(async () => {
  calls = [];
  vi.stubEnv('NEXT_PUBLIC_API_URL', BASE);
  vi.resetModules();
  keys = (await import('../../src/api/queryKeys')).productKeys;
  ApiError = (await import('../../src/api/client')).ApiError;
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  for (const key of [keys.detail(7), keys.detail(8), keys.list({ limit: 10 }), keys.list({ q: 'x' })]) {
    client.setQueryData(key, { seeded: true });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('useAddReview(7)', () => {
  it('POSTs to /products/7/reviews and, on success, invalidates detail(7) and every list but not detail(8)', async () => {
    // catches: missing list invalidation, wrong/stale product id, over-broad invalidation
    server(201, { id: 1, ...PAYLOAD, comment: null, date: '2026-01-01T00:00:00.000Z' });
    await mountHook(7);

    await mutateAsync(PAYLOAD);

    expect(calls).toEqual([{ url: `${BASE}/products/7/reviews`, method: 'POST', body: JSON.stringify(PAYLOAD) }]);
    expect(invalidated(keys.detail(7))).toBe(true);
    expect(invalidated(keys.list({ limit: 10 }))).toBe(true);
    expect(invalidated(keys.list({ q: 'x' }))).toBe(true);
    expect(invalidated(keys.detail(8))).toBe(false);
  });

  it('on a 400 it rejects with ApiError and invalidates nothing', async () => {
    // catches: invalidating on error (onSettled), error swallowed
    server(400, { message: ['rating must not be greater than 5'] });
    await mountHook(7);

    const err = await mutateAsync(PAYLOAD).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: 'rating must not be greater than 5' });
    expect(invalidated(keys.detail(7))).toBe(false);
    expect(invalidated(keys.list({ limit: 10 }))).toBe(false);
  });
});
