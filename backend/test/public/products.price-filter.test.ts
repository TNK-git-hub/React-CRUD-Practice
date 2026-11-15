import 'reflect-metadata';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { UpdateProductDto } from '../../src/products/dto/update-product.dto';
import { fakeRedis, listRow, makeListService } from './products.fakes';
import type { ListRow } from './products.fakes';

type Query = Partial<Pick<QueryProductDto, 'q' | 'limit' | 'skip' | 'sortBy' | 'order'>> & {
  minPrice?: string;
  maxPrice?: string;
};

// What the ValidationPipe hands to the service: skip and order default, bounds are strings
const dtoOf = (q: Query) => ({ limit: 10, skip: 0, order: 'asc', ...q }) as unknown as QueryProductDto;

const prices = (res: { data: { products: unknown[] } }) =>
  (res.data.products as ListRow[]).map((p) => p.price);
const ids = (res: { data: { products: unknown[] } }) => (res.data.products as ListRow[]).map((p) => p.id);

// Fixture of the spec: 5.00, 10.00, 20.00, 30.00
const fixture = () => [listRow(1, 5), listRow(2, 10), listRow(3, 20), listRow(4, 30)];

describe('ProductsService.findAll price filter', () => {
  it('PROD-001-S1 min and max both set: only products inside, both ends included', async () => {
    // Catches: no price condition, or < / > instead of Between
    const res = await makeListService(fixture()).findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));

    expect(prices(res)).toEqual([10, 20]);
  });

  it('PROD-001-S2 only a minimum: that price and above', async () => {
    // Catches: missing MoreThanOrEqual, or demanding both bounds
    const res = await makeListService(fixture()).findAll(dtoOf({ minPrice: '20' }));

    expect(prices(res)).toEqual([20, 30]);
  });

  it('PROD-001-S3 only a maximum: that price and below', async () => {
    // Catches: missing LessThanOrEqual
    const res = await makeListService(fixture()).findAll(dtoOf({ maxPrice: '10' }));

    expect(prices(res)).toEqual([5, 10]);
  });

  it('PROD-001-S4 direct request 10-20: exactly two products and total 2', async () => {
    // Catches: total counted before the price condition
    const res = await makeListService(fixture()).findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));

    expect(prices(res)).toEqual([10, 20]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-001-S5 both bounds absent: no price filter, all products', async () => {
    // Catches: an empty price condition added anyway
    const res = await makeListService(fixture()).findAll(dtoOf({}));

    expect(prices(res)).toEqual([5, 10, 20, 30]);
    expect(res.data.total).toBe(4);
  });

  it('PROD-001-S7 exact to 2 decimals: 19.99-20 keeps 19.99 and 20.00, not 20.01', async () => {
    // Catches: rounding, float comparison, or an exclusive bound
    const rows = [listRow(1, 19.99), listRow(2, 20), listRow(3, 20.01)];

    const res = await makeListService(rows).findAll(dtoOf({ minPrice: '19.99', maxPrice: '20' }));

    expect(prices(res)).toEqual([19.99, 20]);
  });

  it('PROD-001-S8 minimum equal to the maximum returns the product at exactly that price', async () => {
    // Catches: < instead of <=
    const res = await makeListService(fixture()).findAll(dtoOf({ minPrice: '20', maxPrice: '20' }));

    expect(prices(res)).toEqual([20]);
  });

  it('PROD-001-S9 maxPrice "0" is a real bound: the 0.00 product is returned and others are not', async () => {
    // Catches: truthiness check `if (maxPrice)` treating "0" as absent
    const rows = [listRow(1, 0), ...fixture().map((r) => ({ ...r, id: r.id + 1 }))];

    const res = await makeListService(rows).findAll(dtoOf({ maxPrice: '0' }));

    expect(prices(res)).toEqual([0]);
    expect(res.data.total).toBe(1);
  });

  it('PROD-001-S9 minPrice "0" is a real bound and excludes nothing', async () => {
    // Catches: "0" mishandled as a missing minimum producing a wrong condition
    const rows = [listRow(1, 0), ...fixture().map((r) => ({ ...r, id: r.id + 1 }))];

    const res = await makeListService(rows).findAll(dtoOf({ minPrice: '0' }));

    expect(res.data.total).toBe(5);
  });

  it('PROD-001-S13 compares the stored selling price, never the pre-discount price', async () => {
    // Catches: filtering on price / (1 - discount) = 40.00
    const rows = [...fixture(), listRow(5, 20, { discountPercentage: 50 })];
    const svc = makeListService(rows);

    const high = await svc.findAll(dtoOf({ minPrice: '30', maxPrice: '50' }));
    const low = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));

    expect(ids(high)).toEqual([4]);
    expect(ids(low)).toEqual([2, 3, 5]);
  });

  it('PROD-001-S13 a discounted 20.00 product is excluded from 30-50 even though it is shown at 40.00', async () => {
    // Catches: pre-discount price leaking into the comparison
    const rows = [listRow(1, 20, { discountPercentage: 50 })];

    const res = await makeListService(rows).findAll(dtoOf({ minPrice: '30', maxPrice: '50' }));

    expect(res.data.total).toBe(0);
  });
});

