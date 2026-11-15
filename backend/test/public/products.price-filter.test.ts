import 'reflect-metadata';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CreateProductDto } from '../../src/products/dto/create-product.dto';
import { fakeRedis } from './products.fakes';
import { cents, makePriceService, priced, query } from './price-filter.fakes';
import type { Row } from './price-filter.fakes';

// Fixture of PROD-001: products priced 5.00, 10.00, 20.00 and 30.00 USD (ids 1-4)
const fixture = (): Row[] => [priced(1, '5.00'), priced(2, '10.00'), priced(3, '20.00'), priced(4, '30.00')];

const prices = (res: { data: { products: Array<{ price: unknown }> } }) =>
  res.data.products.map((p) => Number(p.price));
const ids = (res: { data: { products: Array<{ id: number }> } }) => res.data.products.map((p) => p.id);

describe('ProductsService.findAll: price range', () => {
  it('PROD-001-S1 returns exactly the 10.00 and 20.00 products for 10-20, both ends included', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));

    expect(prices(res)).toEqual([10, 20]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-001-S2 only a minimum of 20 gives the 20.00 and 30.00 products', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query({ minPrice: '20' }));

    expect(prices(res)).toEqual([20, 30]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-001-S3 only a maximum of 10 gives the 5.00 and 10.00 products', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query({ maxPrice: '10' }));

    expect(prices(res)).toEqual([5, 10]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-001-S4 GET /products?minPrice=10&maxPrice=20 keeps the response shape and total', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));

    expect(Object.keys(res.data).sort()).toEqual(['limit', 'products', 'skip', 'total']);
    expect(res.data).toMatchObject({ total: 2, skip: 0, limit: 10 });
    expect(prices(res)).toEqual([10, 20]);
    expect(res.cache).toBe('MISS');
    expect((await service.findAll(query({ minPrice: '10', maxPrice: '20' }))).cache).toBe('HIT');
  });

  it('PROD-001-S5 without minPrice and maxPrice the list is not filtered by price', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query());

    expect(prices(res)).toEqual([5, 10, 20, 30]);
    expect(res.data.total).toBe(4);
  });

  it('PROD-001-S7 19.99-20 includes 19.99 and 20.00 and excludes 20.01 (exact, no rounding)', async () => {
    const { service } = makePriceService([priced(1, '19.99'), priced(2, '20.00'), priced(3, '20.01')]);

    const res = await service.findAll(query({ minPrice: '19.99', maxPrice: '20' }));

    expect(ids(res)).toEqual([1, 2]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-001-S8 a minimum equal to the maximum returns exactly the product at that price', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query({ minPrice: '20', maxPrice: '20' }));

    expect(prices(res)).toEqual([20]);
  });

  it('PROD-001-S9 maxPrice=0 returns exactly the 0.00 product (the string "0" is a real bound)', async () => {
    const { service } = makePriceService([...fixture(), priced(5, '0.00')]);

    const res = await service.findAll(query({ maxPrice: '0' }));

    expect(ids(res)).toEqual([5]);
    expect(res.data.total).toBe(1);
  });

  it('PROD-001-S13 compares the selling price, never the pre-discount price', async () => {
    // product 5: selling price 20.00, discountPercentage 50 -> card shows 40.00 struck through
    const rows = [...fixture(), priced(5, '20.00', { discountPercentage: 50 })];
    const { service } = makePriceService(rows);

    const high = await service.findAll(query({ minPrice: '30', maxPrice: '50' }));
    const low = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));

    expect(ids(high)).toEqual([4]);
    expect(ids(low)).toEqual([2, 3, 5]);
  });

  it('PROD-001-S1 the result is exactly the products inside the range, for any prices and bounds (property)', async () => {
    const boundArb = fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined });
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 0, maxLength: 30 }),
        boundArb,
        boundArb,
        async (priceCents, a, b) => {
          // order the two bounds so min <= max when both are set
          const [lo, hi] = a !== undefined && b !== undefined ? [Math.min(a, b), Math.max(a, b)] : [a, b];
          const rows = priceCents.map((c, i) => priced(i + 1, cents(c)));
          const { service } = makePriceService(rows);

          const res = await service.findAll(
            query({
              limit: 100,
              ...(lo === undefined ? {} : { minPrice: cents(lo) }),
              ...(hi === undefined ? {} : { maxPrice: cents(hi) }),
            }),
          );

          const expected = priceCents
            .map((c, i) => ({ c, id: i + 1 }))
            .filter(({ c }) => (lo === undefined || c >= lo) && (hi === undefined || c <= hi))
            .map(({ id }) => id);
          expect(ids(res)).toEqual(expected);
          expect(res.data.total).toBe(expected.length);
        },
      ),
    );
  });

  it('PROD-003-S1 10.50-20 returns exactly the 10.50 and 20.00 products', async () => {
    const { service } = makePriceService([
      priced(1, '5.00'),
      priced(2, '10.00'),
      priced(3, '10.50'),
      priced(4, '20.00'),
      priced(5, '30.00'),
    ]);

    const res = await service.findAll(query({ minPrice: '10.50', maxPrice: '20' }));

    expect(ids(res)).toEqual([3, 4]);
  });

  it('PROD-003-S11 a missing minimum with maxPrice=10 gives the 5.00 and 10.00 products', async () => {
    const { service } = makePriceService(fixture());

    const res = await service.findAll(query({ maxPrice: '10' }));

    expect(prices(res)).toEqual([5, 10]);
  });

  it('PROD-003-S18 "010" and "20.00" give the same products as 10 and 20', async () => {
    const { service } = makePriceService(fixture());

    const typed = await service.findAll(query({ minPrice: '010', maxPrice: '20.00' }));
    const plain = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));

    expect(prices(typed)).toEqual([10, 20]);
    expect(ids(typed)).toEqual(ids(plain));
  });
});

