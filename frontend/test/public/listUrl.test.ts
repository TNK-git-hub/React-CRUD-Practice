import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildListUrl, readListParams } from '../../src/utils/listUrl';

function params(qs: string) {
  const sp = new URLSearchParams(qs);
  return { get: (k: string) => sp.get(k), getAll: (k: string) => sp.getAll(k) };
}

describe('buildListUrl', () => {
  it('PROD-001-S1 writes keys in the order q, minPrice, maxPrice, page, sortBy, order and uses /products/search with a keyword', () => {
    const url = buildListUrl(params(''), {
      order: 'desc',
      sortBy: 'price',
      page: 2,
      maxPrice: '20',
      minPrice: '10',
      q: 'phone',
    });
    expect(url).toBe('/products/search?q=phone&minPrice=10&maxPrice=20&page=2&sortBy=price&order=desc');
  });

  it('PROD-002-S3 without a keyword the path is / and a range alone is kept', () => {
    expect(buildListUrl(params(''), { minPrice: '10' })).toBe('/?minPrice=10');
    expect(buildListUrl(params(''), {})).toBe('/');
  });

  it('PROD-002-S4 empty, null and undefined changes remove the key; page=1 is never written', () => {
    const cur = params('q=a&minPrice=5&maxPrice=9&page=3&sortBy=price&order=desc');
    expect(buildListUrl(cur, { minPrice: '', maxPrice: null, page: 1, q: undefined })).toBe(
      '/?sortBy=price&order=desc',
    );
    expect(buildListUrl(cur, { page: '1' })).toBe('/products/search?q=a&minPrice=5&maxPrice=9&sortBy=price&order=desc');
  });

  it('PROD-002-S7 keys not in changes are kept from the current URL', () => {
    const cur = params('minPrice=5&maxPrice=9&sortBy=price');
    expect(buildListUrl(cur, { page: 2 })).toBe('/?minPrice=5&maxPrice=9&page=2&sortBy=price');
  });

  it('PROD-002-S10 never writes page=1 or an empty value (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '1', '2', '10'),
        fc.constantFrom('', '5', '0.5'),
        fc.constantFrom('', 'x'),
        (page, min, q) => {
          const url = buildListUrl(params(''), { page, minPrice: min, q });
          expect(url).not.toMatch(/page=1(&|$)/);
          expect(url).not.toMatch(/=(&|$)/);
        },
      ),
    );
  });
});

describe('readListParams', () => {
  it('PROD-001-S2 reads keyword, page, sort and a valid range', () => {
    expect(readListParams(params('q=a&minPrice=10&maxPrice=20&page=3&sortBy=price&order=desc'))).toEqual({
      query: 'a',
      page: 3,
      sortBy: 'price',
      order: 'desc',
      minPrice: '10',
      maxPrice: '20',
    });
  });

  it('PROD-002-S12 defaults: page 1, sort title asc, empty range', () => {
    expect(readListParams(params('sortBy=bogus&order=up'))).toEqual({
      query: '',
      page: 1,
      sortBy: 'title',
      order: 'asc',
      minPrice: '',
      maxPrice: '',
    });
  });

  it('PROD-002-S15 an invalid side is ignored and the valid side stays', () => {
    const r = readListParams(params('minPrice=abc&maxPrice=20'));
    expect(r.minPrice).toBe('');
    expect(r.maxPrice).toBe('20');
    expect(readListParams(params('minPrice=10&maxPrice=-1')).maxPrice).toBe('');
  });

  it('PROD-002-S15 both sides are ignored when each is valid but min > max', () => {
    const r = readListParams(params('minPrice=30&maxPrice=10'));
    expect(r.minPrice).toBe('');
    expect(r.maxPrice).toBe('');
  });

  it('PROD-002-S15 a repeated key is ignored', () => {
    const r = readListParams(params('minPrice=10&minPrice=20&maxPrice=50'));
    expect(r.minPrice).toBe('');
    expect(r.maxPrice).toBe('50');
  });

  it('PROD-001-S5 values are trimmed strings kept as typed (010, 20.00)', () => {
    const r = readListParams(params('minPrice=%20010&maxPrice=20.00'));
    expect(r.minPrice).toBe('010');
    expect(r.maxPrice).toBe('20.00');
  });
});
