import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { fakeRedis, rejection } from './products.fakes';
import { makeReviewService } from './reviews.fakes';

const Q = { q: 'phone', limit: 10, skip: 0, sortBy: 'rating', order: 'desc' } as QueryProductDto;

const dto = (rating: number, extra: Record<string, unknown> = {}) =>
  ({
    rating,
    reviewerName: 'Zed',
    reviewerEmail: 'zed@example.com',
    ...extra,
  }) as CreateReviewDto;

const old = (id: number, rating: number, productId = 1) => ({
  id,
  rating,
  comment: null,
  date: new Date('2025-01-01T00:00:00.000Z'),
  reviewerName: `Old ${id}`,
  reviewerEmail: `old${id}@example.com`,
  productId,
});

afterEach(() => vi.useRealTimers());

describe('ProductsService.addReview: rating average', () => {
  it.each([
    ['existing 5,4 + new 4', [5, 4], 4, 4.33],
    ['existing 5,5 + new 4', [5, 5], 4, 4.67],
    ['no existing + new 3', [], 3, 3],
  ])('%s -> product rating %f (bug: not recomputed / not rounded / truncated / new review left out)', async (_l, existing, rating, expected) => {
    const db = makeReviewService({
      products: [{ id: 1, rating: 4.94 }],
      reviews: existing.map((r, i) => old(i + 1, r)),
    });

    await db.service.addReview(1, dto(rating));

    expect(typeof db.productRating(1)).toBe('number');
    expect(db.productRating(1)).toBe(expected);
  });

  it('property: stored rating is the 2-decimal average of all reviews, within [1,5]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        async (existing, rating) => {
          const db = makeReviewService({ reviews: existing.map((r, i) => old(i + 1, r)) });
          await db.service.addReview(1, dto(rating));

          const all = [...existing, rating];
          const exact = all.reduce((s, r) => s + r, 0) / all.length;
          const stored = db.productRating(1);
          expect(Math.abs(stored - exact)).toBeLessThanOrEqual(0.005 + 1e-9);
          expect(stored).toBeGreaterThanOrEqual(1);
          expect(stored).toBeLessThanOrEqual(5);
          expect(Math.abs(stored * 100 - Math.round(stored * 100))).toBeLessThan(1e-6);
        },
      ),
    );
  });

  it('a second review averages over the first one too (bug: only counts reviews loaded earlier)', async () => {
    const db = makeReviewService({ reviews: [old(1, 5)] });

    await db.service.addReview(1, dto(4)); // (5+4)/2 = 4.5
    expect(db.productRating(1)).toBe(4.5);
    await db.service.addReview(1, dto(1)); // (5+4+1)/3 = 3.33
    expect(db.productRating(1)).toBe(3.33);
  });

  it('only counts reviews of this product (bug: averages the whole reviews table)', async () => {
    const db = makeReviewService({
      products: [{ id: 1 }, { id: 2, rating: 2 }],
      reviews: [old(1, 5, 1), old(2, 1, 2), old(3, 1, 2)],
    });

    await db.service.addReview(1, dto(3)); // (5+3)/2 = 4

    expect(db.productRating(1)).toBe(4);
    expect(db.productRating(2)).toBe(2);
  });

  it('leaves the other product columns untouched', async () => {
    const db = makeReviewService({ products: [{ id: 1, title: 'Keep me', price: 12.5, stock: 7 }] });

    await db.service.addReview(1, dto(5));

    expect(db.productColumns(1)).toMatchObject({ title: 'Keep me', price: 12.5, stock: 7 });
  });
});

describe('ProductsService.addReview: returned review', () => {
  it('returns exactly the review columns, with no product field (bug: leaks the entity relation)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T05:06:07.000Z'));
    const db = makeReviewService({ reviews: [old(1, 5), old(2, 4)] });

    const created = await db.service.addReview(1, dto(4, { comment: 'Solid' }));

    expect(created).toStrictEqual({
      id: 3,
      rating: 4,
      comment: 'Solid',
      date: new Date('2026-03-04T05:06:07.000Z'),
      reviewerName: 'Zed',
      reviewerEmail: 'zed@example.com',
    });
  });

  it('comment is null when not sent (bug: undefined disappears from the JSON)', async () => {
    const db = makeReviewService();

    const created = await db.service.addReview(1, dto(3));

    expect(created.comment).toBeNull();
  });

  it('ignores a date smuggled into the dto and uses server time (bug: spreads dto into entity)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const db = makeReviewService();

    const created = await db.service.addReview(1, dto(3, { date: new Date('2000-01-01T00:00:00.000Z') }));

    expect(created.date).toEqual(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('stores the new review with an id above all existing ones, tied to the product', async () => {
    const db = makeReviewService({ products: [{ id: 1 }, { id: 2 }], reviews: [old(7, 5, 1), old(9, 5, 2)] });

    const created = await db.service.addReview(1, dto(2));

    expect(created.id).toBeGreaterThan(9);
    const stored = db.allReviews().filter((r) => r.productId === 1);
    expect(stored.map((r) => r.id)).toEqual([7, created.id]);
  });
});

