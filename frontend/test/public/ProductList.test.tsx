// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductList from '../../src/views/ProductList';
import type { ProductSummary } from '../../src/types/product';

// ---- fake router (next/navigation): keeps a history so Back can be exercised ----
const nav = vi.hoisted(() => {
  const state = { entries: ['/'], index: 0 };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  let cache = { url: '', params: new URLSearchParams() };
  return {
    state,
    reset(url: string) {
      state.entries = [url];
      state.index = 0;
    },
    push(url: string) {
      state.entries = [...state.entries.slice(0, state.index + 1), url];
      state.index = state.entries.length - 1;
      emit();
    },
    back() {
      if (state.index > 0) state.index -= 1;
      emit();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot: () => state.entries[state.index] as string,
    paramsOf(url: string) {
      if (cache.url !== url) cache = { url, params: new URLSearchParams(url.split('?')[1] ?? '') };
      return cache.params;
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const router = { push: (url: string) => nav.push(url), replace: (url: string) => nav.push(url), back: () => nav.back() };
  return {
    useRouter: () => router,
    useSearchParams: () => nav.paramsOf(useSyncExternalStore(nav.subscribe, nav.snapshot, nav.snapshot)),
    usePathname: () => (useSyncExternalStore(nav.subscribe, nav.snapshot, nav.snapshot).split('?')[0] as string),
  };
});

// ---- fake network: a small products API over a fixed catalog ----
function item(id: number, price: number, title?: string): ProductSummary {
  return {
    id,
    title: title ?? `P-${price.toFixed(2).padStart(6, '0')}`,
    description: `Description ${id}`,
    category: 'beauty',
    brand: 'Brand',
    sku: `SKU-${id}`,
    price,
    discountPercentage: 10,
    rating: 4,
    stock: 5,
    minimumOrderQuantity: 1,
    availabilityStatus: 'In Stock',
    weight: 1,
    dimensions: { width: 1, height: 1, depth: 1 },
    warrantyInformation: null,
    shippingInformation: null,
    returnPolicy: null,
    thumbnail: null,
    reviewCount: 0,
    barcode: null,
    qrCode: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Match = (params: URLSearchParams) => boolean;
type Hook = (params: URLSearchParams) => Promise<Response> | undefined;

function createServer(catalog: ProductSummary[]) {
  const requests: URLSearchParams[] = [];
  let hooks: Hook[] = [];

  function answer(p: URLSearchParams): Response {
    const q = (p.get('q') ?? '').toLowerCase();
    const min = p.get('minPrice');
    const max = p.get('maxPrice');
    let list = catalog.filter(
      (x) =>
        (q === '' || x.title.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q)) &&
        (min === null || x.price >= Number(min)) &&
        (max === null || x.price <= Number(max)),
    );
    const sortBy = p.get('sortBy') as 'title' | 'price' | 'rating' | 'stock' | null;
    const dir = p.get('order') === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => {
      if (!sortBy) return dir * (a.id - b.id);
      const x = a[sortBy];
      const y = b[sortBy];
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c !== 0 ? dir * c : a.id - b.id;
    });
    const skip = Number(p.get('skip') ?? 0);
    const limit = Number(p.get('limit') ?? 10);
    return json({ products: list.slice(skip, skip + limit), total: list.length, skip, limit });
  }

  async function fetchFn(input: RequestInfo | URL): Promise<Response> {
    const url = new URL(String(input), 'http://api.test');
    if (url.pathname !== '/products') return json({ message: 'not found' }, 404);
    requests.push(url.searchParams);
    for (const hook of hooks) {
      const res = hook(url.searchParams);
      if (res) return res;
    }
    return answer(url.searchParams);
  }

  return {
    requests,
    fetchFn,
    // hold every request that matches until release() is called, then answer it normally
    hold(match: Match) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      hooks.push((p) => (match(p) ? gate.then(() => answer(p)) : undefined));
      return { release };
    },
    fail(match: Match, status: number, body: unknown) {
      hooks.push((p) => (match(p) ? Promise.resolve(json(body, status)) : undefined));
    },
    networkDown(match: Match) {
      hooks.push((p) => (match(p) ? Promise.reject(new TypeError('Failed to fetch')) : undefined));
    },
    clearHooks() {
      hooks = [];
    },
  };
}

type Server = ReturnType<typeof createServer>;
let server: Server;

function renderList(url: string, catalog: ProductSummary[], setup?: (s: Server) => void) {
  nav.reset(url);
  server = createServer(catalog);
  setup?.(server);
  vi.stubGlobal('fetch', server.fetchFn);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductList />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- constants from the spec, verbatim ----
const MIN_LABEL = 'Giá tối thiểu ($)';
const MAX_LABEL = 'Giá tối đa ($)';
const NEGATIVE = 'Giá không được âm';
const NOT_A_NUMBER = 'Giá phải là số';
const DECIMALS = 'Giá chỉ được có tối đa 2 chữ số thập phân';
const TOO_BIG = 'Giá không được lớn hơn $99,999,999.99';
const MIN_GT_MAX = 'Giá tối thiểu không được lớn hơn giá tối đa';
const EMPTY_TITLE = 'Không tìm thấy sản phẩm nào';
const EMPTY_DESCRIPTION = 'Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc.';
const LOAD_ERROR_TITLE = 'Không tải dược danh sách sản phẩm';

// ---- helpers ----
const user = () => userEvent.setup();
const minInput = () => screen.getByLabelText(MIN_LABEL) as HTMLInputElement;
const maxInput = () => screen.getByLabelText(MAX_LABEL) as HTMLInputElement;
const keywordInput = () => screen.getByPlaceholderText('Tìm sản phẩm theo tên...') as HTMLInputElement;
const searchButton = () => screen.getByRole('button', { name: 'Search' });
const currentUrl = () => nav.state.entries[nav.state.index] as string;
const titles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);
const lastRequest = () => server.requests[server.requests.length - 1] as URLSearchParams;
const skeletons = () => document.querySelectorAll('.animate-skeleton').length;

const prices = (...values: number[]) => values.map((v) => `P-${v.toFixed(2).padStart(6, '0')}`);
const fixture = () => [item(1, 5), item(2, 10), item(3, 20), item(4, 30)];

function messageOf(input: HTMLElement): string | null {
  const id = input.getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

function paginationHidden() {
  const next = screen.queryByRole('button', { name: 'Next' });
  return next === null || next.closest('.hidden') !== null;
}

const shownLines = () =>
  [...document.querySelectorAll('span')].map((s) => s.textContent ?? '').filter((t) => t.startsWith('Hiển thị'));

async function typeInto(u: ReturnType<typeof user>, input: HTMLElement, text: string) {
  await u.clear(input);
  if (text !== '') await u.type(input, text);
}

async function applyRange(u: ReturnType<typeof user>, min: string, max: string) {
  await typeInto(u, minInput(), min);
  await typeInto(u, maxInput(), max);
  await u.click(searchButton());
}

async function waitTitles(expected: Array<string | null>) {
  await waitFor(() => expect(titles()).toEqual(expected));
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

// =====================================================================================
describe('PROD-001: price range in the search form', () => {
  it('PROD-001-S1 entering 10 and 20 and pressing Search shows the 10.00 and 20.00 products, URL minPrice=10&maxPrice=20', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '10', '20');

    await waitTitles(prices(10, 20));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    expect(lastRequest().get('minPrice')).toBe('10');
    expect(lastRequest().get('maxPrice')).toBe('20');
  });

  it('PROD-001-S1 typing alone reloads nothing and changes no URL', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));
    const before = server.requests.length;

    await u.type(minInput(), '10');
    await u.type(maxInput(), '20');
    await settle();

    expect(server.requests.length).toBe(before);
    expect(currentUrl()).toBe('/');
  });

  it('PROD-001-S1 pressing Enter in a price input applies the range like Search', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await u.type(minInput(), '10');
    await u.type(maxInput(), '20{Enter}');

    await waitTitles(prices(10, 20));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
  });

  it('PROD-001-S2 only a minimum of 20: the 20.00 and 30.00 products, URL has minPrice=20 and no maxPrice', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '20', '');

    await waitTitles(prices(20, 30));
    expect(currentUrl()).toBe('/?minPrice=20');
    expect(lastRequest().has('maxPrice')).toBe(false);
  });

  it('PROD-001-S3 only a maximum of 10: the 5.00 and 10.00 products, URL has maxPrice=10 and no minPrice', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '', '10');

    await waitTitles(prices(5, 10));
    expect(currentUrl()).toBe('/?maxPrice=10');
    expect(lastRequest().has('minPrice')).toBe(false);
  });

  it('PROD-001-S5 emptying both inputs after 10-20 shows all 4 products and drops both keys from the URL', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));

    await applyRange(u, '', '');

    await waitTitles(prices(5, 10, 20, 30));
    expect(currentUrl()).toBe('/');
    expect(lastRequest().has('minPrice')).toBe(false);
    expect(lastRequest().has('maxPrice')).toBe(false);
  });

  it('PROD-001-S6 " 10 " and " 20 " are trimmed: no message, 10.00 and 20.00 shown, URL minPrice=10&maxPrice=20', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, ' 10 ', ' 20 ');

    await waitTitles(prices(10, 20));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    expect(messageOf(minInput())).toBeNull();
    expect(messageOf(maxInput())).toBeNull();
  });

  it('PROD-001-S8 a minimum equal to the maximum (20 and 20) is valid and shows exactly the 20.00 product', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '20', '20');

    await waitTitles(prices(20));
    expect(messageOf(minInput())).toBeNull();
  });

  it('PROD-001-S11 applying 20-30 before the 10-20 results arrive ends on the 20-30 results, never the older ones', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));
    const slow = server.hold((p) => p.get('minPrice') === '10');

    await applyRange(u, '10', '20');
    await applyRange(u, '20', '30');
    await waitTitles(prices(20, 30));
    await act(async () => slow.release());
    await settle();

    expect(titles()).toEqual(prices(20, 30));
    expect(currentUrl()).toBe('/?minPrice=20&maxPrice=30');
    expect(minInput().value).toBe('20');
    expect(maxInput().value).toBe('30');
  });
});

