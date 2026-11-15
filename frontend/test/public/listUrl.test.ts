import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as listUrl from '../../src/utils/listUrl';

// SPEC_PROBLEM: tasks.md T006 does not fix the signatures. Assumed here, in the adapters below only:
//   buildListUrl(current: URLSearchParams, changes: Record<string, string | number | null>): string  (path + query)
//   readListParams(searchParams: URLSearchParams): object with q|query, page, sortBy, order, minPrice, maxPrice
//   (an ignored bound is '' or undefined).
type Changes = Record<string, string | number | null>;
const rawBuild: (current: URLSearchParams, changes: Changes) => unknown = listUrl.buildListUrl;
const rawRead: (sp: URLSearchParams) => unknown = listUrl.readListParams;

interface Built {
  url: string;
  path: string;
  keys: string[];
  get: (k: string) => string | null;
}

function build(current: string, changes: Changes): Built {
  const url = String(rawBuild(new URLSearchParams(current), changes));
  const [path, qs = ''] = url.split('?');
  const sp = new URLSearchParams(qs);
  return { url, path, keys: [...sp.keys()], get: (k) => sp.get(k) };
}

interface Read {
  q: string;
  page: number;
  sortBy: string;
  order: string;
  minPrice: string;
  maxPrice: string;
}

const field = (o: unknown, ...keys: string[]): unknown => {
  if (typeof o !== 'object' || o === null) return undefined;
  const rec = o as Record<string, unknown>;
  for (const k of keys) if (k in rec) return rec[k];
  return undefined;
};

function read(qs: string): Read {
  const r = rawRead(new URLSearchParams(qs));
  const rangeOf = (...keys: string[]) => {
    const v = field(r, ...keys) ?? field(field(r, 'range', 'price'), ...keys);
    return typeof v === 'string' ? v : '';
  };
  return {
    q: String(field(r, 'q', 'query') ?? ''),
    page: Number(field(r, 'page')),
    sortBy: String(field(r, 'sortBy')),
    order: String(field(r, 'order')),
    minPrice: rangeOf('minPrice', 'min'),
    maxPrice: rangeOf('maxPrice', 'max'),
  };
}

