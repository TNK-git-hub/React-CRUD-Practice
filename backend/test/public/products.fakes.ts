import 'reflect-metadata';
import { QueryFailedError } from 'typeorm';
import { ProductsService } from '../../src/products/products.service';
import { CacheService } from '../../src/redis/cache.service';
import { RedisService } from '../../src/redis/redis.service';

// A full products row as TypeORM returns it from findOne (with images, reviews, tags joined)
export function productRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Product ${id}`,
    description: `Description ${id}`,
    category: 'beauty',
    brand: 'Essence',
    sku: `SKU-${id}`,
    price: 9.99,
    discountPercentage: 7.17,
    rating: 4.94,
    stock: 5,
    minimumOrderQuantity: 24,
    availabilityStatus: 'Low Stock',
    weight: 2,
    dimensions: { width: 23.17, height: 14.43, depth: 28.01 },
    warrantyInformation: '1 month warranty',
    shippingInformation: 'Ships in 1 month',
    returnPolicy: '30 days return policy',
    barcode: '9164035109868',
    qrCode: 'https://example.com/qr.png',
    thumbnail: 'https://example.com/thumb.png',
    images: [{ id: 1, url: 'https://example.com/1.png', position: 0 }],
    reviewCount: 1,
    reviews: [
      {
        id: 1,
        rating: 5,
        comment: 'Great',
        date: new Date('2025-05-23T08:56:21.618Z'),
        reviewerName: 'Eleanor Collins',
        reviewerEmail: 'eleanor.collins@x.dummyjson.com',
      },
    ],
    tags: [{ id: 1, name: 'beauty' }],
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

// In-memory stand-in for the node-redis client, covering the calls CacheService makes
// When isReady is false every command rejects, like node-redis with disableOfflineQueue
export function fakeRedis(opts: { isReady?: boolean; getFails?: boolean } = {}) {
  const isReady = opts.isReady ?? true;
  const store = new Map<string, string>();
  const offline = () => {
    if (!isReady) throw new Error('The client is closed');
  };
  const client = {
    async get(key: string): Promise<string | null> {
      offline();
      if (opts.getFails) throw new Error('connection lost');
      return store.has(key) ? store.get(key)! : null;
    },
    async set(key: string, value: string): Promise<string> {
      offline();
      store.set(key, value); // TTL ignored
      return 'OK';
    },
    async del(keys: string | string[]): Promise<number> {
      offline();
      let n = 0;
      for (const k of Array.isArray(keys) ? keys : [keys]) if (store.delete(k)) n++;
      return n;
    },
    async incr(key: string): Promise<number> {
      offline();
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return next;
    },
  };
  return { isReady, client } as unknown as RedisService;
}

// Postgres duplicate-key error, shaped like what the pg driver throws
export function uniqueViolation(detail?: string) {
  const driverError = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    ...(detail === undefined ? {} : { detail }),
  });
  return new QueryFailedError('INSERT INTO "products"', [], driverError);
}

export function queryFailed(code: string) {
  const driverError = Object.assign(new Error('db error'), { code });
  return new QueryFailedError('INSERT INTO "products"', [], driverError);
}

type Row = ReturnType<typeof productRow>;

export interface FakeDb {
  // what productRepo.findOne returns for a given id (null = not in the db)
  findOne: (id: number) => Row | null;
  // what productRepo.findAndCount returns (called once per list MISS)
  findAndCount: () => [unknown[], number];
  // what manager.findOneBy(Product, where) returns inside update's transaction
  managerFindOneBy: (where: Record<string, unknown>) => Record<string, unknown> | null;
  // what manager.save does inside the transaction (throw to simulate a db error)
  managerSave: (entity: any) => unknown;
}

export function makeService(
  db: Partial<FakeDb> = {},
  redis: RedisService = fakeRedis(),
  // optional real-ish repo (see products.memrepo.ts); its findAndCount replaces the canned one
  repo?: { findAndCount: (opts: any) => Promise<[unknown[], number]> },
) {
  const cfg: FakeDb = {
    findOne: () => null,
    findAndCount: () => [[], 0],
    managerFindOneBy: () => null,
    managerSave: (entity) => ({ ...entity, id: 1 }),
    ...db,
  };

  const productRepo = {
    async findOne(opts: { where: { id: number } }) {
      return cfg.findOne(opts.where.id);
    },
    async findAndCount(opts: unknown) {
      return repo ? repo.findAndCount(opts) : cfg.findAndCount();
    },
    async existsBy() {
      return false; // every generated barcode is free
    },
    async delete() {
      return { affected: 1, raw: [] };
    },
  };

  const manager = {
    create(_entity: unknown, plain: unknown) {
      return plain;
    },
    async findBy() {
      return [];
    },
    async findOneBy(_entity: unknown, where: Record<string, unknown>) {
      return cfg.managerFindOneBy(where);
    },
    async delete() {
      return { affected: 0, raw: [] };
    },
    async save(entity: unknown) {
      return cfg.managerSave(entity);
    },
  };

  const dataSource = {
    async transaction<T>(work: (m: typeof manager) => Promise<T>): Promise<T> {
      return work(manager);
    },
  };

  return new ProductsService(
    productRepo as any,
    {} as any, // tagRepo is not used by the service methods
    dataSource as any,
    new CacheService(redis),
  );
}

// await a promise that must reject, and hand back the error for detailed checks
export async function rejection(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

// HIT returns what came out of JSON.parse, MISS returns live objects (Date etc.)
export const asJson = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));
