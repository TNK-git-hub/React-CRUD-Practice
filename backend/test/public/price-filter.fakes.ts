import 'reflect-metadata';
import { FindOperator } from 'typeorm';
import type { DataSource, Repository } from 'typeorm';
import { ProductsService } from '../../src/products/products.service';
import type { QueryProductDto } from '../../src/products/dto/query-product.dto';
import type { Product } from '../../src/products/product.entity';
import { CacheService } from '../../src/redis/cache.service';
import type { RedisService } from '../../src/redis/redis.service';
import { fakeRedis, productRow } from './products.fakes';

export type Row = ReturnType<typeof productRow>;

// The query as the controller hands it to the service once the DTO has accepted it:
// minPrice / maxPrice are validated strings (001-ADR-1)
export interface PriceQuery {
  q?: string;
  limit?: number;
  skip?: number;
  sortBy?: 'title' | 'price' | 'rating' | 'stock';
  order?: 'asc' | 'desc';
  minPrice?: string;
  maxPrice?: string;
}

export const query = (opts: PriceQuery = {}): QueryProductDto =>
  ({ limit: 10, skip: 0, order: 'asc', ...opts }) as QueryProductDto;

// Exact decimal -> integer cents, like Postgres numeric(10,2) compares: no float, no rounding
export function toCents(value: unknown): bigint {
  const text = String(value).trim();
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

export function cents(n: number): string {
  const whole = Math.floor(n / 100);
  return `${whole}.${String(n % 100).padStart(2, '0')}`;
}

// A product row whose price is a 2-decimal string, as Postgres hands numeric(10,2) to node
export function priced(id: number, price: string, overrides: Record<string, unknown> = {}): Row {
  return productRow(id, { price, ...overrides }) as Row;
}

function matchesOperator(op: FindOperator<unknown>, actual: unknown): boolean {
  const value = op.value;
  switch (op.type) {
    case 'between': {
      const [from, to] = value as [unknown, unknown];
      return toCents(actual) >= toCents(from) && toCents(actual) <= toCents(to);
    }
    case 'moreThanOrEqual':
      return toCents(actual) >= toCents(value);
    case 'lessThanOrEqual':
      return toCents(actual) <= toCents(value);
    case 'ilike': {
      const needle = String(value).replace(/^%|%$/g, '').toLowerCase();
      return String(actual).toLowerCase().includes(needle);
    }
    default:
      throw new Error(`fake repository does not support the "${op.type}" operator`);
  }
}

function matchesCondition(row: Row, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([field, expected]) => {
    const actual = (row as Record<string, unknown>)[field];
    if (expected instanceof FindOperator) return matchesOperator(expected, actual);
    return actual === expected;
  });
}

type Where = Record<string, unknown> | Record<string, unknown>[] | undefined;
type Order = Record<string, string>;

function compare(a: unknown, b: unknown, field: string): number {
  if (field === 'price') {
    const x = toCents(a);
    const y = toCents(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

// In-memory stand-in for the products table: evaluates where (AND inside an object, OR across an
// array), order, skip and take. Not a mock of the service: the service's own options decide the result.
export function makePriceService(initial: Row[], redis: RedisService = fakeRedis()) {
  const store: Row[] = [...initial];

  const productRepo = {
    async findAndCount(opts: { where?: Where; order?: Order; skip?: number; take?: number }) {
      const conds = opts.where === undefined ? [] : Array.isArray(opts.where) ? opts.where : [opts.where];
      const matched = store.filter((row) => conds.length === 0 || conds.some((c) => matchesCondition(row, c)));
      const keys = Object.entries(opts.order ?? {});
      const sorted = [...matched].sort((a, b) => {
        for (const [field, dir] of keys) {
          const c = compare((a as Record<string, unknown>)[field], (b as Record<string, unknown>)[field], field);
          if (c !== 0) return dir.toLowerCase() === 'desc' ? -c : c;
        }
        return 0;
      });
      const skip = opts.skip ?? 0;
      const page = opts.take === undefined ? sorted.slice(skip) : sorted.slice(skip, skip + opts.take);
      return [page, sorted.length] as [Row[], number];
    },
    async findOne(opts: { where: { id: number } }) {
      return store.find((r) => r.id === opts.where.id) ?? null;
    },
    async existsBy() {
      return false;
    },
    async delete() {
      return { affected: 1, raw: [] };
    },
  };

  const manager = {
    create(_entity: unknown, plain: Record<string, unknown>) {
      return plain;
    },
    async findBy() {
      return [];
    },
    async findOneBy(_entity: unknown, where: { id: number }) {
      return store.find((r) => r.id === where.id) ?? null;
    },
    async delete() {
      return { affected: 0, raw: [] };
    },
    async save(entity: Record<string, unknown>) {
      const id = typeof entity.id === 'number' ? entity.id : Math.max(0, ...store.map((r) => r.id)) + 1;
      if (!store.some((r) => r.id === id)) store.push({ ...productRow(id), ...entity, id } as Row);
      return { ...entity, id };
    },
  };

  const dataSource = {
    async transaction<T>(work: (m: typeof manager) => Promise<T>): Promise<T> {
      return work(manager);
    },
  };

  const service = new ProductsService(
    productRepo as unknown as Repository<Product>,
    {} as unknown as ConstructorParameters<typeof ProductsService>[1], // tagRepo is not used here
    dataSource as unknown as DataSource,
    new CacheService(redis),
  );
  return { service, store };
}
