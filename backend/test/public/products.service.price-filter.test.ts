import 'reflect-metadata';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { fakeRedis, makeService } from './products.fakes';
import { MemProduct, memRepo } from './products.memrepo';

// Redis off: every call goes to the repo, so these tests are about filtering, not caching
const serviceOver = (rows: MemProduct[]) =>
  makeService({}, fakeRedis({ isReady: false }), memRepo(rows));

const query = (q: Partial<QueryProductDto>) => ({ skip: 0, order: 'asc', ...q }) as QueryProductDto;

const priced = (...prices: number[]): MemProduct[] =>
  prices.map((price, i) => ({ id: i + 1, title: `Item ${i + 1}`, description: 'plain', price }));

const pricesOf = (res: { data: { products: unknown[] } }) =>
  (res.data.products as MemProduct[]).map((p) => p.price);

describe('ProductsService.findAll price range', () => {
  const rows = priced(5, 10, 20, 30);

  it('includes both ends: 10..20 returns exactly the 10 and 20 products, total 2 (bug: > / < instead of >= / <=)', async () => {
    const res = await serviceOver(rows).findAll(query({ minPrice: 10, maxPrice: 20 }));

    expect(pricesOf(res)).toEqual([10, 20]);
    expect(res.data.total).toBe(2);
    expect(Object.keys(res.data).sort()).toEqual(['limit', 'products', 'skip', 'total']);
  });

  it('minPrice alone has no upper bound (bug: undefined maxPrice treated as 0)', async () => {
    const res = await serviceOver(rows).findAll(query({ minPrice: 20 }));
    expect(pricesOf(res)).toEqual([20, 30]);
    expect(res.data.total).toBe(2);
  });

  it('maxPrice alone has no lower bound (bug: filter only applied when both are given)', async () => {
    const res = await serviceOver(rows).findAll(query({ maxPrice: 10 }));
    expect(pricesOf(res)).toEqual([5, 10]);
    expect(res.data.total).toBe(2);
  });

  it('minPrice equal to maxPrice returns only that exact price (bug: strict inequality)', async () => {
    const res = await serviceOver(rows).findAll(query({ minPrice: 10, maxPrice: 10 }));
    expect(pricesOf(res)).toEqual([10]);
    expect(res.data.total).toBe(1);
  });

  it('maxPrice 0 still filters as a bound, not "no filter" (bug: if (maxPrice) treats 0 as absent)', async () => {
    const res = await serviceOver(rows).findAll(query({ maxPrice: 0 }));
    expect(pricesOf(res)).toEqual([]);
    expect(res.data.total).toBe(0);
  });

  it('without minPrice/maxPrice every product is returned (regression)', async () => {
    const res = await serviceOver(rows).findAll(query({}));
    expect(pricesOf(res)).toEqual([5, 10, 20, 30]);
    expect(res.data.total).toBe(4);
  });

  it('keeps decimals exact: 9.99 is inside [9.99, 9.99] and outside max 9.98 (bug: rounding / int cast)', async () => {
    const svc = serviceOver(priced(9.99, 10));
    expect(pricesOf(await svc.findAll(query({ minPrice: 9.99, maxPrice: 9.99 })))).toEqual([9.99]);
    expect(pricesOf(await svc.findAll(query({ maxPrice: 9.98 })))).toEqual([]);
  });

  it('no match gives an empty page with total 0 and still echoes skip and limit', async () => {
    const res = await serviceOver(rows).findAll(query({ minPrice: 1000, limit: 5 }));
    expect(res.data).toEqual({ products: [], total: 0, skip: 0, limit: 5 });
  });
});

describe('ProductsService.findAll price range together with q', () => {
  const phones: MemProduct[] = [
    { id: 1, title: 'Phone A', description: 'a device', price: 100 },
    { id: 2, title: 'Phone B', description: 'a device', price: 500 },
    { id: 3, title: 'Case', description: 'protects', price: 100 },
    { id: 4, title: 'Charger', description: 'works with any phone', price: 900 },
  ];

  it('q=phone&maxPrice=200 returns only Phone A: the range holds on the title AND description branch (bug: range only on one OR branch)', async () => {
    const res = await serviceOver(phones).findAll(query({ q: 'phone', maxPrice: 200 }));

    expect((res.data.products as MemProduct[]).map((p) => p.title)).toEqual(['Phone A']);
    expect(res.data.total).toBe(1);
  });

  it('q=phone&minPrice=400 returns Phone B and the description match, not Phone A (bug: range only on the description branch)', async () => {
    const res = await serviceOver(phones).findAll(query({ q: 'phone', minPrice: 400 }));

    expect((res.data.products as MemProduct[]).map((p) => p.title)).toEqual(['Phone B', 'Charger']);
    expect(res.data.total).toBe(2);
  });
});

describe('ProductsService.findAll price range with sort and pagination', () => {
  it('minPrice=10 sorted by price desc, limit 1 skip 1 returns the 20 product, total 3 (bug: total counted before the filter)', async () => {
    const res = await serviceOver(priced(5, 10, 20, 30)).findAll(
      query({ minPrice: 10, sortBy: 'price', order: 'desc', limit: 1, skip: 1 }),
    );

    expect(pricesOf(res)).toEqual([20]);
    expect(res.data.total).toBe(3);
  });

  it('property: result equals filter(q AND range) -> sort -> slice, total is the filtered count', async () => {
    const word = fc.constantFrom('phone', 'case', 'cable');
    const rowArb = fc.record({
      title: word,
      description: word,
      price: fc.constantFrom(0, 5, 9.99, 10, 20, 30),
    });
    await fc.assert(
      fc.asyncProperty(
        fc.array(rowArb, { maxLength: 12 }),
        fc.constantFrom(undefined, 'phone', 'PHONE', 'cable'),
        fc.constantFrom(undefined, 0, 9.99, 10, 20),
        fc.constantFrom(undefined, 0, 10, 20, 30),
        fc.constantFrom(undefined, 'price' as const),
        fc.constantFrom('asc' as const, 'desc' as const),
        fc.constantFrom(undefined, 1, 2, 3),
        fc.constantFrom(0, 1, 2),
        async (raw, q, minPrice, maxPrice, sortBy, order, limit, skip) => {
          fc.pre(minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice);
          const rows: MemProduct[] = raw.map((r, i) => ({ id: i + 1, ...r }));

          // hand-written model of the expected behaviour
          const matching = rows.filter(
            (r) =>
              (q === undefined ||
                r.title.toLowerCase().includes(q.toLowerCase()) ||
                r.description.toLowerCase().includes(q.toLowerCase())) &&
              (minPrice === undefined || r.price >= minPrice) &&
              (maxPrice === undefined || r.price <= maxPrice),
          );
          const dir = order === 'asc' ? 1 : -1;
          const sorted = [...matching].sort((a, b) =>
            sortBy === 'price' && a.price !== b.price
              ? (a.price - b.price) * dir
              : sortBy === 'price'
                ? a.id - b.id
                : (a.id - b.id) * dir,
          );
          const expected = sorted.slice(skip, limit === undefined ? undefined : skip + limit);

          const res = await serviceOver(rows).findAll(
            { q, minPrice, maxPrice, sortBy, order, limit, skip } as QueryProductDto,
          );

          expect((res.data.products as MemProduct[]).map((p) => p.id)).toEqual(expected.map((p) => p.id));
          expect(res.data.total).toBe(matching.length);
        },
      ),
    );
  });
});