describe('buildListUrl', () => {
  it('PROD-001-S1 writes minPrice and maxPrice, on the path "/"', () => {
    // Catches: the old key list dropping the new keys
    const b = build('', { minPrice: '10', maxPrice: '20' });

    expect(b.url).toBe('/?minPrice=10&maxPrice=20');
  });

  it('PROD-001-S2 only a minimum writes only minPrice', () => {
    // Catches: writing an empty maxPrice=
    const b = build('', { minPrice: '20', maxPrice: '' });

    expect(b.url).toBe('/?minPrice=20');
  });

  it('PROD-001-S3 only a maximum writes only maxPrice', () => {
    // Catches: writing an empty minPrice=
    const b = build('', { minPrice: null, maxPrice: '10' });

    expect(b.url).toBe('/?maxPrice=10');
  });

  it('PROD-001-S5 emptying both inputs removes both keys from a URL that had a range', () => {
    // Catches: stale keys kept
    const b = build('minPrice=10&maxPrice=20', { minPrice: '', maxPrice: null, page: null });

    expect(b.url).toBe('/');
  });

  it('PROD-003-S18 keeps the bound strings exactly as given ("010", "20.00")', () => {
    // Catches: normalisation of the typed value in the URL
    const b = build('', { minPrice: '010', maxPrice: '20.00' });

    expect(b.url).toBe('/?minPrice=010&maxPrice=20.00');
  });

  it('PROD-002-S3 changing the sort on page 2 keeps the range, sets the sort and drops page', () => {
    // Catches: the sort change losing the range, or keeping the page
    const b = build('minPrice=10&maxPrice=20&page=2', { sortBy: 'price', order: 'asc', page: null });

    expect(b.url).toBe('/?minPrice=10&maxPrice=20&sortBy=price&order=asc');
  });

  it('PROD-002-S12 a sort change depends only on the applied URL: typed-but-unapplied values cannot appear', () => {
    // Catches: form state leaking into the URL (the builder takes no form values)
    const b = build('minPrice=10&maxPrice=20', { sortBy: 'title', order: 'desc', page: null });

    expect(b.get('minPrice')).toBe('10');
    expect(b.get('maxPrice')).toBe('20');
  });

  it('PROD-002-S12 changing the page keeps every other applied key', () => {
    // Catches: page change dropping q or the range
    const b = build('q=phone&minPrice=10&maxPrice=20&sortBy=price&order=desc', { page: 3 });

    expect(b.path).toBe('/products/search');
    expect(b.url).toBe('/products/search?q=phone&minPrice=10&maxPrice=20&page=3&sortBy=price&order=desc');
  });

  it('PROD-002-S7 a range alone keeps the path "/"; a keyword switches to "/products/search"', () => {
    // Catches: the path changing because of the range
    expect(build('', { minPrice: '10', maxPrice: '20' }).path).toBe('/');
    expect(build('', { q: 'phone', minPrice: '10', maxPrice: '20' }).path).toBe('/products/search');
  });

  it('PROD-002-S10 clearing filters drops q, range and page, keeps sort, path "/"', () => {
    // Catches: minPrice kept, or the sort lost
    const b = build('q=phone&minPrice=1000&maxPrice=2000&page=2&sortBy=price&order=desc', {
      q: null,
      minPrice: null,
      maxPrice: null,
      page: null,
    });

    expect(b.url).toBe('/?sortBy=price&order=desc');
  });

  it('PROD-002-S15 applying a new range while on page 3 drops page', () => {
    // Catches: page kept after a new search
    const b = build('minPrice=10&maxPrice=20&page=3', { minPrice: '30', maxPrice: '40', page: null });

    expect(b.url).toBe('/?minPrice=30&maxPrice=40');
  });

  it('PROD-001-S11 the last applied range is what the final URL says (10-20 then 20-30)', () => {
    // Catches: the older range surviving a second apply
    const first = build('', { minPrice: '10', maxPrice: '20' });
    const second = build(first.url.split('?')[1] ?? '', { minPrice: '20', maxPrice: '30', page: null });

    expect(second.url).toBe('/?minPrice=20&maxPrice=30');
    const r = read(second.url.split('?')[1] ?? '');
    expect(r.minPrice).toBe('20');
    expect(r.maxPrice).toBe('30');
  });

  it('PROD-001-S1 keys come in the order q, minPrice, maxPrice, page, sortBy, order; page 1 and empty values are never written', () => {
    // Catches: wrong key order, page=1, empty values written
    const val = fc.option(fc.constantFrom('a', '10', '2.50'), { nil: null });
    fc.assert(
      fc.property(
        val,
        val,
        val,
        fc.option(fc.integer({ min: 1, max: 9 }), { nil: null }),
        fc.option(fc.constantFrom('title', 'price'), { nil: null }),
        fc.option(fc.constantFrom('asc', 'desc'), { nil: null }),
        (q, minPrice, maxPrice, page, sortBy, order) => {
          const b = build('', { order, sortBy, page, maxPrice, minPrice, q });

          const wanted = ['q', 'minPrice', 'maxPrice', 'page', 'sortBy', 'order'];
          const expected = [q, minPrice, maxPrice, page === 1 ? null : page, sortBy, order];
          expect(b.keys).toEqual(wanted.filter((_, i) => expected[i] !== null));
          expect(b.get('page')).not.toBe('1');
        },
      ),
    );
  });
});