describe('ProductsService.findAll price filter with keyword, sort and pages', () => {
  const phoneRows = () => [
    listRow(1, 50, { title: 'Phone A' }),
    listRow(2, 150, { title: 'Phone B' }),
    listRow(3, 300, { title: 'Phone C' }),
    listRow(4, 600, { title: 'Phone D' }),
    listRow(5, 200, { title: 'Tablet' }),
  ];

  it('PROD-002-S1 keyword AND range, sorted by price desc: 300 then 150, total 2', async () => {
    // Catches: price condition on one branch only, or OR between keyword and range
    const res = await makeListService(phoneRows()).findAll(
      dtoOf({ q: 'phone', minPrice: '100', maxPrice: '500', sortBy: 'price', order: 'desc' }),
    );

    expect(prices(res)).toEqual([300, 150]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-002-S1 a product matching the keyword only in its description is still range-filtered', async () => {
    // Catches: the description branch missing the price condition
    const rows = [
      listRow(1, 50, { title: 'Gadget', description: 'a fine phone' }),
      listRow(2, 150, { title: 'Gadget', description: 'a fine phone' }),
    ];

    const res = await makeListService(rows).findAll(dtoOf({ q: 'phone', minPrice: '100', maxPrice: '500' }));

    expect(ids(res)).toEqual([2]);
    expect(res.data.total).toBe(1);
  });

  it('PROD-002-S1 a title match outside the range is excluded too', async () => {
    // Catches: the title branch missing the price condition
    const rows = [listRow(1, 50, { title: 'Phone' }), listRow(2, 150, { title: 'Phone' })];

    const res = await makeListService(rows).findAll(dtoOf({ q: 'phone', minPrice: '100' }));

    expect(ids(res)).toEqual([2]);
  });

  it('PROD-002-S2 page 2 of 15 in range: 5 products, total 15', async () => {
    // Catches: total equal to the page size, or paging before filtering
    const inRange = Array.from({ length: 15 }, (_, i) => listRow(i + 1, 15));
    const outRange = [listRow(100, 1), listRow(101, 99)];

    const res = await makeListService([...outRange, ...inRange]).findAll(
      dtoOf({ minPrice: '10', maxPrice: '20', skip: 10, limit: 10 }),
    );

    expect(res.data.products).toHaveLength(5);
    expect(res.data.total).toBe(15);
  });

  it('PROD-002-S5 exactly 10 in range: total 10; an 11th makes page 2 hold 1 product, total 11', async () => {
    // Catches: off-by-one at the page boundary
    const rows = Array.from({ length: 10 }, (_, i) => listRow(i + 1, 15));
    const svc = makeListService(rows);

    const first = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));
    rows.push(listRow(11, 15));
    // a new query object with another cache key-free path: skip differs, so no stale HIT
    const second = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20', skip: 10 }));

    expect(first.data.total).toBe(10);
    expect(first.data.products).toHaveLength(10);
    expect(second.data.total).toBe(11);
    expect(second.data.products).toHaveLength(1);
  });

  it('PROD-002-S11 ties on price are ordered by ascending id, whatever the insert order', async () => {
    // Catches: losing the secondary id ASC sort key
    const rows = [listRow(9, 15), listRow(3, 15), listRow(7, 15), listRow(1, 99)];

    const res = await makeListService(rows).findAll(
      dtoOf({ minPrice: '10', maxPrice: '20', sortBy: 'price', order: 'asc' }),
    );

    expect(ids(res)).toEqual([3, 7, 9]);
  });

  it('PROD-001-S1 / PROD-001-S7 / PROD-001-S9 / PROD-002-S2 / PROD-002-S11 result equals an independent filter+sort+slice', async () => {
    // Catches: any boundary, total, paging or tie-break error, over random data
    const word = fc.constantFrom('phone', 'tab', 'Phone', 'lamp');
    const rowArb = fc.record({
      cents: fc.integer({ min: 0, max: 5000 }),
      title: word,
      description: word,
    });
    const centsStr = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

    await fc.assert(
      fc.asyncProperty(
        fc.array(rowArb, { maxLength: 40 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.option(fc.constantFrom('phone', 'LAMP', 'zzz'), { nil: undefined }),
        fc.constantFrom('asc' as const, 'desc' as const),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 12 }),
        async (data, a, b, q, order, skip, limit) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const rows = data.map((d, i) => listRow(i + 1, d.cents / 100, { title: d.title, description: d.description }));

          const res = await makeListService(rows).findAll(
            dtoOf({ q, minPrice: centsStr(lo), maxPrice: centsStr(hi), sortBy: 'price', order, skip, limit }),
          );

          const expected = data
            .map((d, i) => ({ id: i + 1, cents: d.cents, d }))
            .filter((x) => x.cents >= lo && x.cents <= hi)
            .filter((x) => !q || (x.d.title + ' ' + x.d.description).toLowerCase().includes(q.toLowerCase()))
            .sort((x, y) => (order === 'asc' ? x.cents - y.cents : y.cents - x.cents) || x.id - y.id);

          expect(res.data.total).toBe(expected.length);
          expect(ids(res)).toEqual(expected.slice(skip, skip + limit).map((x) => x.id));
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('ProductsService.findAll price filter and the list cache', () => {
  it('PROD-001-S14 another range is a MISS and never returns the cached 10-20 list', async () => {
    // Catches: cache key without minPrice / maxPrice
    const svc = makeListService(fixture());

    const a = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));
    const b = await svc.findAll(dtoOf({ minPrice: '30', maxPrice: '40' }));
    const again = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));

    expect(a.cache).toBe('MISS');
    expect(b.cache).toBe('MISS');
    expect(prices(b)).toEqual([30]);
    expect(again.cache).toBe('HIT');
    expect(prices(again)).toEqual([10, 20]);
  });

  it('PROD-001-S14 a request without a range is not served the cached ranged list', async () => {
    // Catches: key built only when a range exists
    const svc = makeListService(fixture());

    await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));
    const plain = await svc.findAll(dtoOf({}));

    expect(plain.cache).toBe('MISS');
    expect(plain.data.total).toBe(4);
  });

  it('PROD-001-S14 a differing minPrice alone, or maxPrice alone, gives a different key', async () => {
    // Catches: only one of the two bounds being part of the key
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 101, max: 200 }),
        fc.boolean(),
        async (x, y, z, varyMin) => {
          const svc = makeListService(fixture());
          const base = varyMin ? { minPrice: String(x), maxPrice: '300' } : { minPrice: '0', maxPrice: String(z) };
          const other = varyMin ? { minPrice: String(x + y + 1), maxPrice: '300' } : { minPrice: '0', maxPrice: String(z + 1) };

          await svc.findAll(dtoOf(base));
          const second = await svc.findAll(dtoOf(other));

          expect(second.cache).toBe('MISS');
        },
      ),
      { numRuns: 30 },
    );
  });

  it('PROD-001-S10 editing a product invalidates the cached 10-20 list', async () => {
    // Catches: range in the key breaking the version-bump invalidation
    const rows = fixture();
    const svc = makeListService(rows);
    const first = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));
    expect(prices(first)).toEqual([10, 20]);

    await svc.update(2, { price: 25 } as UpdateProductDto);
    const after = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));

    expect(after.cache).toBe('MISS');
    expect(prices(after)).toEqual([20]);
  });

  it('PROD-001-S12 Redis down: the filtered list is read from the database, no error', async () => {
    // Catches: a cache step on the ranged path without fail-open
    const svc = makeListService(fixture(), fakeRedis({ isReady: false }));

    const res = await svc.findAll(dtoOf({ minPrice: '10', maxPrice: '20' }));

    expect(prices(res)).toEqual([10, 20]);
    expect(res.cache).toBe('MISS');
  });
});
