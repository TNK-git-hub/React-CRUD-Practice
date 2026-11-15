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
  vi.stubEnv('NEXT_PUBLIC_API_URL', BASE);
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

// minPrice / maxPrice are strings kept as typed (001-ADR-2); built by cast so this file type-checks on its own
type Price = { minPrice?: string; maxPrice?: string };
const withPrice = (query: Price & { q?: string }) => query as Parameters<Api['getProducts']>[0];

describe('getProducts: price range', () => {
  it('PROD-001-S1 sends minPrice=10 and maxPrice=20 exactly once', async () => {
    const params = parse(await call(api.getProducts(withPrice({ minPrice: '10', maxPrice: '20' })))).searchParams;

    expect(params.getAll('minPrice')).toEqual(['10']);
    expect(params.getAll('maxPrice')).toEqual(['20']);
  });

  it('PROD-001-S1 sends the bounds as typed: "010" and "20.00" are not normalised', async () => {
    const query = queryOf(await call(api.getProducts(withPrice({ minPrice: '010', maxPrice: '20.00' }))));

    expect(query).toMatchObject({ minPrice: '010', maxPrice: '20.00' });
  });

  it.each<[string, Price, Record<string, string>]>([
    ['only a minimum', { minPrice: '20' }, { minPrice: '20' }],
    ['only a maximum', { maxPrice: '10' }, { maxPrice: '10' }],
    ['a maximum of "0" is a real bound', { maxPrice: '0' }, { maxPrice: '0' }],
  ])('PROD-001-S1 %s', async (_name, price, expected) => {
    const query = queryOf(await call(api.getProducts(withPrice(price))));

    expect(query).toEqual({ limit: '10', skip: '0', order: 'asc', ...expected });
  });

  it.each<[string, Price]>([
    ['both empty strings', { minPrice: '', maxPrice: '' }],
    ['both undefined', { minPrice: undefined, maxPrice: undefined }],
    ['none given', {}],
  ])('PROD-001-S5 %s: neither key is sent', async (_name, price) => {
    const params = parse(await call(api.getProducts(withPrice(price)))).searchParams;

    expect(params.has('minPrice')).toBe(false);
    expect(params.has('maxPrice')).toBe(false);
  });

  it('PROD-001-S5 an empty minimum is dropped while the maximum is still sent', async () => {
    const query = queryOf(await call(api.getProducts(withPrice({ minPrice: '', maxPrice: '10' }))));

    expect(query).toEqual({ limit: '10', skip: '0', order: 'asc', maxPrice: '10' });
  });

  it('PROD-001-S1 the range round-trips next to q through the URL: each key once, no other key (property)', async () => {
    const price = fc.option(fc.stringMatching(/^[0-9]{1,8}(\.[0-9]{1,2})?$/), { nil: undefined });
    await fc.assert(
      fc.asyncProperty(price, price, fc.constantFrom('', 'phone', 'a&b'), async (minPrice, maxPrice, q) => {
        const params = parse(await call(api.getProducts(withPrice({ minPrice, maxPrice, q })))).searchParams;

        expect(params.get('minPrice')).toBe(minPrice ?? null);
        expect(params.get('maxPrice')).toBe(maxPrice ?? null);
        expect(params.get('q')).toBe(q ? q : null);
        for (const key of new Set(params.keys())) expect(params.getAll(key)).toHaveLength(1);
      }),
    );
  });
});

describe('ApiError carries the field errors of a 400 (price bounds)', () => {
  const errorsOf = (err: unknown) => (err as { errors?: Record<string, string> }).errors;

  it('PROD-003-S13 keeps errors.minPrice, and message / status / path as before', async () => {
    failWith(
      400,
      '{"statusCode":400,"message":["Giá không được âm"],"error":"Bad Request","errors":{"minPrice":"Giá không được âm"}}',
    );

    const err = await api.getProducts(withPrice({ minPrice: '-1' })).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({ status: 400, path: expect.stringContaining('/products?'), message: 'Giá không được âm' });
    expect(errorsOf(err)).toEqual({ minPrice: 'Giá không được âm' });
  });

  it('PROD-003-S21 errors.maxPrice alone has no minPrice key', async () => {
    failWith(400, '{"message":["Giá phải là số"],"errors":{"maxPrice":"Giá phải là số"}}');

    const err = await api.getProducts(withPrice({ maxPrice: 'abc' })).catch((e: unknown) => e);

    expect(errorsOf(err)).toEqual({ maxPrice: 'Giá phải là số' });
  });

  it('PROD-003-S21 both bounds: each message under its own key, message joined with ", "', async () => {
    failWith(
      400,
      '{"message":["Giá không được âm","Giá phải là số"],"errors":{"minPrice":"Giá không được âm","maxPrice":"Giá phải là số"}}',
    );

    const err = await api.getProducts(withPrice({ minPrice: '-1', maxPrice: 'abc' })).catch((e: unknown) => e);

    expect(errorsOf(err)).toEqual({ minPrice: 'Giá không được âm', maxPrice: 'Giá phải là số' });
    expect(err).toMatchObject({ message: 'Giá không được âm, Giá phải là số' });
  });

  it.each<[string, number, string]>([
    ['a 400 without errors', 400, '{"message":["limit must not be less than 1"]}'],
    ['a 500 with a body', 500, '{"message":"boom"}'],
    ['a 500 that is not JSON', 500, '<html>'],
  ])('PROD-003-S13 %s has no errors', async (_name, status, body) => {
    failWith(status, body);

    const err = await api.getProducts().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect(errorsOf(err)).toBeUndefined();
  });

  it('PROD-003-S21 errors is ignored on a non-400 status (a 5xx is not a field error)', async () => {
    failWith(503, '{"message":"down","errors":{"minPrice":"x"}}');

    const err = await api.getProducts().catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 503 });
    expect(errorsOf(err)).toBeUndefined();
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
