import 'reflect-metadata';
import { Review } from '../../src/products/review.entity';
import { ProductsService } from '../../src/products/products.service';
import { CacheService } from '../../src/redis/cache.service';
import { RedisService } from '../../src/redis/redis.service';
import { fakeRedis, productRow } from './products.fakes';

type AnyRow = Record<string, any>;

export interface ReviewDbOpts {
  products?: AnyRow[]; // product columns (no reviews/images/tags)
  reviews?: Array<AnyRow & { productId: number }>; // existing reviews
  failOn?: 'product' | 'review'; // saving that kind of entity throws
  redis?: RedisService;
}

// Stateful in-memory stand-in for Postgres, only for the review flow.
// It supports several ways the service may read reviews back (find/findBy/average/sum/count),
// so tests do not depend on how the average is computed.
export function makeReviewService(opts: ReviewDbOpts = {}) {
  const products = new Map<number, AnyRow>();
  for (const p of opts.products ?? [{ id: 1 }]) {
    const { reviews, images, tags, reviewCount, ...cols } = productRow(p.id, p) as AnyRow;
    products.set(p.id, cols);
  }
  const reviews: Array<AnyRow & { productId: number }> = (opts.reviews ?? []).map((r) => ({ ...r }));
  let nextId = Math.max(0, ...reviews.map((r) => r.id)) + 1;
  const productSaves: AnyRow[] = [];

  const isReview = (entityOrClass: any, maybe?: any) =>
    entityOrClass === Review ||
    entityOrClass instanceof Review ||
    (typeof entityOrClass !== 'function' && entityOrClass && 'reviewerName' in entityOrClass && maybe === undefined);

  const whereProductId = (where: any): number | undefined =>
    where?.product?.id ?? where?.productId;

  const reviewsOf = (productId?: number) =>
    reviews.filter((r) => productId === undefined || r.productId === productId);

  const strip = (r: AnyRow) => {
    const { productId, product, ...rest } = r;
    return rest;
  };

  const average = (where: any) => {
    const list = reviewsOf(whereProductId(where));
    return list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null;
  };

  const manager: AnyRow = {
    create(_entity: unknown, plain: AnyRow) {
      return { ...plain };
    },
    async findOneBy(entity: any, where: AnyRow) {
      if (entity === Review) return null;
      const p = products.get(where.id);
      return p ? { ...p } : null;
    },
    async findOne(entity: any, o: AnyRow) {
      return manager.findOneBy(entity, o?.where ?? {});
    },
    async exists(entity: any, o: AnyRow) {
      return !!(await manager.findOneBy(entity, o?.where ?? {}));
    },
    async find(entity: any, o?: AnyRow) {
      if (entity !== Review) return [];
      return reviewsOf(whereProductId(o?.where)).map((r) => ({ ...r }));
    },
    async findBy(entity: any, where: AnyRow) {
      return manager.find(entity, { where });
    },
    async average(entity: any, column: string, where: AnyRow) {
      if (entity !== Review) return null;
      return column === 'rating' ? average(where) : null;
    },
    async sum(entity: any, column: string, where: AnyRow) {
      if (entity !== Review || column !== 'rating') return null;
      const list = reviewsOf(whereProductId(where));
      return list.length ? list.reduce((s, r) => s + r.rating, 0) : null;
    },
    async count(entity: any, o?: AnyRow) {
      return entity === Review ? reviewsOf(whereProductId(o?.where ?? o)).length : 0;
    },
    async countBy(entity: any, where: AnyRow) {
      return manager.count(entity, { where });
    },
    async update(entity: any, criteria: any, partial: AnyRow) {
      if (entity === Review) return { affected: 0, raw: [] };
      const id = typeof criteria === 'object' ? criteria.id : criteria;
      productSaves.push({ id, ...partial });
      if (opts.failOn === 'product') throw new Error('db error: product update');
      products.set(id, { ...products.get(id), ...partial });
      return { affected: 1, raw: [] };
    },
    async save(a: any, b?: any) {
      const entity = b ?? a;
      if (isReview(a, b)) {
        if (opts.failOn === 'review') throw new Error('db error: review insert');
        const saved = entity;
        saved.id = nextId++;
        reviews.push({
          ...saved,
          productId: saved.product?.id ?? saved.productId,
        });
        return saved;
      }
      if (opts.failOn === 'product') throw new Error('db error: product save');
      const { reviews: _r, images: _i, tags: _t, reviewCount: _c, ...cols } = entity;
      productSaves.push({ ...cols });
      products.set(entity.id, { ...products.get(entity.id), ...cols });
      return entity;
    },
    createQueryBuilder() {
      let pid: number | undefined;
      const qb: AnyRow = {
        select: () => qb,
        addSelect: () => qb,
        from: () => qb,
        where: (_s: string, params?: AnyRow) => {
          pid = params ? (Object.values(params)[0] as number) : pid;
          return qb;
        },
        andWhere: () => qb,
        getRawOne: async () => {
          const avg = average({ product: { id: pid } });
          return { avg, average: avg, rating: avg };
        },
      };
      return qb;
    },
  };

  const productRepo = {
    async findOne(o: { where: { id: number } }) {
      const p = products.get(o.where.id);
      if (!p) return null;
      const rs = reviewsOf(o.where.id).sort((a, b) => a.id - b.id).map(strip);
      return {
        ...p,
        images: [{ id: 1, url: 'https://example.com/1.png', position: 0 }],
        tags: [{ id: 1, name: 'beauty' }],
        reviews: rs,
        reviewCount: rs.length,
      };
    },
    async findAndCount() {
      return [[], 0];
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
      return work(manager);
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
    productRating: (id: number) => products.get(id)?.rating as number,
    productColumns: (id: number) => ({ ...products.get(id) }),
    reviewCountOf: (id: number) => reviewsOf(id).length,
    allReviews: () => reviews.map((r) => ({ ...r })),
    productSaves: () => productSaves.slice(),
  };
}