describe('PROD-002: range with keyword, sort, pages and URL state', () => {
  const phones = () => [
    item(1, 50, 'Phone A'),
    item(2, 150, 'Phone B'),
    item(3, 300, 'Phone C'),
    item(4, 600, 'Phone D'),
    item(5, 200, 'Lamp'),
  ];

  it('PROD-002-S1 keyword phone + 100-500, then price descending: Phone C then Phone B, total 2, URL keeps q and the range', async () => {
    const u = user();
    renderList('/', phones());
    await waitFor(() => expect(titles()).toHaveLength(5));

    await u.type(keywordInput(), 'phone');
    await applyRange(u, '100', '500');
    await waitTitles(['Phone B', 'Phone C']);
    const [fieldSelect, orderSelect] = screen.getAllByRole('combobox');
    await u.selectOptions(fieldSelect as HTMLElement, 'price');
    await u.selectOptions(orderSelect as HTMLElement, 'desc');

    await waitTitles(['Phone C', 'Phone B']);
    expect(shownLines()).toContain('Hiển thị 1-2 trong 2 sản phẩm');
    expect(currentUrl()).toBe('/products/search?q=phone&minPrice=100&maxPrice=500&sortBy=price&order=desc');
  });

  it('PROD-002-S2 page 2 of 15 products in the range shows the other 5 and "Hiển thị 11-15 trong 15 sản phẩm", 2 pages', async () => {
    const u = user();
    const inRange = Array.from({ length: 15 }, (_, i) => item(i + 1, 15, `R-${String(i + 1).padStart(2, '0')}`));
    renderList('/?minPrice=10&maxPrice=20', [...inRange, item(16, 1), item(17, 99)]);
    await waitFor(() => expect(titles()).toHaveLength(10));
    expect(screen.queryByRole('button', { name: '3' })).toBeNull();

    await u.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(titles()).toHaveLength(5));
    expect(titles()).toEqual(['R-11', 'R-12', 'R-13', 'R-14', 'R-15']);
    expect(shownLines()).toContain('Hiển thị 11-15 trong 15 sản phẩm');
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20&page=2');
  });

  it('PROD-002-S3 changing the sort on page 2 keeps 10-20, goes to page 1 and drops page from the URL', async () => {
    const u = user();
    const inRange = Array.from({ length: 15 }, (_, i) => item(i + 1, 15, `R-${String(i + 1).padStart(2, '0')}`));
    renderList('/?minPrice=10&maxPrice=20&page=2', [...inRange, item(16, 1)]);
    await waitFor(() => expect(titles()).toHaveLength(5));

    await u.selectOptions(screen.getAllByRole('combobox')[0] as HTMLElement, 'price');

    await waitFor(() => expect(titles()).toHaveLength(10));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20&sortBy=price&order=asc');
    expect(lastRequest().get('minPrice')).toBe('10');
    expect(lastRequest().get('skip')).toBe('0');
  });

  it('PROD-002-S3 changing the page keeps the range and the other keys', async () => {
    const u = user();
    const inRange = Array.from({ length: 15 }, (_, i) => item(i + 1, 15, `R-${String(i + 1).padStart(2, '0')}`));
    renderList('/?minPrice=10&maxPrice=20&sortBy=price&order=desc', inRange);
    await waitFor(() => expect(titles()).toHaveLength(10));

    await u.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(titles()).toHaveLength(5));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20&page=2&sortBy=price&order=desc');
    await u.click(screen.getByRole('button', { name: '1' }));
    await waitFor(() => expect(titles()).toHaveLength(10));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20&sortBy=price&order=desc'); // page 1 is not written
  });

  it('PROD-002-S4 /?minPrice=abc&maxPrice=20: minimum input empty, maximum shows 20, no message, 5.00 10.00 20.00 listed', async () => {
    renderList('/?minPrice=abc&maxPrice=20', fixture());

    await waitTitles(prices(5, 10, 20));

    expect(minInput().value).toBe('');
    expect(maxInput().value).toBe('20');
    expect(messageOf(minInput())).toBeNull();
    expect(screen.queryByText(NOT_A_NUMBER)).toBeNull();
    expect(lastRequest().has('minPrice')).toBe(false);
  });

  it('PROD-002-S4 /?minPrice=30&maxPrice=10 (both valid, min > max): both inputs empty, no message, all 4 listed', async () => {
    renderList('/?minPrice=30&maxPrice=10', fixture());

    await waitTitles(prices(5, 10, 20, 30));

    expect(minInput().value).toBe('');
    expect(maxInput().value).toBe('');
    expect(screen.queryByText(MIN_GT_MAX)).toBeNull();
    expect(lastRequest().has('minPrice')).toBe(false);
    expect(lastRequest().has('maxPrice')).toBe(false);
  });

  it('PROD-002-S4 a repeated minPrice and a negative maximum in the URL are ignored like an invalid sortBy', async () => {
    renderList('/?minPrice=10&minPrice=20&maxPrice=-1', fixture());

    await waitTitles(prices(5, 10, 20, 30));

    expect(minInput().value).toBe('');
    expect(maxInput().value).toBe('');
  });

  it('PROD-002-S5 exactly 10 products in the range: 1 page, "Hiển thị 1-10 trong 10 sản phẩm"; with 11, page 2 reads "Hiển thị 11-11 trong 11 sản phẩm"', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => item(i + 1, 15, `R-${String(i + 1).padStart(2, '0')}`));
    renderList('/?minPrice=10&maxPrice=20', [...ten, item(50, 1)]);
    await waitFor(() => expect(titles()).toHaveLength(10));
    expect(shownLines()).toContain('Hiển thị 1-10 trong 10 sản phẩm');
    expect(screen.queryByRole('button', { name: '2' })).toBeNull();
    cleanup();

    renderList('/?minPrice=10&maxPrice=20&page=2', [...ten, item(11, 15, 'R-11'), item(50, 1)]);
    await waitFor(() => expect(titles()).toEqual(['R-11']));
    expect(shownLines()).toContain('Hiển thị 11-11 trong 11 sản phẩm');
  });

  it('PROD-002-S6 page 5 of a 2-page range shows the empty state and hides pagination', async () => {
    const inRange = Array.from({ length: 15 }, (_, i) => item(i + 1, 15));
    renderList('/?minPrice=10&maxPrice=20&page=5', inRange);

    await screen.findByText(EMPTY_TITLE);

    expect(screen.getByText(EMPTY_DESCRIPTION)).toBeTruthy();
    expect(paginationHidden()).toBe(true);
  });

  it('PROD-002-S6 recovery: "Xoá bộ lọc" brings the list back', async () => {
    const u = user();
    const inRange = Array.from({ length: 15 }, (_, i) => item(i + 1, 15));
    renderList('/?minPrice=10&maxPrice=20&page=5', inRange);
    await screen.findByText(EMPTY_TITLE);

    await u.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    await waitFor(() => expect(titles()).toHaveLength(10));
    expect(currentUrl()).toBe('/');
  });

  it('PROD-002-S7 a range alone keeps the path "/": URL /?minPrice=10&maxPrice=20', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '10', '20');

    await waitTitles(prices(10, 20));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    expect(currentUrl().startsWith('/products/search')).toBe(false);
  });

  it('PROD-002-S8 range 1000-2000 with no product: empty state text, "Xoá bộ lọc", pagination hidden, typed values stay', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '1000', '2000');

    await screen.findByText(EMPTY_TITLE);
    expect(screen.getByText(EMPTY_DESCRIPTION)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá từ khoá' })).toBeNull();
    expect(paginationHidden()).toBe(true);
    expect(minInput().value).toBe('1000');
    expect(maxInput().value).toBe('2000');
  });

  it('PROD-002-S8 the same empty state appears when a keyword is also applied', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await u.type(keywordInput(), 'P-');
    await applyRange(u, '1000', '2000');

    await screen.findByText(EMPTY_TITLE);
    expect(screen.getByText(EMPTY_DESCRIPTION)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('PROD-002-S9 keyword "zzzz" with no range shows the common description and "Xoá bộ lọc", not the keyword one', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await u.type(keywordInput(), 'zzzz');
    await u.click(searchButton());

    await screen.findByText(EMPTY_TITLE);
    expect(screen.getByText(EMPTY_DESCRIPTION)).toBeTruthy();
    expect(screen.queryByText(/Không có kết quả cho từ khoá/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('PROD-002-S10 "Xoá bộ lọc" empties keyword and both prices, keeps the sort, path "/"', async () => {
    const u = user();
    renderList('/products/search?q=phone&minPrice=1000&maxPrice=2000&sortBy=price&order=desc', [
      item(1, 50, 'Phone A'),
      item(2, 300, 'Phone B'),
      item(3, 20, 'Lamp'),
    ]);
    await screen.findByText(EMPTY_TITLE);

    await u.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    await waitTitles(['Phone B', 'Phone A', 'Lamp']); // every product, price descending
    expect(currentUrl()).toBe('/?sortBy=price&order=desc');
    expect(keywordInput().value).toBe('');
    expect(minInput().value).toBe('');
    expect(maxInput().value).toBe('');
  });

  it('PROD-002-S12 typed-but-not-applied 30-40 is discarded when the sort changes: inputs show 10 and 20 again, list still 10-20', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    await typeInto(u, minInput(), '30');
    await typeInto(u, maxInput(), '40');

    await u.selectOptions(screen.getAllByRole('combobox')[1] as HTMLElement, 'desc');

    await waitTitles(prices(20, 10)); // title descending, still only the 10.00 and 20.00 products
    expect(minInput().value).toBe('10');
    expect(maxInput().value).toBe('20');
    expect(lastRequest().get('minPrice')).toBe('10');
    expect(lastRequest().get('maxPrice')).toBe('20');
  });

  it('PROD-002-S12 typed-but-not-applied values are also discarded when the page changes', async () => {
    const u = user();
    const inRange = Array.from({ length: 15 }, (_, i) => item(i + 1, 15));
    renderList('/?minPrice=10&maxPrice=20', inRange);
    await waitFor(() => expect(titles()).toHaveLength(10));
    await typeInto(u, minInput(), '30');
    await typeInto(u, maxInput(), '40');

    await u.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(titles()).toHaveLength(5));
    expect(minInput().value).toBe('10');
    expect(maxInput().value).toBe('20');
  });

  it('PROD-002-S13 Back after 10-20 then 30-40 returns to 10-20 (URL, list, inputs), Back again to the unfiltered list', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));
    await applyRange(u, '10', '20');
    await waitTitles(prices(10, 20));
    await applyRange(u, '30', '40');
    await waitTitles(prices(30));

    await act(async () => nav.back());

    await waitTitles(prices(10, 20));
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    expect(minInput().value).toBe('10');
    expect(maxInput().value).toBe('20');

    await act(async () => nav.back());

    await waitTitles(prices(5, 10, 20, 30));
    expect(currentUrl()).toBe('/');
  });

  describe('PROD-002-S14 failure that is not a 400', () => {
  it.each<[string, (s: Server) => void]>([
    ['a 5xx', (s) => s.fail((p) => p.get('minPrice') === '10', 500, { message: 'boom' })],
    ['a network error', (s) => s.networkDown((p) => p.get('minPrice') === '10')],
  ])('PROD-002-S14 %s while applying 10-20 shows the list-load error state; URL keeps the range; "Thử lại" reuses it', async (_n, breakIt) => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));
    breakIt(server);

    await applyRange(u, '10', '20');

    await screen.findByText(LOAD_ERROR_TITLE);
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    server.clearHooks();
    const before = server.requests.length;
    await u.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitTitles(prices(10, 20));
    expect(server.requests.length).toBeGreaterThan(before);
    expect(lastRequest().get('minPrice')).toBe('10');
    expect(lastRequest().get('maxPrice')).toBe('20');
  });
  });

  it('PROD-002-S15 applying 30-40 from page 3 of 10-20 shows page 1 of 30-40 and the URL has no page', async () => {
    const u = user();
    const inRange = Array.from({ length: 25 }, (_, i) => item(i + 1, 15));
    renderList('/?minPrice=10&maxPrice=20&page=3', [...inRange, item(100, 35, 'Target')]);
    await waitFor(() => expect(titles()).toHaveLength(5));

    await applyRange(u, '30', '40');

    await waitTitles(['Target']);
    expect(currentUrl()).toBe('/?minPrice=30&maxPrice=40');
    expect(lastRequest().get('skip')).toBe('0');
  });

  it('PROD-002-S16 while 30-40 loads the 10-20 results stay and no skeleton shows; then the 30-40 results appear', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', [...fixture(), item(5, 35, 'P-035.00')]);
    await waitTitles(prices(10, 20));
    const slow = server.hold((p) => p.get('minPrice') === '30');

    await applyRange(u, '30', '40');
    await waitFor(() => expect(currentUrl()).toBe('/?minPrice=30&maxPrice=40'));
    await settle();

    expect(titles()).toEqual(prices(10, 20));
    expect(skeletons()).toBe(0);
    await act(async () => slow.release());
    await waitTitles(['P-030.00', 'P-035.00']);
  });

  it('PROD-002-S16 the very first load, with no previous results, shows the loading skeleton', async () => {
    let slow: { release: () => void } | undefined;
    renderList('/', fixture(), (s) => {
      slow = s.hold(() => true);
    });
    await settle();

    expect(skeletons()).toBeGreaterThan(0);
    await act(async () => slow?.release());
    await waitTitles(prices(5, 10, 20, 30));
    expect(skeletons()).toBe(0);
  });
});

