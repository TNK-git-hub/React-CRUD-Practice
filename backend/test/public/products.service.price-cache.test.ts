import 'reflect-metadata';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { asJson, inMemoryProducts, makeService, productRow } from './products.fakes';

const query = (q: Record<string, unknown> = {}) =>
  ({ skip: 0, order: 'asc', ...q }) as unknown as QueryProductDto;

const rows = () => [5, 10, 20, 30].map((price, i) => productRow(i + 1, { price }));
const prices = (res: { data: { products: any[] } }) => res.data.products.map((p) => p.price);

describe('ProductsService.findAll cache key includes the price range', () => {
  it('findAll({}) then findAll({minPrice:20}) is a MISS returning only >= 20; catches minPrice missing from the key', async () => {
    const svc = makeService({ findAndCount: inMemoryProducts(rows()) });

    const unfiltered = await svc.findAll(query());
    expect(unfiltered.cache).toBe('MISS');
    expect(prices(unfiltered)).toEqual([5, 10, 20, 30]);

    const filtered = await svc.findAll(query({ minPrice: 20 }));
    expect(filtered.cache).toBe('MISS');
    expect(prices(filtered)).toEqual([20, 30]);
    expect(filtered.data.total).toBe(2);
  });

  it('findAll({minPrice:20}) then findAll({}) is a MISS returning all 4; catches the reverse stale list', async () => {
    const svc = makeService({ findAndCount: inMemoryProducts(rows()) });

    expect(prices(await svc.findAll(query({ minPrice: 20 })))).toEqual([20, 30]);

    const unfiltered = await svc.findAll(query());
    expect(unfiltered.cache).toBe('MISS');
    expect(prices(unfiltered)).toEqual([5, 10, 20, 30]);
    expect(unfiltered.data.total).toBe(4);
  });

  it('minPrice:20 and maxPrice:20 do not share a key; catches a key that only joins values', async () => {
    const svc = makeService({ findAndCount: inMemoryProducts(rows()) });

    expect(prices(await svc.findAll(query({ minPrice: 20 })))).toEqual([20, 30]);

    const max = await svc.findAll(query({ maxPrice: 20 }));
    expect(max.cache).toBe('MISS');
    expect(prices(max)).toEqual([5, 10, 20]);
  });

  it('repeating {minPrice:20} is a HIT with the same data; catches an unstable key that never hits', async () => {
    const svc = makeService({ findAndCount: inMemoryProducts(rows()) });

    const first = await svc.findAll(query({ minPrice: 20 }));
    const second = await svc.findAll(query({ minPrice: 20 }));

    expect(first.cache).toBe('MISS');
    expect(second.cache).toBe('HIT');
    expect(second.data).toEqual(asJson(first.data));
  });

  it('a committed create refreshes a cached filtered list too; catches filtered keys outside the version scheme', async () => {
    const db = rows();
    const svc = makeService({
      findAndCount: inMemoryProducts(db),
      findOne: (id) => productRow(id),
      managerSave: (entity) => {
        db.push(productRow(42, { price: 25 }));
        return { ...entity, id: 42 };
      },
    });

    expect(prices(await svc.findAll(query({ minPrice: 20 })))).toEqual([20, 30]);
    expect((await svc.findAll(query({ minPrice: 20 }))).cache).toBe('HIT');

    await svc.create({ title: 't', description: 'd', category: 'c', price: 25, stock: 1, tags: [], images: [] } as any);

    const after = await svc.findAll(query({ minPrice: 20 }));
    expect(after.cache).toBe('MISS');
    expect(prices(after)).toEqual([20, 30, 25]); // default order is by id: 3, 4, 42
    expect(after.data.total).toBe(3);
  });
});

describe('ProductsService.findAll cache key (property, with price range)', () => {
  const queryArb = fc.record({
    q: fc.constantFrom(undefined, 'a'),
    limit: fc.constantFrom(undefined, 1),
    skip: fc.constantFrom(0, 1),
    sortBy: fc.constantFrom(undefined, 'price' as const),
    order: fc.constantFrom('asc' as const, 'desc' as const),
    minPrice: fc.constantFrom(undefined, 0, 10, 20),
    maxPrice: fc.constantFrom(undefined, 0, 10, 20),
  });

  it('HITs exactly when the same full tuple including minPrice/maxPrice was queried before', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(queryArb, { minLength: 1, maxLength: 25 }), async (queries) => {
        let calls = 0;
        const svc = makeService({
          findAndCount: () => {
            calls++;
            return [[{ id: 100 + calls }], calls];
          },
        });
        const firstMiss = new Map<string, unknown>();
        let misses = 0;

        for (const qry of queries) {
          const tuple = [qry.q, qry.limit, qry.skip, qry.sortBy, qry.order, qry.minPrice, qry.maxPrice]
            .map(String)
            .join('|');
          const res = await svc.findAll(qry as unknown as QueryProductDto);

          if (firstMiss.has(tuple)) {
            expect(res.cache).toBe('HIT');
            expect(res.data).toEqual(firstMiss.get(tuple));
          } else {
            expect(res.cache).toBe('MISS');
            misses++;
            expect(res.data.total).toBe(misses);
            firstMiss.set(tuple, asJson(res.data));
          }
        }
      }),
    );
  });
});
