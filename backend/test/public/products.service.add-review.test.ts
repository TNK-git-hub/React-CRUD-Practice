import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { fakeRedis, rejection } from './products.fakes';
import { makeReviewService } from './reviews.fakes';

const Q = { q: 'phone', limit: 10, skip: 0, sortBy: 'rating', order: 'desc' } as QueryProductDto;

const dtoOf = (rating: number, extra: Record<string, unknown> = {}) =>
  ({ rating, reviewerName: 'Ann', reviewerEmail: 'ann@example.com', ...extra }) as unknown as CreateReviewDto;

const old = (productId: number, rating: number) => ({
  productId,
  rating,
  comment: null,
  date: new Date('2025-01-01T00:00:00.000Z'),
  reviewerName: 'Old',
  reviewerEmail: 'old@example.com',
});

afterEach(() => vi.useRealTimers());

describe('ProductsService.addReview rating average', () => {
  // bug caught: new review left out of the average, or average taken before the insert (would give 4.5)
  it('existing 5,4 + new 4 -> 4.33', async () => {
    const { svc, ratingOf } = makeReviewService({
      products: [{ id: 1, rating: 4.94 }],
      reviews: [old(1, 5), old(1, 4)],
    });
    await svc.addReview(1, dtoOf(4));
    expect(ratingOf(1)).toBe(4.33);
  });

  // bug caught: floor/truncate instead of rounding (4.66)
  it('existing 5,5 + new 4 -> 4.67', async () => {
    const { svc, ratingOf } = makeReviewService({
      products: [{ id: 1, rating: 1 }],
      reviews: [old(1, 5), old(1, 5)],
    });
    await svc.addReview(1, dtoOf(4));
    expect(ratingOf(1)).toBe(4.67);
  });

  // bug caught: null average / divide by zero for the first review
  it('no reviews + new 3 -> 3', async () => {
    const { svc, ratingOf } = makeReviewService({ products: [{ id: 1, rating: 4.94 }] });
    await svc.addReview(1, dtoOf(3));
    expect(ratingOf(1)).toBe(3);
  });

  // bug caught: only this product's reviews must count, not other products'
  it('ignores reviews of other products', async () => {
    const { svc, ratingOf } = makeReviewService({
      products: [{ id: 1, rating: 0 }, { id: 2, rating: 5 }],
      reviews: [old(2, 1), old(2, 1), old(1, 5)],
    });
    await svc.addReview(1, dtoOf(3));
    expect(ratingOf(1)).toBe(4);
    expect(ratingOf(2)).toBe(5);
  });

  // bug caught: wrong formula, wrong subset, string rating, bad rounding
  it('stores round2(mean of all ratings) as a number (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { maxLength: 30 }),
        fc.integer({ min: 1, max: 5 }),
        async (existing, added) => {
          const all = [...existing, added];
          const sum = all.reduce((a, b) => a + b, 0);
          // exact-half cases are not specified by the task
          const scaled = (100 * sum) / all.length;
          fc.pre(Math.abs(scaled - Math.floor(scaled) - 0.5) > 1e-9);
          const expected = Math.round(scaled) / 100;

          const { svc, ratingOf } = makeReviewService({
            products: [{ id: 1, rating: 2 }],
            reviews: existing.map((r) => old(1, r)),
          });
          await svc.addReview(1, dtoOf(added));

          const stored = ratingOf(1);
          expect(typeof stored).toBe('number');
          expect(stored).toBe(expected);
        },
      ),
    );
  });
});

describe('ProductsService.addReview result', () => {
  // bug caught: leaking the `product` field, missing keys, comment undefined instead of null
  it('returns exactly the review fields with comment null when none was sent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T05:06:07.000Z'));
    const { svc } = makeReviewService({ products: [{ id: 1, rating: 1 }] });

    const created = await svc.addReview(1, dtoOf(4));

    expect(created).toStrictEqual({
      id: 1,
      rating: 4,
      comment: null,
      date: new Date('2026-03-04T05:06:07.000Z'),
      reviewerName: 'Ann',
      reviewerEmail: 'ann@example.com',
    });
  });

  it('keeps the comment that was sent', async () => {
    const { svc } = makeReviewService({ products: [{ id: 1, rating: 1 }] });
    const created = await svc.addReview(1, dtoOf(4, { comment: 'Nice' }));
    expect(created.comment).toBe('Nice');
  });

  // bug caught: `...dto` spread lets a client-sent date override the server time
  it('ignores a date smuggled into the dto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T05:06:07.000Z'));
    const { svc, reviews } = makeReviewService({ products: [{ id: 1, rating: 1 }] });

    const created = await svc.addReview(1, dtoOf(4, { date: '2000-01-01T00:00:00.000Z' }));

    expect(created.date).toEqual(new Date('2026-03-04T05:06:07.000Z'));
    expect(reviews()[0].date).toEqual(new Date('2026-03-04T05:06:07.000Z'));
  });

  // bug caught: review attached to the wrong product / id lost
  it('stores the review under the right product with a generated id', async () => {
    const { svc, reviews } = makeReviewService({
      products: [{ id: 1, rating: 1 }, { id: 2, rating: 1 }],
      reviews: [old(1, 5)],
    });
    const created = await svc.addReview(2, dtoOf(2));
    expect(created.id).toBe(2);
    expect(reviews().filter((r) => r.productId === 2).map((r) => r.id)).toEqual([2]);
  });

  // bug caught: second average computed from stale data
  it('a second review counts the first one', async () => {
    const { svc, ratingOf } = makeReviewService({ products: [{ id: 1, rating: 1 }] });
    await svc.addReview(1, dtoOf(5));
    await svc.addReview(1, dtoOf(2));
    expect(ratingOf(1)).toBe(3.5);
  });
});

