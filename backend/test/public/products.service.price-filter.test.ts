import 'reflect-metadata';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { inMemoryProducts, makeService, productRow } from './products.fakes';

// what the DTO hands to the service: defaults filled in
const query = (q: Record<string, unknown> = {}) =>
  ({ skip: 0, order: 'asc', ...q }) as unknown as QueryProductDto;

const priced = (...prices: number[]) => prices.map((price, i) => productRow(i + 1, { price }));
const listOf = (rows: Record<string, any>[]) => makeService({ findAndCount: inMemoryProducts(rows) });
const prices = (res: { data: { products: any[] } }) => res.data.products.map((p) => p.price);
const titles = (res: { data: { products: any[] } }) => res.data.products.map((p) => p.title);

describe('ProductsService.findAll price range', () => {
  const svc = () => listOf(priced(5, 10, 20, 30));

  it('min=10 max=20 returns exactly 10 and 20 (inclusive), total 2, same response shape; catches exclusive bounds / no filter', async () => {
    const res = await svc().findAll(query({ minPrice: 10, maxPrice: 20, limit: 50 }));
    expect(prices(res)).toEqual([10, 20]);
    expect(res.data.total).toBe(2);
    expect(res.data.skip).toBe(0);
    expect(res.data.limit).toBe(50);
  });

  it('min=20 alone returns 20 and 30; catches ignoring a lone lower bound', async () => {
    const res = await svc().findAll(query({ minPrice: 20 }));
    expect(prices(res)).toEqual([20, 30]);
    expect(res.data.total).toBe(2);
  });

  it('max=10 alone returns 5 and 10; catches ignoring a lone upper bound / Between(undefined, x)', async () => {
    const res = await svc().findAll(query({ maxPrice: 10 }));
    expect(prices(res)).toEqual([5, 10]);
    expect(res.data.total).toBe(2);
  });

  it('min=10 max=10 returns only the 10 product; catches swapped bounds or a strict <', async () => {
    const res = await svc().findAll(query({ minPrice: 10, maxPrice: 10 }));
    expect(prices(res)).toEqual([10]);
    expect(res.data.total).toBe(1);
  });

  it('max=0 returns only free products and min=0 returns all; catches `if (maxPrice)` dropping 0', async () => {
    const s = listOf(priced(0, 5, 10));
    const onlyFree = await s.findAll(query({ maxPrice: 0 }));
    expect(prices(onlyFree)).toEqual([0]);
    expect(onlyFree.data.total).toBe(1);

    const all = await s.findAll(query({ minPrice: 0 }));
    expect(prices(all)).toEqual([0, 5, 10]);
  });

  it('decimal bounds are exact: min=9.99 includes 9.99, max=9.99 excludes 10; catches rounding to integers', async () => {
    const s = listOf(priced(9.99, 10));
    expect(prices(await s.findAll(query({ minPrice: 9.99 })))).toEqual([9.99, 10]);
    expect(prices(await s.findAll(query({ maxPrice: 9.99 })))).toEqual([9.99]);
    expect(prices(await s.findAll(query({ minPrice: 10 })))).toEqual([10]);
  });

  it('no match gives empty products, total 0, and still skip/limit; catches changed shape or 404', async () => {
    const res = await svc().findAll(query({ minPrice: 100, limit: 5 }));
    expect(res.data).toEqual({ products: [], total: 0, skip: 0, limit: 5 });
  });
});

