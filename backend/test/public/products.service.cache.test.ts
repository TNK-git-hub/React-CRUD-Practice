import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CreateProductDto } from '../../src/products/dto/create-product.dto';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import {
  asJson,
  fakeRedis,
  makeService,
  productRow,
  rejection,
  uniqueViolation,
} from './products.fakes';

const Q = { q: 'phone', limit: 10, skip: 0, sortBy: 'price', order: 'desc' } as QueryProductDto;

const validDto = {
  title: 'Red Lipstick',
  description: 'A bright red lipstick',
  category: 'beauty',
  price: 12.5,
  stock: 10,
  tags: [],
  images: [],
} as unknown as CreateProductDto;

// every list load returns a different page, so a stale HIT can be told apart from a fresh MISS
const countingList = () => {
  let calls = 0;
  return () => {
    calls++;
    return [[{ id: 100 + calls, title: `load #${calls}` }], calls] as [unknown[], number];
  };
};

describe('ProductsService.remove', () => {
  it('rejects with 404 when the product does not exist', async () => {
    const svc = makeService({ findOne: () => null });

    const err = await rejection(svc.remove(999));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.message).toBe('Product 999 not found');
  });
});

describe('ProductsService.findOne cache', () => {
  it('serves the second read of the same id from cache, other ids still miss', async () => {
    const svc = makeService({ findOne: (id) => productRow(id) });

    const first = await svc.findOne(1);
    expect(first.cache).toBe('MISS');
    expect(first.data.id).toBe(1);
    expect(first.data.title).toBe('Product 1');

    const second = await svc.findOne(1);
    expect(second.cache).toBe('HIT');
    expect(second.data).toEqual(asJson(first.data));

    const other = await svc.findOne(2);
    expect(other.cache).toBe('MISS');
    expect(other.data.id).toBe(2);
  });

  it('does not cache "not found": the row appearing later is read from the db', async () => {
    let row: ReturnType<typeof productRow> | null = null;
    const svc = makeService({ findOne: () => row });

    const err = await rejection(svc.findOne(9));
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.message).toBe('Product 9 not found');

    row = productRow(9);
    const after = await svc.findOne(9);
    expect(after.cache).toBe('MISS');
    expect(after.data.id).toBe(9);
  });
});

describe('ProductsService.findAll cache key (property)', () => {
  const queryArb = fc.record({
    q: fc.constantFrom(undefined, 'a', 'b'),
    limit: fc.constantFrom(undefined, 1, 2),
    skip: fc.constantFrom(0, 1),
    sortBy: fc.constantFrom(undefined, 'price' as const),
    order: fc.constantFrom('asc' as const, 'desc' as const),
  });

  it('HITs exactly when the same (q, limit, skip, sortBy, order) was queried before', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(queryArb, { minLength: 1, maxLength: 25 }), async (queries) => {
        const svc = makeService({ findAndCount: countingList() });
        const firstMiss = new Map<string, unknown>(); // model: tuple -> data of its first MISS
        let misses = 0;

        for (const query of queries) {
          const tuple = [query.q, query.limit, query.skip, query.sortBy, query.order].map(String).join('|');
          const res = await svc.findAll(query as QueryProductDto);

          if (firstMiss.has(tuple)) {
            expect(res.cache).toBe('HIT');
            expect(res.data).toEqual(firstMiss.get(tuple));
          } else {
            expect(res.cache).toBe('MISS');
            misses++;
            expect(res.data.total).toBe(misses); // freshly loaded, not someone else's page
            firstMiss.set(tuple, asJson(res.data));
          }
        }
      }),
    );
  });
});