describe('PROD-003: validation messages in the search form', () => {
  async function openWith10to20() {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    return u;
  }

  it('PROD-003-S4 "-5" and "10.123": no request, URL unchanged, each message under its input, values and list kept', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '-5', '10.123');

    expect(messageOf(minInput())).toBe(NEGATIVE);
    expect(messageOf(maxInput())).toBe(DECIMALS);
    expect(server.requests.length).toBe(before);
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    expect(minInput().value).toBe('-5');
    expect(maxInput().value).toBe('10.123');
    expect(titles()).toEqual(prices(10, 20));
  });

  describe('PROD-003-S5 non-numeric minimum', () => {
  it.each([['abc'], ['10,5'], ['1e3'], ['+5'], ['.5'], ['5.'], ['1,000']])(
    'PROD-003-S5 minimum "%s": "Giá phải là số" under the minimum, no request',
    async (value) => {
      const u = await openWith10to20();
      const before = server.requests.length;

      await applyRange(u, value, '');

      expect(messageOf(minInput())).toBe(NOT_A_NUMBER);
      expect(server.requests.length).toBe(before);
      expect(minInput().value).toBe(value);
    },
  );
  });

  it('PROD-003-S8 "0" and "99999999.99" are accepted: no message, all 4 products, URL minPrice=0&maxPrice=99999999.99', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '0', '99999999.99');

    await waitTitles(prices(5, 10, 20, 30));
    expect(currentUrl()).toBe('/?minPrice=0&maxPrice=99999999.99');
    expect(messageOf(minInput())).toBeNull();
    expect(messageOf(maxInput())).toBeNull();
  });

  it('PROD-003-S9 a maximum of 100000000: "Giá không được lớn hơn $99,999,999.99" under the maximum, no request', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '', '100000000');

    expect(messageOf(maxInput())).toBe(TOO_BIG);
    expect(messageOf(minInput())).toBeNull();
    expect(server.requests.length).toBe(before);
  });

  it('PROD-003-S10 "-0.01" gives "Giá không được âm" and no request; replacing it with "0" is accepted', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '-0.01', '');
    expect(messageOf(minInput())).toBe(NEGATIVE);
    expect(server.requests.length).toBe(before);

    await typeInto(u, minInput(), '0');
    await u.click(searchButton());

    await waitFor(() => expect(currentUrl()).toBe('/?minPrice=0'));
    expect(messageOf(minInput())).toBeNull();
  });

  it('PROD-003-S14 a 30-digit maximum is "too large" in the UI: message, no request, no crash', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '', '123456789012345678901234567890');

    expect(messageOf(maxInput())).toBe(TOO_BIG);
    expect(server.requests.length).toBe(before);
  });

  it('PROD-003-S15 minimum 30 with maximum 10: message under the minimum, URL unchanged, 10-20 list kept, no empty state', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '30', '10');

    expect(messageOf(minInput())).toBe(MIN_GT_MAX);
    expect(messageOf(maxInput())).toBeNull();
    expect(server.requests.length).toBe(before);
    expect(currentUrl()).toBe('/?minPrice=10&maxPrice=20');
    expect(titles()).toEqual(prices(10, 20));
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull();
  });

  it('PROD-003-S17 min "30,5" with max 10: only "Giá phải là số" under the minimum; no min > max message', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '30,5', '10');

    expect(messageOf(minInput())).toBe(NOT_A_NUMBER);
    expect(messageOf(maxInput())).toBeNull();
    expect(screen.queryByText(MIN_GT_MAX)).toBeNull();
    expect(server.requests.length).toBe(before);
  });

  it('PROD-003-S18 "010" and "20.00" are valid: 10.00 and 20.00 shown, URL keeps the typed strings', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, '010', '20.00');

    await waitTitles(prices(10, 20));
    expect(currentUrl()).toBe('/?minPrice=010&maxPrice=20.00');
    expect(messageOf(minInput())).toBeNull();
    expect(minInput().value).toBe('010');
    expect(maxInput().value).toBe('20.00');
  });

  it('PROD-003-S19 "-0" is rejected with "Giá không được âm" under the minimum, no request', async () => {
    const u = await openWith10to20();
    const before = server.requests.length;

    await applyRange(u, '-0', '');

    expect(messageOf(minInput())).toBe(NEGATIVE);
    expect(server.requests.length).toBe(before);
  });

  it('PROD-003-S22 typing one character in the minimum removes only its message; the maximum message stays; nothing is sent', async () => {
    const u = await openWith10to20();
    await applyRange(u, '-1', 'abc');
    expect(messageOf(minInput())).toBe(NEGATIVE);
    expect(messageOf(maxInput())).toBe(NOT_A_NUMBER);
    const before = server.requests.length;

    await u.type(minInput(), '2');

    expect(messageOf(minInput())).toBeNull();
    expect(minInput().hasAttribute('aria-invalid')).toBe(false);
    expect(messageOf(maxInput())).toBe(NOT_A_NUMBER);
    expect(server.requests.length).toBe(before);
  });

  it('PROD-003-S22 pressing Search again after the edit runs the checks again', async () => {
    const u = await openWith10to20();
    await applyRange(u, '-1', 'abc');
    await u.type(minInput(), 'x'); // "-1x"

    await u.click(searchButton());

    expect(messageOf(minInput())).toBe(NEGATIVE); // starts with a minus sign and a number
    expect(messageOf(maxInput())).toBe(NOT_A_NUMBER);
  });

  it('PROD-003-S22 the min > max message disappears when the maximum (either input) is edited', async () => {
    const u = await openWith10to20();
    await applyRange(u, '30', '10');
    expect(messageOf(minInput())).toBe(MIN_GT_MAX);

    await u.type(maxInput(), '0');

    expect(messageOf(minInput())).toBeNull();
    expect(screen.queryByText(MIN_GT_MAX)).toBeNull();
  });

  it('PROD-003-S22 every message disappears when the applied URL changes (here: a sort change)', async () => {
    const u = await openWith10to20();
    await applyRange(u, 'abc', '');
    expect(messageOf(minInput())).toBe(NOT_A_NUMBER);

    await u.selectOptions(screen.getAllByRole('combobox')[1] as HTMLElement, 'desc');

    await waitFor(() => expect(currentUrl()).toContain('order=desc'));
    expect(messageOf(minInput())).toBeNull();
    expect(screen.queryByText(NOT_A_NUMBER)).toBeNull();
  });

  it('PROD-003-S23 "abc" in the minimum: aria-invalid="true" and aria-describedby on the "Giá phải là số" element; after an edit neither remains', async () => {
    const u = user();
    renderList('/', fixture());
    await waitTitles(prices(5, 10, 20, 30));

    await applyRange(u, 'abc', '');

    expect(minInput().getAttribute('aria-invalid')).toBe('true');
    const id = minInput().getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe(NOT_A_NUMBER);
    expect(maxInput().hasAttribute('aria-invalid')).toBe(false);
    expect(maxInput().hasAttribute('aria-describedby')).toBe(false);

    await u.type(minInput(), '1');

    expect(screen.queryByText(NOT_A_NUMBER)).toBeNull();
    expect(minInput().hasAttribute('aria-invalid')).toBe(false);
    expect(minInput().hasAttribute('aria-describedby')).toBe(false);
  });

  it('PROD-003-S23 each price input is reachable through its label: text input, decimal keypad, no placeholder', () => {
    renderList('/', fixture());

    for (const input of [minInput(), maxInput()]) {
      expect(input.getAttribute('type')).toBe('text');
      expect(input.getAttribute('inputmode')).toBe('decimal');
      expect(input.getAttribute('placeholder') ?? '').toBe('');
    }
  });
});

