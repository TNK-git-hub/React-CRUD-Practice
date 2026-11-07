import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Api = typeof import('../../src/api/productsQuerParam');
type Client = typeof import('../../src/api/client');

const BASE = 'http://api.test';

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

const REVIEW = {
  id: 9,
  rating: 4,
  comment: null,
  date: '2026-01-02T03:04:05.000Z',
  reviewerName: 'An',
  reviewerEmail: 'an@x.vn',
};

let seen: Seen[];
let api: Api;
let client: Client;

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

beforeEach(async () => {
  seen = [];
  vi.stubEnv('NEXT_PUBLIC_API_URL', BASE);
  respond(201, REVIEW);
  vi.resetModules(); // BASE_URL is read once at module load
  api = await import('../../src/api/productsQuerParam');
  client = await import('../../src/api/client');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('addReview', () => {
  it('POSTs JSON to /products/7/reviews with no comment key when none is given', async () => {
    // catches: wrong method/URL/header, `comment` key present when omitted
    await api.addReview(7, { rating: 4, reviewerName: 'An', reviewerEmail: 'an@x.vn' });

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe(`${BASE}/products/7/reviews`);
    expect(seen[0].headers['content-type']).toBe('application/json');
    expect(seen[0].body).toBe('{"rating":4,"reviewerName":"An","reviewerEmail":"an@x.vn"}');
  });

  it('sends the comment when present, all four fields under their own names', async () => {
    // catches: renamed field, dropped comment
    await api.addReview(7, { rating: 2, reviewerName: 'Bình', reviewerEmail: 'b@x.vn', comment: 'Tạm ổn' });

    expect(JSON.parse(seen[0].body ?? 'null')).toEqual({
      rating: 2,
      reviewerName: 'Bình',
      reviewerEmail: 'b@x.vn',
      comment: 'Tạm ổn',
    });
  });

  it('resolves to the response JSON, including a null comment', async () => {
    // catches: returning undefined or the raw Response
    const result = await api.addReview(7, { rating: 4, reviewerName: 'An', reviewerEmail: 'an@x.vn' });

    expect(result).toEqual(REVIEW);
  });

  it('a numeric and a string id hit the same URL', async () => {
    // catches: id type hard-coded into the path
    await fc.assert(
      fc.asyncProperty(fc.nat(), async (id) => {
        seen.length = 0;
        await api.addReview(id, { rating: 1, reviewerName: 'a', reviewerEmail: 'a@b.c' });
        await api.addReview(String(id), { rating: 1, reviewerName: 'a', reviewerEmail: 'a@b.c' });

        expect(seen[0].url).toBe(`${BASE}/products/${id}/reviews`);
        expect(seen[1].url).toBe(seen[0].url);
      }),
    );
  });

  it('a 400 rejects with an ApiError carrying status, path and the message', async () => {
    // catches: error swallowed, path lost, message list not joined
    respond(400, { message: ['rating must not be greater than 5'] });

    const err = await api.addReview(7, { rating: 9, reviewerName: 'An', reviewerEmail: 'an@x.vn' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({ status: 400, path: '/products/7/reviews', message: 'rating must not be greater than 5' });
  });

  it('a 404 with a string message rejects with an ApiError', async () => {
    // catches: only the 400 branch handled
    respond(404, { message: 'Product 99 not found' });

    const err = await api.addReview(99, { rating: 4, reviewerName: 'An', reviewerEmail: 'an@x.vn' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({ status: 404, path: '/products/99/reviews', message: 'Product 99 not found' });
  });
});