describe('ProductsService cache invalidation', () => {
  it('remove drops the cached detail and the cached lists', async () => {
    let exists = true;
    const svc = makeService({
      findOne: (id) => (exists ? productRow(id) : null),
      findAndCount: countingList(),
    });

    expect((await svc.findOne(1)).cache).toBe('MISS');
    expect((await svc.findOne(1)).cache).toBe('HIT');
    expect((await svc.findAll(Q)).cache).toBe('MISS');
    expect((await svc.findAll(Q)).cache).toBe('HIT');

    const removed = await svc.remove(1);
    expect(removed.id).toBe(1);
    expect(removed.title).toBe('Product 1');
    expect(removed.tags).toEqual(['beauty']);
    expect(removed.isDeleted).toBe(true);
    expect(typeof removed.deletedOn).toBe('string');
    expect(new Date(removed.deletedOn).toISOString()).toBe(removed.deletedOn);
    exists = false; // the row is gone from Postgres

    const err = await rejection(svc.findOne(1));
    expect(err).toBeInstanceOf(NotFoundException);

    const list = await svc.findAll(Q);
    expect(list.cache).toBe('MISS');
    expect(list.data.total).toBe(2); // second load from the db
  });

  it('a failed create or update leaves the cached list in place', async () => {
    const svc = makeService({
      findAndCount: countingList(),
      findOne: (id) => productRow(id),
      managerFindOneBy: () => null,
      managerSave: () => {
        throw uniqueViolation('Key (sku)=(ABC) already exists.');
      },
    });

    expect((await svc.findAll(Q)).cache).toBe('MISS');
    expect((await svc.findAll(Q)).cache).toBe('HIT');

    await expect(svc.create(validDto)).rejects.toThrow('sku already exists');
    const afterCreate = await svc.findAll(Q);
    expect(afterCreate.cache).toBe('HIT');
    expect(afterCreate.data.total).toBe(1);

    await expect(svc.update(999, { title: 'x' })).rejects.toThrow('Product 999 not found');
    const afterUpdate = await svc.findAll(Q);
    expect(afterUpdate.cache).toBe('HIT');
    expect(afterUpdate.data.total).toBe(1);
  });

  it('every committed create invalidates the cached list, not only the first one', async () => {
    const svc = makeService({
      findAndCount: countingList(), // load #n reports total n
      findOne: (id) => productRow(id),
      managerSave: (entity) => ({ ...entity, id: 42 }),
    });

    const before = await svc.findAll(Q);
    expect(before.cache).toBe('MISS');
    expect(before.data.total).toBe(1);
    expect((await svc.findAll(Q)).cache).toBe('HIT');

    const created = await svc.create(validDto);
    expect(created!.id).toBe(42);
    const afterFirst = await svc.findAll(Q);
    expect(afterFirst.cache).toBe('MISS');
    expect(afterFirst.data.total).toBe(2);
    expect((await svc.findAll(Q)).cache).toBe('HIT');

    await svc.create(validDto);
    const afterSecond = await svc.findAll(Q);
    expect(afterSecond.cache).toBe('MISS');
    expect(afterSecond.data.total).toBe(3);
  });

  it('a successful update drops the cached detail so the next read sees the new data', async () => {
    let title = 'Old title';
    const svc = makeService({
      findOne: (id) => productRow(id, { title }),
      findAndCount: countingList(),
      managerFindOneBy: (where) => (where.id === 1 ? productRow(1, { title }) : null),
      managerSave: (entity) => {
        title = entity.title;
        return entity;
      },
    });

    expect((await svc.findOne(1)).cache).toBe('MISS');
    expect((await svc.findOne(1)).cache).toBe('HIT');
    expect((await svc.findAll(Q)).cache).toBe('MISS');

    const updated = await svc.update(1, { title: 'New title' });
    expect(updated!.title).toBe('New title');

    const detail = await svc.findOne(1);
    expect(detail.cache).toBe('MISS');
    expect(detail.data.title).toBe('New title');
    expect((await svc.findAll(Q)).cache).toBe('MISS');
  });
});

