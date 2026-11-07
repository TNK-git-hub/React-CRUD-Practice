import 'reflect-metadata';
import { Product } from '../../src/products/product.entity';
import { Review } from '../../src/products/review.entity';
import { ProductsService } from '../../src/products/products.service';
import { CacheService } from '../../src/redis/cache.service';
import { RedisService } from '../../src/redis/redis.service';
import { fakeRedis, productRow } from './products.fakes';

// A tiny in-memory "database" for addReview tests.
// It stands in for Postgres only: tests read the final state (rows, ratings, cache HIT/MISS),
// never "which method was called", so any sane way of computing the average works
// (find / findBy / count / average / sum). A query builder is NOT supported on purpose:
// if the implementation needs one, tell the orchestrator instead of guessing.

interface ReviewRecord {
  productId: number;
  row: {
    id: number;
    rating: number;
    comment: string | null;
    date: Date;
    reviewerName: string;
    reviewerEmail: string;
  };
}

interface State {
  products: Map<number, Record<string, any>>;
  reviews: ReviewRecord[];
  nextReviewId: number;
}

export interface WorldOptions {
  // products that exist, with the ratings of their reviews already stored (ids 1, 2, ...)
  products?: Array<{ id: number; ratings?: number[]; rating?: number }>;
  // make writing the product row (save or update) throw, after the review row is already stored
  failProductWrite?: Error;
  // what productRepo.findAndCount returns on each list MISS
  findAndCount?: () => [unknown[], number];
  redis?: RedisService;
}

const clone = <T>(v: T): T => structuredClone(v);
const productIdOf = (r: any): number | undefined => r?.product?.id ?? r?.productId;

function matchesReview(rec: ReviewRecord, where: any = {}): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'product') return rec.productId === value?.id;
    if (key === 'productId') return rec.productId === value;
    return (rec.row as any)[key] === value;
  });
}

function matchesProduct(p: Record<string, any>, where: any = {}): boolean {
  return Object.entries(where).every(([key, value]) => p[key] === value);
}