describe('ProductsService.findAll: price range with keyword, sort, pagination', () => {
  const phones = (): Row[] => [
    priced(1, '50.00', { title: 'Phone Case' }),
    priced(2, '150.00', { title: 'Smart phone' }),
    priced(3, '300.00', { title: 'PHONE stand' }),
    priced(4, '600.00', { title: 'Phone pro' }),
    priced(5, '200.00', { title: 'Lamp', description: 'A desk lamp' }),
  ];

  it('PROD-002-S1 keyword "phone" AND range 100-500, sorted by price desc: 300 then 150, total 2', async () => {
    const { service } = makePriceService(phones());

    const res = await service.findAll(
      query({ q: 'phone', minPrice: '100', maxPrice: '500', sortBy: 'price', order: 'desc' }),
    );

    expect(prices(res)).toEqual([300, 150]);
    expect(res.data.total).toBe(2);
  });

  it('PROD-002-S1 a product matching the keyword only in its description is still filtered by price', async () => {
    const rows = [
      priced(1, '50.00', { title: 'Lamp', description: 'works with any phone' }),
      priced(2, '300.00', { title: 'Lamp', description: 'works with any phone' }),
    ];
    const { service } = makePriceService(rows);

    const res = await service.findAll(query({ q: 'phone', minPrice: '100', maxPrice: '500' }));

    expect(ids(res)).toEqual([2]);
    expect(res.data.total).toBe(1);
  });

  it('PROD-002-S2 15 products in range, 10 per page: page 2 holds the other 5 and total is 15', async () => {
    const inRange = Array.from({ length: 15 }, (_, i) => priced(i + 1, '15.00', { title: `A${String(i).padStart(2, '0')}` }));
    const outside = [priced(16, '1.00'), priced(17, '99.00')];
    const { service } = makePriceService([...inRange, ...outside]);

    const page2 = await service.findAll(query({ minPrice: '10', maxPrice: '20', skip: 10, sortBy: 'title' }));

    expect(page2.data.products).toHaveLength(5);
    expect(page2.data.total).toBe(15);
    expect(page2.data.skip).toBe(10);
  });

  it('PROD-002-S5 exactly 10 in range is one page; after an 11th is created page 2 holds 1 and total is 11', async () => {
    const inRange = Array.from({ length: 10 }, (_, i) => priced(i + 1, '15.00'));
    const { service } = makePriceService([...inRange, priced(20, '1.00'), priced(21, '99.00')]);
    const range = { minPrice: '10', maxPrice: '20', sortBy: 'price' as const };

    const before = await service.findAll(query(range));
    expect(before.data.total).toBe(10);
    expect(before.data.products).toHaveLength(10);

    await service.create({
      title: 'Eleventh',
      description: 'in range',
      category: 'beauty',
      price: 15,
      stock: 1,
      tags: [],
      images: [],
    } as unknown as CreateProductDto);

    const page2 = await service.findAll(query({ ...range, skip: 10 }));
    expect(page2.cache).toBe('MISS');
    expect(page2.data.total).toBe(11);
    expect(page2.data.products).toHaveLength(1);
  });

  it('PROD-002-S11 products with the same price are ordered by ascending id, on every load', async () => {
    // stored out of id order so only the id tie-break can produce 3, 7, 9
    const rows = [priced(9, '15.00'), priced(1, '5.00'), priced(3, '15.00'), priced(7, '15.00')];
    const { service } = makePriceService(rows, fakeRedis({ isReady: false })); // no cache: every call hits the db

    for (let i = 0; i < 3; i++) {
      const res = await service.findAll(query({ minPrice: '10', maxPrice: '20', sortBy: 'price', order: 'asc' }));
      expect(ids(res)).toEqual([3, 7, 9]);
    }
  });
});