describe('ProductsService with Redis unavailable (fail-open)', () => {
  it('reads from the db every time when Redis is not ready', async () => {
    const svc = makeService(
      { findOne: (id) => productRow(id), findAndCount: countingList() },
      fakeRedis({ isReady: false }),
    );

    for (let i = 0; i < 2; i++) {
      const res = await svc.findOne(1);
      expect(res.cache).toBe('MISS');
      expect(res.data.id).toBe(1);
    }
    const a = await svc.findAll(Q);
    const b = await svc.findAll(Q);
    expect(a.cache).toBe('MISS');
    expect(b.cache).toBe('MISS');
    expect(b.data.total).toBe(2);
  });

  it('treats a failing Redis GET as a MISS instead of throwing', async () => {
    const svc = makeService(
      { findOne: (id) => productRow(id), findAndCount: countingList() },
      fakeRedis({ getFails: true }),
    );

    const first = await svc.findOne(1);
    const second = await svc.findOne(1);
    expect(first.cache).toBe('MISS');
    expect(second.cache).toBe('MISS');
    expect(second.data.id).toBe(1);

    const list = await svc.findAll(Q);
    expect(list.cache).toBe('MISS');
    expect(list.data.total).toBe(1);
  });
});

describe('ProductsService detail response shape', () => {
  it('maps a db row to the dummyjson shape: flat tags/images, barcode/qrCode/dates under meta', async () => {
    // every field gets its own distinct value so a swapped field cannot go unnoticed
    const row = {
      id: 1,
      title: 'Essence Mascara',
      description: 'Lengthening mascara',
      category: 'beauty',
      brand: 'Essence',
      sku: 'BEA-ESS-001',
      price: 19.99,
      discountPercentage: 7.5,
      rating: 4.25,
      stock: 42,
      minimumOrderQuantity: 3,
      availabilityStatus: 'In Stock',
      weight: 6,
      dimensions: { width: 10.5, height: 20.25, depth: 30.75 },
      warrantyInformation: '1 year warranty',
      shippingInformation: 'Ships in 2 days',
      returnPolicy: '7 days return policy',
      barcode: '123',
      qrCode: 'q',
      thumbnail: 'thumb.png',
      images: [
        { id: 11, url: 'u1', position: 0 },
        { id: 12, url: 'u2', position: 1 },
      ],
      reviewCount: 2,
      reviews: [
        {
          id: 5,
          rating: 4,
          comment: 'Nice',
          date: new Date('2025-04-01T00:00:00.000Z'),
          reviewerName: 'Ann',
          reviewerEmail: 'ann@example.com',
        },
        {
          id: 6,
          rating: 2,
          comment: null,
          date: new Date('2025-04-02T00:00:00.000Z'),
          reviewerName: 'Bob',
          reviewerEmail: 'bob@example.com',
        },
      ],
      tags: [{ id: 7, name: 'beauty' }, { id: 8, name: 'mascara' }],
      createdAt: new Date('2025-03-01T10:00:00.000Z'),
      updatedAt: new Date('2025-03-02T11:30:00.000Z'),
    };
    const svc = makeService({ findOne: (id) => (id === 1 ? row : null) });

    const { data } = await svc.findOne(1);

    expect(data).toStrictEqual({
      id: 1,
      title: 'Essence Mascara',
      description: 'Lengthening mascara',
      category: 'beauty',
      brand: 'Essence',
      tags: ['beauty', 'mascara'],
      price: 19.99,
      discountPercentage: 7.5,
      stock: 42,
      minimumOrderQuantity: 3,
      availabilityStatus: 'In Stock',
      sku: 'BEA-ESS-001',
      weight: 6,
      dimensions: { width: 10.5, height: 20.25, depth: 30.75 },
      warrantyInformation: '1 year warranty',
      shippingInformation: 'Ships in 2 days',
      returnPolicy: '7 days return policy',
      images: ['u1', 'u2'],
      thumbnail: 'thumb.png',
      rating: 4.25,
      reviewCount: 2,
      reviews: [
        {
          id: 5,
          rating: 4,
          comment: 'Nice',
          date: new Date('2025-04-01T00:00:00.000Z'),
          reviewerName: 'Ann',
          reviewerEmail: 'ann@example.com',
        },
        {
          id: 6,
          rating: 2,
          comment: null,
          date: new Date('2025-04-02T00:00:00.000Z'),
          reviewerName: 'Bob',
          reviewerEmail: 'bob@example.com',
        },
      ],
      meta: {
        barcode: '123',
        qrCode: 'q',
        createdAt: new Date('2025-03-01T10:00:00.000Z'),
        updatedAt: new Date('2025-03-02T11:30:00.000Z'),
      },
    });
  });
});