describe('readListParams', () => {
  it('PROD-002-S4 an invalid minimum is ignored, the valid maximum still applies', () => {
    // Catches: junk "abc" passed down to the backend (400)
    const r = read('minPrice=abc&maxPrice=20');

    expect(r.minPrice).toBe('');
    expect(r.maxPrice).toBe('20');
  });

  it('PROD-002-S4 a valid minimum greater than the maximum ignores both', () => {
    // Catches: only one side dropped, or the pair passed on
    const r = read('minPrice=30&maxPrice=10');

    expect(r.minPrice).toBe('');
    expect(r.maxPrice).toBe('');
  });

  it('PROD-002-S4 a repeated key is ignored', () => {
    // Catches: first (or last) of the repeated values being used
    const r = read('minPrice=10&minPrice=20&maxPrice=50');

    expect(r.minPrice).toBe('');
    expect(r.maxPrice).toBe('50');
  });

  it('PROD-002-S4 negative, too many decimals and over-limit values are ignored', () => {
    // Catches: values failing a PROD-003 check reaching the list request
    for (const bad of ['-1', '10.123', '100000000', '1e3', '']) {
      const r = read(`minPrice=${bad}&maxPrice=5`);
      expect(r.minPrice).toBe('');
      expect(r.maxPrice).toBe('5');
    }
  });

  it('PROD-002-S4 valid values are read back as typed ("010", "20.00")', () => {
    // Catches: normalisation of values read from the URL
    const r = read('minPrice=010&maxPrice=20.00');

    expect(r.minPrice).toBe('010');
    expect(r.maxPrice).toBe('20.00');
  });

  it('PROD-002-S4 a valid pair is returned unchanged, and dropped entirely when min > max', () => {
    // Catches: string comparison of the bounds, or normalisation
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999 }), fc.integer({ min: 0, max: 9_999_999 }), (a, b) => {
        const lo = `${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
        const hi = `${Math.floor(b / 100)}.${String(b % 100).padStart(2, '0')}`;

        const r = read(`minPrice=${lo}&maxPrice=${hi}`);

        expect(r.minPrice).toBe(a > b ? '' : lo);
        expect(r.maxPrice).toBe(a > b ? '' : hi);
      }),
    );
  });

  it('PROD-002-S3 reads keyword, page, sort and range from the URL', () => {
    // Catches: a reader that forgets one of the keys
    const r = read('q=phone&minPrice=10&maxPrice=20&page=2&sortBy=price&order=desc');

    expect(r).toEqual({ q: 'phone', page: 2, sortBy: 'price', order: 'desc', minPrice: '10', maxPrice: '20' });
  });

  it('PROD-001-S1 / PROD-001-S5 / PROD-002-S3 what buildListUrl writes, readListParams reads back', () => {
    // Catches: encoding drift between writer and reader (special characters in q, page 1, empty range)
    const sorts = fc.constantFrom('title', 'price', 'rating', 'stock');
    const cents = fc.integer({ min: 0, max: 100_000 });
    const fmt = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim() !== ''),
        fc.option(fc.tuple(cents, cents), { nil: null }),
        fc.integer({ min: 1, max: 50 }),
        sorts,
        fc.constantFrom('asc', 'desc'),
        (q, range, page, sortBy, order) => {
          const [lo, hi] = range ? [Math.min(...range), Math.max(...range)] : [null, null];
          const b = build('', {
            q,
            minPrice: lo === null ? null : fmt(lo),
            maxPrice: hi === null ? null : fmt(hi),
            page,
            sortBy,
            order,
          });

          const r = read(b.url.split('?')[1] ?? '');

          expect(b.path).toBe('/products/search');
          expect(r).toEqual({
            q,
            page,
            sortBy,
            order,
            minPrice: lo === null ? '' : fmt(lo),
            maxPrice: hi === null ? '' : fmt(hi),
          });
        },
      ),
    );
  });

  it('PROD-001-S5 page 1 is never written and reads back as page 1', () => {
    // Catches: page=1 in the URL
    const b = build('page=3', { page: 1 });

    expect(b.url).toBe('/');
    expect(read('').page).toBe(1);
  });
});