describe('ProductsService.findAll: cache and the price range', () => {
  it('PROD-001-S14 a cached 10-20 list is not served for 30-40; the repeated 10-20 is a HIT', async () => {
    const rows = [priced(1, '10.00'), priced(2, '20.00'), priced(3, '30.00')];
    const { service } = makePriceService(rows);

    const first = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));
    expect(first.cache).toBe('MISS');
    expect(prices(first)).toEqual([10, 20]);

    const other = await service.findAll(query({ minPrice: '30', maxPrice: '40' }));
    expect(other.cache).toBe('MISS');
    expect(prices(other)).toEqual([30]);

    const again = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));
    expect(again.cache).toBe('HIT');
    expect(prices(again)).toEqual([10, 20]);
  });

  it('PROD-001-S14 the key depends on each bound separately and on a bound being absent (property)', async () => {
    const boundArb = fc.constantFrom<string | undefined>(undefined, '10', '20', '30');
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ minPrice: boundArb, maxPrice: boundArb }), { minLength: 1, maxLength: 20 }),
        async (queries) => {
          const { service } = makePriceService([priced(1, '10.00'), priced(2, '20.00'), priced(3, '30.00')]);
          const seen = new Set<string>();
          for (const bounds of queries) {
            const tuple = `${bounds.minPrice}|${bounds.maxPrice}`;
            const res = await service.findAll(
              query({
                ...(bounds.minPrice === undefined ? {} : { minPrice: bounds.minPrice }),
                ...(bounds.maxPrice === undefined ? {} : { maxPrice: bounds.maxPrice }),
              }),
            );
            expect(res.cache).toBe(seen.has(tuple) ? 'HIT' : 'MISS');
            seen.add(tuple);
          }
        },
      ),
    );
  });

  it('PROD-001-S10 editing a price invalidates the cached 10-20 list', async () => {
    const { service } = makePriceService([priced(1, '10.00'), priced(2, '20.00')]);
    const range = query({ minPrice: '10', maxPrice: '20' });

    expect(prices(await service.findAll(range))).toEqual([10, 20]);
    expect((await service.findAll(range)).cache).toBe('HIT');

    await service.update(1, { price: 25 });

    const after = await service.findAll(range);
    expect(after.cache).toBe('MISS');
    expect(prices(after)).toEqual([20]);
  });

  it('PROD-001-S12 with Redis down the 10-20 list is read from the database, no error', async () => {
    const { service } = makePriceService(fixture(), fakeRedis({ isReady: false }));

    const res = await service.findAll(query({ minPrice: '10', maxPrice: '20' }));

    expect(res.cache).toBe('MISS');
    expect(prices(res)).toEqual([10, 20]);
    expect(res.data.total).toBe(2);
  });
});
