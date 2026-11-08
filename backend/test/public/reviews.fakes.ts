import 'reflect-metadata';
import { Product } from '../../src/products/product.entity';
import { Review } from '../../src/products/review.entity';
import { ProductsService } from '../../src/products/products.service';
import { CacheService } from '../../src/redis/cache.service';
import { RedisService } from '../../src/redis/redis.service';
import { fakeRedis } from './products.fakes';

export interface StoredReview {
  id: number;
  productId: number;
  rating: number;
  comment: string | null;
  date: Date;
  reviewerName: string;
  reviewerEmail: string;
}

export interface StoredProduct {
  id: number;
  rating: number;
}

// Stateful in-memory stand-in for Postgres (only the DB is faked, never the service).
// It accepts the common TypeORM ways of reading reviews / writing the rating, so the tests
// do not depend on how addReview is implemented. Tests only look at the final state.
export function makeReviewService(
  opts: {
    products?: StoredProduct[];
    reviews?: Omit<StoredReview, 'id'>[];
    redis?: RedisService;
    saveFails?: boolean;
  } = {},
) {
  const products = new Map<number, StoredProduct>();
  for (const p of opts.products ?? []) products.set(p.id, { ...p });
  const reviews: StoredReview[] = [];
  let nextId = 1;
  for (const r of opts.reviews ?? []) reviews.push({ ...r, id: nextId++ });
  let listLoads = 0;

  const reviewsOf = (productId: number) =>
    reviews.filter((r) => r.productId === productId).sort((a, b) => a.id - b.id);
  const publicReview = ({ productId: _p, ...rest }: StoredReview) => ({ ...rest });
  const idOfWhere = (where: any): number | undefined =>
    where?.id ?? where?.product?.id ?? where?.productId;

  // a product as TypeORM would hand it out (reviews joined when asked)
  const productRow = (id: number, withReviews: boolean) => {
    const p = products.get(id);
    if (!p) return null;
    const rs = reviewsOf(id);
    return {
      id,
      title: `Product ${id}`,
      description: 'd',
      category: 'beauty',
      brand: 'b',
      sku: `SKU-${id}`,
      price: 1,
      discountPercentage: 0,
      rating: p.rating,
      stock: 1,
      minimumOrderQuantity: 1,
      availabilityStatus: 'In Stock',
      weight: 1,
      dimensions: { width: 1, height: 1, depth: 1 },
      warrantyInformation: 'w',
      shippingInformation: 's',
      returnPolicy: 'r',
      barcode: '1',
      qrCode: 'q',
      thumbnail: 't',
      images: [],
      tags: [],
      reviewCount: rs.length,
      reviews: rs.map(publicReview),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    };
  };

  const saveOne = (entity: any, entityClass?: unknown) => {
    if (opts.saveFails) throw new Error('db write failed');
    const isReview =
      entityClass === Review || (entityClass === undefined && 'reviewerEmail' in entity);
    if (isReview) {
      const productId = entity.product?.id ?? entity.productId;
      if (!products.has(productId)) throw new Error('FK violation: product does not exist');
      const stored: StoredReview = {
        id: nextId++,
        productId,
        rating: entity.rating,
        comment: entity.comment ?? null,
        date: entity.date,
        reviewerName: entity.reviewerName,
        reviewerEmail: entity.reviewerEmail,
      };
      reviews.push(stored);
      return { ...entity, id: stored.id };
    }
    // a product: only the rating column matters here
    if (!products.has(entity.id)) throw new Error('unknown product');
    products.get(entity.id)!.rating = Number(entity.rating);
    return entity;
  };

  const average = (productId: number) => {
    const rs = reviewsOf(productId);
    return rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;
  };

  const queryBuilder = () => {
    let pid: number | undefined;
    const qb: any = {
      select: () => qb,
      addSelect: () => qb,
      from: () => qb,
      where: (_c: string, params?: Record<string, unknown>) => {
        if (params) pid = Number(Object.values(params)[0]);
        return qb;
      },
      andWhere: () => qb,
      // Postgres returns AVG() as a string, or null for no rows
      getRawOne: async () => {
        const a = pid === undefined ? null : average(pid);
        return { avg: a === null ? null : String(a), average: a === null ? null : String(a) };
      },
      getRawMany: async () => (pid === undefined ? [] : reviewsOf(pid).map((r) => ({ rating: r.rating }))),
      getMany: async () => (pid === undefined ? [] : reviewsOf(pid).map(publicReview)),
      getCount: async () => (pid === undefined ? 0 : reviewsOf(pid).length),
    };
    return qb;
  };

  const readReviews = async (_entity: unknown, o: any) => {
    const id = idOfWhere(o?.where ?? o);
    return id === undefined ? [] : reviewsOf(id).map(publicReview);
  };

  const manager: any = {
    create: (_entity: unknown, plain: unknown) => plain,
    async findOneBy(entity: unknown, where: any) {
      return entity === Product ? productRow(where.id, false) : null;
    },
    async findOne(entity: unknown, o: any) {
      return entity === Product ? productRow(idOfWhere(o?.where ?? o)!, true) : null;
    },
    async exists(entity: unknown, o: any) {
      return entity === Product && products.has(idOfWhere(o?.where ?? o)!);
    },
    async existsBy(entity: unknown, where: any) {
      return entity === Product && products.has(idOfWhere(where)!);
    },
    async find(entity: unknown, o: any) {
      return entity === Review ? readReviews(entity, o) : [];
    },
    async findBy(entity: unknown, where: any) {
      return entity === Review ? readReviews(entity, { where }) : [];
    },
    async count(_e: unknown, o: any) {
      return reviewsOf(idOfWhere(o?.where ?? o)!).length;
    },
    async average(_e: unknown, _col: string, where: any) {
      const a = average(idOfWhere(where)!);
      return a === null ? null : String(a);
    },
    async update(entity: unknown, criteria: any, partial: any) {
      if (opts.saveFails) throw new Error('db write failed');
      const id = typeof criteria === 'number' ? criteria : idOfWhere(criteria);
      if (entity === Product && products.has(id!) && partial.rating !== undefined) {
        products.get(id!)!.rating = Number(partial.rating);
      }
      return { affected: 1, raw: [] };
    },
    async insert(entity: unknown, value: any) {
      const saved = saveOne(value, entity);
      return { identifiers: [{ id: saved.id }], raw: [] };
    },
    async save(a: any, b?: any) {
      return typeof a === 'function' || typeof a === 'string' ? saveOne(b, a) : saveOne(a);
    },
    async delete() {
      return { affected: 0, raw: [] };
    },
    createQueryBuilder: () => queryBuilder(),
    getRepository: () => manager,
  };

  const productRepo = {
    async findOne(o: { where: { id: number } }) {
      return productRow(o.where.id, true);
    },
    // every load returns a different page so a stale HIT is distinguishable
    async findAndCount() {
      listLoads++;
      return [[{ id: 100 + listLoads }], listLoads] as [unknown[], number];
    },
    async existsBy() {
      return false;
    },
    async delete() {
      return { affected: 1, raw: [] };
    },
  };

  const dataSource = {
    async transaction<T>(work: (m: typeof manager) => Promise<T>): Promise<T> {
      // snapshot so a thrown error rolls everything back like a real transaction
      const snap = {
        reviews: reviews.map((r) => ({ ...r })),
        products: [...products.entries()].map(([k, v]) => [k, { ...v }] as const),
        nextId,
      };
      try {
        return await work(manager);
      } catch (err) {
        reviews.splice(0, reviews.length, ...snap.reviews);
        products.clear();
        for (const [k, v] of snap.products) products.set(k, v);
        nextId = snap.nextId;
        throw err;
      }
    },
    createQueryBuilder: () => queryBuilder(),
    manager,
  };

  const svc = new ProductsService(
    productRepo as any,
    {} as any,
    dataSource as any,
    new CacheService(opts.redis ?? fakeRedis()),
  );

  return {
    svc,
    reviews: () => reviews.map((r) => ({ ...r })),
    ratingOf: (id: number) => products.get(id)?.rating,
  };
}