export function makeWorld(opts: WorldOptions = {}) {
  const state: State = { products: new Map(), reviews: [], nextReviewId: 1 };

  for (const { id, ratings = [], rating = 4.94 } of opts.products ?? [{ id: 1 }]) {
    state.products.set(id, { ...productRow(id), rating, reviews: undefined, reviewCount: undefined });
    for (const r of ratings) {
      state.reviews.push({
        productId: id,
        row: {
          id: state.nextReviewId++,
          rating: r,
          comment: null,
          date: new Date('2025-01-01T00:00:00.000Z'),
          reviewerName: 'Seed',
          reviewerEmail: 'seed@example.com',
        },
      });
    }
  }

  const reviewsOf = (where: any) => state.reviews.filter((rec) => matchesReview(rec, where));
  const asEntity = (rec: ReviewRecord) => Object.assign(new Review(), clone(rec.row));

  const writeProduct = (id: number, patch: Record<string, any>) => {
    if (opts.failProductWrite) throw opts.failProductWrite;
    const current = state.products.get(id);
    if (!current) return;
    const { reviews: _r, images: _i, tags: _t, reviewCount: _c, ...columns } = patch;
    state.products.set(id, { ...current, ...columns });
  };

  const entityName = (entity: unknown) => (entity === Review ? 'Review' : entity === Product ? 'Product' : 'Other');

  const manager = {
    create(Entity: new () => object, plain: Record<string, unknown>) {
      return Object.assign(new Entity(), plain);
    },

    async save(a: any, b?: any) {
      // supports save(entity) and save(Entity, plain)
      const entity = typeof a === 'function' ? Object.assign(new a(), b) : a;
      if (Array.isArray(entity)) return Promise.all(entity.map((e) => manager.save(e)));

      if (entity instanceof Review) {
        const productId = productIdOf(entity);
        if (productId === undefined || !state.products.has(productId)) {
          throw new Error('foreign key violation: review without an existing product');
        }
        if (entity.date === undefined || entity.date === null) {
          throw new Error('null value in column "date" violates not-null constraint');
        }
        entity.id = state.nextReviewId++;
        state.reviews.push({
          productId,
          row: {
            id: entity.id,
            rating: entity.rating,
            comment: entity.comment ?? null,
            date: entity.date,
            reviewerName: entity.reviewerName,
            reviewerEmail: entity.reviewerEmail,
          },
        });
        return entity;
      }
      if (entity instanceof Product || (entity && typeof entity.id === 'number' && state.products.has(entity.id))) {
        writeProduct(entity.id, entity);
        return entity;
      }
      return entity;
    },

    async update(Entity: unknown, criteria: any, patch: Record<string, any>) {
      if (entityName(Entity) === 'Product') {
        const id = typeof criteria === 'object' ? criteria.id : criteria;
        writeProduct(id, patch);
      }
      return { affected: 1, raw: [], generatedMaps: [] };
    },

    async findOneBy(Entity: unknown, where: any) {
      if (entityName(Entity) === 'Product') {
        const hit = [...state.products.values()].find((p) => matchesProduct(p, where));
        return hit ? Object.assign(new Product(), clone(hit)) : null;
      }
      const hit = reviewsOf(where)[0];
      return hit ? asEntity(hit) : null;
    },
    async findOne(Entity: unknown, options: { where?: any }) {
      return manager.findOneBy(Entity, options?.where);
    },
    async existsBy(Entity: unknown, where: any) {
      return (await manager.findOneBy(Entity, where)) !== null;
    },
    async exists(Entity: unknown, options: { where?: any }) {
      return (await manager.findOneBy(Entity, options?.where)) !== null;
    },

    async findBy(Entity: unknown, where: any) {
      if (entityName(Entity) === 'Review') return reviewsOf(where).map(asEntity);
      return []; // tags: none exist
    },
    async find(Entity: unknown, options: { where?: any } = {}) {
      return manager.findBy(Entity, options.where);
    },
    async countBy(Entity: unknown, where: any) {
      return entityName(Entity) === 'Review' ? reviewsOf(where).length : 0;
    },
    async count(Entity: unknown, options: { where?: any } = {}) {
      return manager.countBy(Entity, options.where);
    },
    async sum(Entity: unknown, column: string, where: any) {
      if (entityName(Entity) !== 'Review') return null;
      const rows = reviewsOf(where);
      return rows.length === 0 ? null : rows.reduce((s, rec) => s + (rec.row as any)[column], 0);
    },
    async average(Entity: unknown, column: string, where: any) {
      if (entityName(Entity) !== 'Review') return null;
      const rows = reviewsOf(where);
      return rows.length === 0 ? null : rows.reduce((s, rec) => s + (rec.row as any)[column], 0) / rows.length;
    },

    async delete() {
      return { affected: 0, raw: [] };
    },
  };

  // all-or-nothing: when `work` throws, every change made inside is undone
  const dataSource = {
    async transaction<T>(workOrLevel: any, maybeWork?: any): Promise<T> {
      const work = typeof workOrLevel === 'function' ? workOrLevel : maybeWork;
      const snapshot = clone({ products: [...state.products], reviews: state.reviews, next: state.nextReviewId });
      try {
        return await work(manager);
      } catch (err) {
        state.products = new Map(snapshot.products);
        state.reviews = snapshot.reviews;
        state.nextReviewId = snapshot.next;
        throw err;
      }
    },
  };

  // what GET /products/:id reads: the stored product with its reviews ordered by id ASC
  const productRepo = {
    async findOne(options: { where: { id: number } }) {
      const p = state.products.get(options.where.id);
      if (!p) return null;
      const reviews = reviewsOf({ productId: p.id })
        .map((rec) => clone(rec.row))
        .sort((x, y) => x.id - y.id);
      return { ...clone(p), reviews, reviewCount: reviews.length };
    },
    async findAndCount() {
      return (opts.findAndCount ?? (() => [[], 0] as [unknown[], number]))();
    },
    async findOneBy(where: any) {
      return manager.findOneBy(Product, where);
    },
    async existsBy(where: any) {
      // barcode lookups from create(): every barcode is free; id lookups use the store
      return where?.id !== undefined ? state.products.has(where.id) : false;
    },
    async delete() {
      return { affected: 1, raw: [] };
    },
  };

  const service = new ProductsService(
    productRepo as any,
    {} as any,
    dataSource as any,
    new CacheService(opts.redis ?? fakeRedis()),
  );

  return {
    service,
    // final-state views for assertions
    reviewsOf: (productId: number) =>
      state.reviews.filter((r) => r.productId === productId).map((r) => clone(r.row)),
    allReviewCount: () => state.reviews.length,
    storedRating: (productId: number) => state.products.get(productId)?.rating as number,
  };
}

export const validReview = {
  rating: 4,
  reviewerName: 'Ann Lee',
  reviewerEmail: 'ann@example.com',
  comment: 'Works well',
};
