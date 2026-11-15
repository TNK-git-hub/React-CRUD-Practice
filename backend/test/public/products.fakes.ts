import 'reflect-metadata';
import { FindOperator, QueryFailedError } from 'typeorm';
import type { FindManyOptions } from 'typeorm';
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
        // nullable like Review.comment in review.entity.ts
        comment: 'Great' as string | null,
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
  findAndCount: (opts: FindManyOptions) => [unknown[], number];
  // what manager.findOneBy(Product, where) returns inside update's transaction
  managerFindOneBy: (where: Record<string, unknown>) => Record<string, unknown> | null;
  // what manager.save does inside the transaction (throw to simulate a db error)
  managerSave: (entity: any) => unknown;
}

export function makeService(db: Partial<FakeDb> = {}, redis: RedisService = fakeRedis()) {
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
    async findAndCount(opts: FindManyOptions) {
      return cfg.findAndCount(opts);
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

// ---- in-memory list repository: really evaluates where / order / skip / take ----

export interface ListRow {
  id: number;
  title: string;
  description: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
}

export function listRow(id: number, price: number, overrides: Partial<ListRow> = {}): ListRow {
  return {
    id,
    title: `Item ${id}`,
    description: `Desc ${id}`,
    price,
    discountPercentage: 0,
    rating: 4,
    stock: 1,
    ...overrides,
  };
}

// exact decimal -> integer cents (BigInt, no float). '010' -> 1000n, '20.00' -> 2000n, '19.99' -> 1999n
const centsOfString = (s: string): bigint => {
  const [whole, frac = ''] = s.trim().split('.');
  return BigInt(whole || '0') * 100n + BigInt((frac + '00').slice(0, 2));
};
const centsOf = (v: unknown): bigint =>
  typeof v === 'number' ? BigInt(Math.round(v * 100)) : centsOfString(String(v));

function matchesOperator(op: FindOperator<unknown>, actual: unknown): boolean {
  const value = op.value as unknown;
  switch (op.type) {
    case 'ilike': {
      const needle = String(value).replace(/^%|%$/g, '').toLowerCase();
      return String(actual).toLowerCase().includes(needle);
    }
    case 'between': {
      const [from, to] = value as [unknown, unknown];
      return centsOf(actual) >= centsOf(from) && centsOf(actual) <= centsOf(to);
    }
    case 'moreThanOrEqual':
      return centsOf(actual) >= centsOf(value);
    case 'lessThanOrEqual':
      return centsOf(actual) <= centsOf(value);
    case 'and':
      return (value as FindOperator<unknown>[]).every((o) => matchesOperator(o, actual));
    default:
      throw new Error(`fake repository does not support operator ${op.type}`);
  }
}

function matchesWhere(row: ListRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (cond instanceof FindOperator) return matchesOperator(cond as FindOperator<unknown>, actual);
    return actual === cond;
  });
}

export function evaluateFind(rows: ListRow[], opts: FindManyOptions): [ListRow[], number] {
  const where = opts.where as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const matched = rows.filter((row) => {
    if (where === undefined) return true;
    if (Array.isArray(where)) return where.some((w) => matchesWhere(row, w));
    return matchesWhere(row, where);
  });
  const order = (opts.order ?? { id: 'ASC' }) as Record<string, string>;
  const sorted = [...matched].sort((a, b) => {
    for (const [key, dir] of Object.entries(order)) {
      const av = (a as unknown as Record<string, unknown>)[key] as number | string;
      const bv = (b as unknown as Record<string, unknown>)[key] as number | string;
      const c = av === bv ? 0 : av < bv ? -1 : 1;
      if (c !== 0) return dir.toLowerCase() === 'desc' ? -c : c;
    }
    return 0;
  });
  const skip = opts.skip ?? 0;
  const page = opts.take === undefined ? sorted.slice(skip) : sorted.slice(skip, skip + opts.take);
  return [page, sorted.length];
}

// Service over a mutable in-memory table. `rows` is live: update() edits it, later lists see the edit.
export function makeListService(rows: ListRow[], redis: RedisService = fakeRedis()) {
  return makeService(
    {
      findAndCount: (opts) => evaluateFind(rows, opts),
      managerFindOneBy: (where) => (rows.find((r) => r.id === where.id) as unknown as Record<string, unknown>) ?? null,
      managerSave: (entity) => entity,
      findOne: (id) => {
        const r = rows.find((x) => x.id === id);
        return r ? productRow(id, { ...r }) : null;
      },
    },
    redis,
  );
}