describe('PROD-003: HTTP 400 the UI let through', () => {
  const rejectMin = (s: Server, errors: Record<string, string>) =>
    s.fail((p) => p.get('minPrice') === '7', 400, {
      statusCode: 400,
      message: Object.values(errors),
      error: 'Bad Request',
      errors,
    });

  it('PROD-003-S13 a 400 with errors.minPrice: the message under the minimum, no list-load error, 10-20 results and typed values kept', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    rejectMin(server, { minPrice: 'Giá không hợp lệ từ máy chủ' });

    await applyRange(u, '7', '20');

    await waitFor(() => expect(messageOf(minInput())).toBe('Giá không hợp lệ từ máy chủ'));
    expect(screen.queryByText(LOAD_ERROR_TITLE)).toBeNull();
    expect(titles()).toEqual(prices(10, 20));
    expect(minInput().value).toBe('7');
    expect(maxInput().value).toBe('20');
    expect(messageOf(maxInput())).toBeNull();
  });

  it('PROD-003-S13 the server message goes away when either input is edited', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    rejectMin(server, { minPrice: 'Giá không hợp lệ từ máy chủ' });
    await applyRange(u, '7', '20');
    await waitFor(() => expect(messageOf(minInput())).toBe('Giá không hợp lệ từ máy chủ'));

    await u.type(maxInput(), '5');

    expect(messageOf(minInput())).toBeNull();
    expect(screen.queryByText('Giá không hợp lệ từ máy chủ')).toBeNull();
  });

  it('PROD-003-S21 a 400 with errors.maxPrice: the message under the maximum, nothing under the minimum, 10-20 kept, no error state', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    server.fail((p) => p.get('maxPrice') === '25', 400, {
      statusCode: 400,
      message: ['Giá tối đa bị từ chối'],
      error: 'Bad Request',
      errors: { maxPrice: 'Giá tối đa bị từ chối' },
    });

    await applyRange(u, '10', '25');

    await waitFor(() => expect(messageOf(maxInput())).toBe('Giá tối đa bị từ chối'));
    expect(messageOf(minInput())).toBeNull();
    expect(minInput().hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByText(LOAD_ERROR_TITLE)).toBeNull();
    expect(titles()).toEqual(prices(10, 20));
  });

  it('PROD-003-S21 a 400 naming both bounds shows each message under its own input', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    rejectMin(server, { minPrice: 'Lỗi tối thiểu', maxPrice: 'Lỗi tối đa' });

    await applyRange(u, '7', '20');

    await waitFor(() => expect(messageOf(minInput())).toBe('Lỗi tối thiểu'));
    expect(messageOf(maxInput())).toBe('Lỗi tối đa');
  });

  it('PROD-003-S13 a 5xx is not a field error: it shows the list-load error state and no message under the inputs', async () => {
    const u = user();
    renderList('/?minPrice=10&maxPrice=20', fixture());
    await waitTitles(prices(10, 20));
    server.fail((p) => p.get('minPrice') === '7', 503, { message: 'down', errors: { minPrice: 'ignored' } });

    await applyRange(u, '7', '20');

    await screen.findByText(LOAD_ERROR_TITLE);
    expect(messageOf(minInput())).toBeNull();
  });
});