describe('ProductsService.addReview cache', () => {
  // bug caught: detail key not deleted, or the wrong key deleted
  it('next findOne is a MISS with the new rating, review last and count + 1', async () => {
    const { svc } = makeReviewService({ products: [{ id: 1, rating: 4.94 }], reviews: [old(1, 5), old(1, 4)] });
    expect((await svc.findOne(1)).cache).toBe('MISS');
    expect((await svc.findOne(1)).cache).toBe('HIT');

    await svc.addReview(1, dtoOf(4, { reviewerName: 'Newest' }));

    const after = await svc.findOne(1);
    expect(after.cache).toBe('MISS');
    expect(after.data.rating).toBe(4.33);
    expect(after.data.reviewCount).toBe(3);
    expect(after.data.reviews.at(-1)!.reviewerName).toBe('Newest');
  });

  // bug caught: lists (sortable by rating) not invalidated
  it('next findAll with a previously cached query is a MISS, then HIT again', async () => {
    const { svc } = makeReviewService({ products: [{ id: 1, rating: 1 }] });
    expect((await svc.findAll(Q)).cache).toBe('MISS');
    expect((await svc.findAll(Q)).cache).toBe('HIT');

    await svc.addReview(1, dtoOf(4));

    expect((await svc.findAll(Q)).cache).toBe('MISS');
    expect((await svc.findAll(Q)).cache).toBe('HIT');
  });

  // bug caught: wiping too much cache (other products' details)
  it("keeps another product's cached detail", async () => {
    const { svc } = makeReviewService({ products: [{ id: 1, rating: 1 }, { id: 2, rating: 1 }] });
    await svc.findOne(2);

    await svc.addReview(1, dtoOf(4));

    expect((await svc.findOne(2)).cache).toBe('HIT');
  });

  // bug caught: cache cleared before the commit, or the error swallowed
  it('keeps the caches and rethrows when the write fails', async () => {
    const { svc, reviews } = makeReviewService({ products: [{ id: 1, rating: 1 }], saveFails: true });
    await svc.findOne(1);
    await svc.findAll(Q);

    const err = await rejection(svc.addReview(1, dtoOf(4)));

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotFoundException);
    expect(reviews()).toEqual([]);
    expect((await svc.findOne(1)).cache).toBe('HIT');
    expect((await svc.findAll(Q)).cache).toBe('HIT');
  });

  // bug caught: a cache failure breaks the write (fail-open lost)
  it('still works when Redis is down', async () => {
    const { svc, ratingOf } = makeReviewService({
      products: [{ id: 1, rating: 1 }],
      reviews: [old(1, 5), old(1, 4)],
      redis: fakeRedis({ isReady: false }),
    });
    await svc.addReview(1, dtoOf(4));
    expect(ratingOf(1)).toBe(4.33);
  });

  // bug caught: any cache path missed in some sequence of operations
  it('never serves stale data across random add/read sequences (property)', async () => {
    const op = fc.constantFrom('add', 'detail', 'list');
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(op, fc.integer({ min: 1, max: 5 })), { minLength: 1, maxLength: 20 }),
        async (ops) => {
          const { svc } = makeReviewService({ products: [{ id: 1, rating: 1 }] });
          let count = 0;
          let lastRating = 0;
          for (const [kind, rating] of ops) {
            if (kind === 'add') {
              await svc.addReview(1, dtoOf(rating, { reviewerName: `n${count + 1}` }));
              count++;
              lastRating = rating;
            } else if (kind === 'detail') {
              const { data } = await svc.findOne(1);
              expect(data.reviewCount).toBe(count);
              expect(data.reviews).toHaveLength(count);
              if (count > 0) expect(data.reviews.at(-1)!.rating).toBe(lastRating);
            } else {
              await svc.findAll(Q);
            }
          }
          const final = await svc.findOne(1);
          expect(final.data.reviewCount).toBe(count);
        },
      ),
    );
  });
});

describe('ProductsService.addReview on a missing product', () => {
  // bug caught: no 404 (FK error -> 500)
  it('rejects with NotFoundException', async () => {
    const { svc } = makeReviewService({ products: [{ id: 1, rating: 1 }] });
    const err = await rejection(svc.addReview(999, dtoOf(4)));
    expect(err).toBeInstanceOf(NotFoundException);
  });

  // bug caught: insert before the existence check; nothing may be written or cached-invalidated
  it('writes nothing and leaves every cache alone', async () => {
    const { svc, reviews, ratingOf } = makeReviewService({
      products: [{ id: 1, rating: 3.5 }],
      reviews: [old(1, 3), old(1, 4)],
    });
    await svc.findOne(1);
    await svc.findAll(Q);

    await rejection(svc.addReview(999, dtoOf(4)));

    expect(reviews()).toHaveLength(2);
    expect(ratingOf(1)).toBe(3.5);
    expect((await svc.findOne(1)).cache).toBe('HIT');
    expect((await svc.findAll(Q)).cache).toBe('HIT');
  });
});