describe('ProductsService.findAll price range together with q', () => {
  const rows = [
    productRow(1, { title: 'Phone A', description: 'x', price: 100 }),
    productRow(2, { title: 'Phone B', description: 'x', price: 500 }),
    productRow(3, { title: 'Case', description: 'x', price: 100 }),
    productRow(4, { title: 'Gadget', description: 'Works like a phone', price: 900 }),
    productRow(5, { title: 'Widget', description: 'A cheap PHONE stand', price: 150 }),
  ];

  it('q=phone & maxPrice=200 keeps only in-range matches from BOTH title and description branches; catches price missing on one OR branch', async () => {
    const res = await listOf(rows).findAll(query({ q: 'phone', maxPrice: 200 }));
    // product 4 (description match, 900) must not leak; product 5 (description match, 150) must stay
    expect(titles(res)).toEqual(['Phone A', 'Widget']);
    expect(res.data.total).toBe(2);
  });

  it('title-only data: q=phone & maxPrice=200 returns only "Phone A", total 1', async () => {
    const res = await listOf(rows.slice(0, 3)).findAll(query({ q: 'phone', maxPrice: 200 }));
    expect(titles(res)).toEqual(['Phone A']);
    expect(res.data.total).toBe(1);
  });

  it('description-only match inside the range is still returned; catches price attached to the title branch only', async () => {
    const res = await listOf(rows).findAll(query({ q: 'phone', minPrice: 120, maxPrice: 200 }));
    expect(titles(res)).toEqual(['Widget']);
  });
});

describe('ProductsService.findAll price range with sort and pagination', () => {
  it('min=10 sort price desc limit=1 skip=1 returns the 20 product, total 3; catches paginating before filtering / total over unfiltered set', async () => {
    const res = await listOf(priced(5, 10, 20, 30)).findAll(
      query({ minPrice: 10, sortBy: 'price', order: 'desc', limit: 1, skip: 1 }),
    );
    expect(prices(res)).toEqual([20]);
    expect(res.data.total).toBe(3);
  });
});

describe('ProductsService.findAll filtering (model-based property)', () => {
  const rowArb = fc.record({
    title: fc.constantFrom('Phone', 'Case', 'Phone Case'),
    description: fc.constantFrom('a phone', 'a case', 'nothing'),
    price: fc.constantFrom(0, 1, 5, 5, 10),
  });
  const queryArb = fc.record({
    q: fc.constantFrom(undefined, 'phone', 'CASE'),
    minPrice: fc.constantFrom(undefined, 0, 1, 5, 10),
    maxPrice: fc.constantFrom(undefined, 0, 1, 5, 10),
    sortBy: fc.constantFrom(undefined, 'price' as const),
    order: fc.constantFrom('asc' as const, 'desc' as const),
    limit: fc.constantFrom(undefined, 1, 2, 3),
    skip: fc.constantFrom(0, 1, 2),
  });

  it('result equals filter -> sort -> slice; total counts the whole filtered set regardless of page', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(rowArb, { maxLength: 8 }), queryArb, async (defs, qry) => {
        const rows = defs.map((d, i) => productRow(i + 1, d));
        // keep only valid ranges (min > max is a 400, covered elsewhere)
        fc.pre(qry.minPrice === undefined || qry.maxPrice === undefined || qry.minPrice <= qry.maxPrice);

        // oracle, written independently
        const needle = qry.q?.toLowerCase();
        const matching = rows.filter((r) => {
          const inRange =
            (qry.minPrice === undefined || r.price >= qry.minPrice) &&
            (qry.maxPrice === undefined || r.price <= qry.maxPrice);
          const textOk =
            needle === undefined ||
            r.title.toLowerCase().includes(needle) ||
            r.description.toLowerCase().includes(needle);
          return inRange && textOk;
        });
        const sorted = [...matching].sort((a, b) => {
          const dir = qry.order === 'desc' ? -1 : 1;
          if (qry.sortBy === 'price') {
            if (a.price !== b.price) return (a.price - b.price) * dir;
            return a.id - b.id; // ties by id ascending
          }
          return (a.id - b.id) * dir;
        });
        const expected = sorted
          .slice(qry.skip, qry.limit === undefined ? undefined : qry.skip + qry.limit)
          .map((r) => r.id);

        const res = await listOf(rows).findAll(query(qry));

        expect(res.data.products.map((p: any) => p.id)).toEqual(expected);
        expect(res.data.total).toBe(matching.length);
        expect(res.data.total).toBeGreaterThanOrEqual(res.data.products.length);
      }),
    );
  });
});