describe('ProductsService.addReview: product not found', () => {
  it('rejects with NotFoundException and writes nothing (bug: inserts review before checking product)', async () => {
    const db = makeReviewService({ products: [{ id: 1 }] });

    const err = await rejection(db.service.addReview(999, dto(3)));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.message).toBe('Product 999 not found');
    expect(db.allReviews()).toEqual([]);
    expect(db.productSaves()).toEqual([]);
  });
});

describe('ProductsService.addReview: GET /products/:id afterwards', () => {
  it('shows the new review last, the new rating and reviewCount + 1', async () => {
    const db = makeReviewService({ reviews: [old(1, 5), old(2, 4)] });
    const before = await db.service.findOne(1);
    expect(before.data.reviewCount).toBe(2);

    await db.service.addReview(1, dto(4, { comment: 'Last one' }));

    const after = await db.service.findOne(1);
    expect(after.data.rating).toBe(4.33);
    expect(after.data.reviewCount).toBe(3);
    expect(after.data.reviews.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(after.data.reviews[2].comment).toBe('Last one');
  });
});

describe('ProductsService.addReview: cache', () => {
  it('next findOne is a MISS with fresh data (bug: detail cache key not deleted)', async () => {
    const db = makeReviewService({ reviews: [old(1, 5)] });
    expect((await db.service.findOne(1)).cache).toBe('MISS');
    expect((await db.service.findOne(1)).cache).toBe('HIT');

    await db.service.addReview(1, dto(3));

    const res = await db.service.findOne(1);
    expect(res.cache).toBe('MISS');
    expect(res.data.reviewCount).toBe(2);
  });

  it('every committed review invalidates cached lists, not only the first (bug: list version not bumped)', async () => {
    const db = makeReviewService();
    expect((await db.service.findAll(Q)).cache).toBe('MISS');
    expect((await db.service.findAll(Q)).cache).toBe('HIT');

    await db.service.addReview(1, dto(3));
    expect((await db.service.findAll(Q)).cache).toBe('MISS');
    expect((await db.service.findAll(Q)).cache).toBe('HIT');

    await db.service.addReview(1, dto(4));
    expect((await db.service.findAll(Q)).cache).toBe('MISS');
  });

  it("keeps another product's cached detail (bug: wipes every detail key)", async () => {
    const db = makeReviewService({ products: [{ id: 1 }, { id: 2 }] });
    await db.service.findOne(2);

    await db.service.addReview(1, dto(3));

    expect((await db.service.findOne(2)).cache).toBe('HIT');
  });

  it('a 404 leaves cached detail and list in place (bug: cache cleared on failure)', async () => {
    const db = makeReviewService();
    await db.service.findOne(1);
    await db.service.findAll(Q);

    await rejection(db.service.addReview(999, dto(3)));

    expect((await db.service.findOne(1)).cache).toBe('HIT');
    expect((await db.service.findAll(Q)).cache).toBe('HIT');
  });

  it.each(['review', 'product'] as const)(
    'a failing %s write rejects and leaves the cache in place (bug: cache cleared before commit)',
    async (failOn) => {
      const db = makeReviewService({ failOn, reviews: [old(1, 5)] });
      await db.service.findOne(1);
      await db.service.findAll(Q);

      await rejection(db.service.addReview(1, dto(3)));

      expect((await db.service.findOne(1)).cache).toBe('HIT');
      expect((await db.service.findAll(Q)).cache).toBe('HIT');
    },
  );

  it('still succeeds when Redis is down (bug: cache error breaks the write)', async () => {
    const db = makeReviewService({ redis: fakeRedis({ isReady: false }), reviews: [old(1, 5)] });

    const created = await db.service.addReview(1, dto(4));

    expect(created.rating).toBe(4);
    expect(db.productRating(1)).toBe(4.5);
  });
});
