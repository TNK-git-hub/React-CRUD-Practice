import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductPayload } from '../../src/types/product';

type Api = typeof import('../../src/api/productsQuerParam');
type Client = typeof import('../../src/api/client');

// What the fake server saw, echoed back as the response body
interface Echo {
  url: string;
  method: string;
  headers: Record<string, string>; // lower-cased names, as Headers normalizes them
  body: string | null;
  form: { keys: string[]; name: string; type: string } | null;
}

const BASE = 'http://api.test';

// Fake fetch that echoes the request it received. Only the network is faked;
// apiFetch (URL building, res.ok, res.json) runs for real.
async function echoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const body = init?.body;
  let form: Echo['form'] = null;
  if (body instanceof FormData) {
    const file = body.get('file');
    form = {
      keys: [...body.keys()],
      name: file instanceof File ? file.name : '<no file field>',
      type: file instanceof File ? file.type : '<no file field>',
    };
  }
  const echo: Echo = {
    url: String(input),
    method: init?.method ?? 'GET',
    headers: Object.fromEntries(new Headers(init?.headers)),
    body: typeof body === 'string' ? body : null,
    form,
  };
  return new Response(JSON.stringify(echo), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fake server that answers every request with the given error status and raw body
function failWith(status: number, body: string) {
  vi.stubGlobal('fetch', async () => new Response(body, { status }));
}

let api: Api;
let client: Client;

beforeEach(async () => {
  vi.stubEnv('VITE_API_URL', BASE);
  vi.stubGlobal('fetch', echoFetch);
  vi.resetModules(); // BASE_URL is read once at module load
  api = await import('../../src/api/productsQuerParam');
  client = await import('../../src/api/client'); // same module instance as the one api uses
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The functions are typed with the real response shapes; the fake returns an Echo
const call = async (p: Promise<unknown>) => (await p) as Echo;
const parse = (echo: Echo) => new URL(echo.url);
const queryOf = (echo: Echo) => Object.fromEntries(parse(echo).searchParams);

describe('getProducts: query string', () => {
  it.each<[string, Parameters<Api['getProducts']>[0], Record<string, string>]>([
    ['no argument -> defaults', undefined, { limit: '10', skip: '0', order: 'asc' }],
    [
      'every field set',
      { q: 'phone', limit: 20, skip: 40, sortBy: 'price', order: 'desc' },
      { limit: '20', skip: '40', order: 'desc', q: 'phone', sortBy: 'price' },
    ],
    ['empty q and sortBy are not sent', { q: '', sortBy: '', order: 'desc' }, { limit: '10', skip: '0', order: 'desc' }],
    [
      'explicit undefined falls back to defaults',
      { q: undefined, limit: undefined, skip: undefined, sortBy: undefined, order: undefined },
      { limit: '10', skip: '0', order: 'asc' },
    ],
  ])('%s', async (_name, query, expectedQuery) => {
    const echo = await call(api.getProducts(query));

    expect(echo.method).toBe('GET');
    expect(echo.url.startsWith(`${BASE}/products?`)).toBe(true);
    expect(parse(echo).pathname).toBe('/products');
    expect(queryOf(echo)).toEqual(expectedQuery);
  });

  it('encodes &, = and spaces in q so they do not leak into other params', async () => {
    const url = parse(await call(api.getProducts({ q: 'a b&c=d' })));

    expect(url.searchParams.get('q')).toBe('a b&c=d');
    expect(url.searchParams.has('c')).toBe(false);
  });

  it('encodes # and ? in q so they do not cut the URL', async () => {
    const url = parse(await call(api.getProducts({ q: 'iPhone 15 #1?' })));

    expect(url.searchParams.get('q')).toBe('iPhone 15 #1?');
    expect(url.pathname).toBe('/products');
    expect(url.hash).toBe('');
  });

  it('every query round-trips through the URL: each value once, only known keys', async () => {
    const special = fc.constantFrom('&', '=', '#', '?', '%', '+', ' ', 'đ', '/');
    const anyGrapheme = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 });
    const qArb = fc.string({ unit: fc.oneof(special, anyGrapheme) });
    const allowedKeys = ['limit', 'skip', 'order', 'q', 'sortBy'];

    await fc.assert(
      fc.asyncProperty(
        qArb,
        fc.integer(),
        fc.integer(),
        fc.constantFrom('' as const, 'title' as const, 'price' as const, 'rating' as const, 'stock' as const),
        fc.constantFrom('asc' as const, 'desc' as const),
        async (q, limit, skip, sortBy, order) => {
          const url = parse(await call(api.getProducts({ q, limit, skip, sortBy, order })));
          const params = url.searchParams;

          expect(url.pathname).toBe('/products');
          expect(url.hash).toBe('');
          expect(params.get('limit')).toBe(String(limit));
          expect(params.get('skip')).toBe(String(skip));
          expect(params.get('order')).toBe(order);
          expect(params.get('q')).toBe(q ? q : null);
          expect(params.get('sortBy')).toBe(sortBy ? sortBy : null);
          for (const key of new Set(params.keys())) {
            expect(allowedKeys).toContain(key);
            expect(params.getAll(key)).toHaveLength(1);
          }
        },
      ),
    );
  });
});

describe('createProduct', () => {
  it('POSTs a minimal payload as JSON to /products/add', async () => {
    const echo = await call(api.createProduct({ title: 'A', description: 'B', category: 'c', price: 9 }));

    expect(echo.method).toBe('POST');
    expect(echo.url).toBe(`${BASE}/products/add`);
    expect(echo.headers['content-type']).toBe('application/json');
    expect(JSON.parse(echo.body ?? 'null')).toEqual({ title: 'A', description: 'B', category: 'c', price: 9 });
  });

  it('sends every ProductPayload field, nothing dropped or renamed', async () => {
    const payload: ProductPayload = {
      title: 'Lamp',
      description: 'Desk lamp',
      category: 'home',
      brand: 'Acme',
      tags: ['light', 'desk'],
      price: 25,
      discountPercentage: 12.5,
      stock: 3,
      minimumOrderQuantity: 2,
      availabilityStatus: 'Low Stock',
      sku: 'LMP-001',
      weight: 4,
      dimensions: { width: 10, height: 30, depth: 8 },
      warrantyInformation: '1 year',
      shippingInformation: '2 days',
      returnPolicy: '30 days',
      images: ['https://img.test/1.png', 'https://img.test/2.png'],
      thumbnail: 'https://img.test/t.png',
    };

    const echo = await call(api.createProduct(payload));

    expect(JSON.parse(echo.body ?? 'null')).toEqual({
      title: 'Lamp',
      description: 'Desk lamp',
      category: 'home',
      brand: 'Acme',
      tags: ['light', 'desk'],
      price: 25,
      discountPercentage: 12.5,
      stock: 3,
      minimumOrderQuantity: 2,
      availabilityStatus: 'Low Stock',
      sku: 'LMP-001',
      weight: 4,
      dimensions: { width: 10, height: 30, depth: 8 },
      warrantyInformation: '1 year',
      shippingInformation: '2 days',
      returnPolicy: '30 days',
      images: ['https://img.test/1.png', 'https://img.test/2.png'],
      thumbnail: 'https://img.test/t.png',
    });
  });
});

describe('updateProduct', () => {
  it('PATCHes only the given fields as JSON to /products/:id', async () => {
    const echo = await call(api.updateProduct(5, { price: 10 }));

    expect(echo.method).toBe('PATCH');
    expect(echo.url).toBe(`${BASE}/products/5`);
    expect(echo.headers['content-type']).toBe('application/json');
    expect(JSON.parse(echo.body ?? 'null')).toEqual({ price: 10 });
  });
});

describe('deleteProduct', () => {
  it('DELETEs /products/:id without a body', async () => {
    const echo = await call(api.deleteProduct(7));

    expect(echo.method).toBe('DELETE');
    expect(echo.url).toBe(`${BASE}/products/7`);
    expect(echo.body).toBeNull();
  });
});

describe('getProductById', () => {
  it('GETs /products/:id', async () => {
    const echo = await call(api.getProductById(3));

    expect(echo.method).toBe('GET');
    expect(echo.url).toBe(`${BASE}/products/3`);
  });
});

describe('uploadImage', () => {
  it('POSTs the file as multipart field "file" and leaves Content-Type to fetch', async () => {
    const echo = await call(api.uploadImage(new File(['x'], 'a.png', { type: 'image/png' })));

    expect(echo.method).toBe('POST');
    expect(echo.url).toBe(`${BASE}/uploads`);
    expect(echo.form).toEqual({ keys: ['file'], name: 'a.png', type: 'image/png' });
    // A hand-set multipart Content-Type would have no boundary and break the upload
    expect(echo.headers).not.toHaveProperty('content-type');
  });
});

describe('error responses (through apiFetch)', () => {
  it('a non-2xx response rejects with ApiError carrying status, path and the server message', async () => {
    failWith(404, '{"message":"Not found"}');

    const err = await api.getProductById(3).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({ name: 'ApiError', status: 404, path: '/products/3', message: 'Not found' });
  });

  it('a validation message list is joined with ", "', async () => {
    failWith(400, '{"message":["title should not be empty","price must be a number"]}');

    const err = await api.createProduct({ title: '', description: 'B', category: 'c' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({
      status: 400,
      path: '/products/add',
      message: 'title should not be empty, price must be a number',
    });
  });

  it('a body that is not JSON falls back to a message with the status', async () => {
    failWith(500, '<html>');

    const err = await api.deleteProduct(7).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({ status: 500, path: '/products/7', message: 'Call api error: 500' });
  });
});
