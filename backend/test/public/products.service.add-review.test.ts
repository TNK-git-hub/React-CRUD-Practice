import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';
import { rejection } from './products.fakes';
import { makeWorld, validReview } from './reviews.fakes';

const dto = (over: Record<string, unknown> = {}) => ({ ...validReview, ...over }) as CreateReviewDto;

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductsService.addReview: product rating = average of all reviews', () => {
  // bug caught: new review left out of the average, or product's old rating reused
  it('existing 5,4 + new 4 -> stored rating 4.33', async () => {
    const w = makeWorld({ products: [{ id: 1, ratings: [5, 4], rating: 4.5 }] });
    await w.service.addReview(1, dto({ rating: 4 }));
    expect(w.storedRating(1)).toBe(4.33);
  });

  // bug caught: truncation instead of rounding (4.666 -> 4.66)
  it('existing 5,5 + new 4 -> stored rating 4.67', async () => {
    const w = makeWorld({ products: [{ id: 1, ratings: [5, 5], rating: 5 }] });
    await w.service.addReview(1, dto({ rating: 4 }));
    expect(w.storedRating(1)).toBe(4.67);
  });

  // bug caught: dividing by zero / averaging an empty list gives NaN or keeps the seeded rating
  it('no existing reviews + new 3 -> stored rating 3', async () => {
    const w = makeWorld({ products: [{ id: 1, ratings: [], rating: 4.94 }] });
    await w.service.addReview(1, dto({ rating: 3 }));
    expect(w.storedRating(1)).toBe(3);
  });

  // bug caught: wrong mean, float rounding errors, missed/double-counted review, no rounding.
  // The expected value is exact integer arithmetic, rounded half up, independent of the service.
  it('property: stored rating = mean of existing + new ratings, rounded to 2 decimals', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { maxLength: 19 }),
        fc.integer({ min: 1, max: 5 }),
        async (existing, added) => {
          const w = makeWorld({ products: [{ id: 1, ratings: existing }] });
          await w.service.addReview(1, dto({ rating: added }));

          const n = existing.length + 1;
          const sum = existing.reduce((s, r) => s + r, 0) + added;
          const expected = Math.floor((200 * sum + n) / (2 * n)) / 100; // round(sum*100/n) half up

          expect(w.storedRating(1)).toBe(expected);
          expect(w.storedRating(1)).toBeGreaterThanOrEqual(1);
          expect(w.storedRating(1)).toBeLessThanOrEqual(5);
        },
      ),
    );
  });

  // bug caught: other products' reviews mixed into the average
  it('ignores reviews that belong to other products', async () => {
    const w = makeWorld({
      products: [
        { id: 1, ratings: [5, 4] },
        { id: 2, ratings: [1, 1, 1] },
      ],
    });
    await w.service.addReview(1, dto({ rating: 4 }));
    expect(w.storedRating(1)).toBe(4.33);
    expect(w.storedRating(2)).toBe(4.94); // untouched
  });
});

describe('ProductsService.addReview: the created review', () => {
  // bug caught: returning the entity with its `product` relation (cyclic JSON, data leak)
  it('returns exactly { id, rating, comment, date, reviewerName, reviewerEmail } without product', async () => {
    const w = makeWorld({ products: [{ id: 1, ratings: [5, 4] }] });

    const res = await w.service.addReview(1, dto({ rating: 4, comment: 'Nice' }));

    // keys as the client sees them in the JSON body
    expect(Object.keys(JSON.parse(JSON.stringify(res))).sort()).toEqual(
      ['comment', 'date', 'id', 'rating', 'reviewerEmail', 'reviewerName'],
    );
    expect(res).not.toHaveProperty('product');
    expect(res).toMatchObject({
      id: 3, // two seeded reviews had ids 1 and 2
      rating: 4,
      comment: 'Nice',
      reviewerName: 'Ann Lee',
      reviewerEmail: 'ann@example.com',
    });
    expect(res.date).toBeInstanceOf(Date);
  });

  // bug caught: missing `?? null` so the response has comment undefined (field dropped from JSON)
  it('comment is null when it was not sent', async () => {
    const w = makeWorld();
    const { comment: _omit, ...noComment } = validReview;

    const res = await w.service.addReview(1, noComment as CreateReviewDto);

    expect(res.comment).toBeNull();
    expect(w.reviewsOf(1)[0].comment).toBeNull();
  });

  // bug caught: date taken from the client, or left empty (column is NOT NULL)
  it('sets date to the server time and ignores a date sent by the client', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T10:30:00.000Z'));
    const w = makeWorld();

    const res = await w.service.addReview(1, { ...dto(), date: '2000-01-01T00:00:00.000Z' } as any);

    expect(res.date).toEqual(new Date('2026-03-15T10:30:00.000Z'));
    expect(w.reviewsOf(1)[0].date).toEqual(new Date('2026-03-15T10:30:00.000Z'));
  });

  // bug caught: review attached to the wrong product or to none
  it('stores the review under the product from the URL only', async () => {
    const w = makeWorld({ products: [{ id: 1 }, { id: 2 }] });

    await w.service.addReview(2, dto({ reviewerName: 'Zed', rating: 2 }));

    expect(w.reviewsOf(1)).toHaveLength(0);
    expect(w.reviewsOf(2)).toHaveLength(1);
    expect(w.reviewsOf(2)[0]).toMatchObject({ reviewerName: 'Zed', rating: 2 });
  });
});

describe('ProductsService.addReview: failures write nothing', () => {
  // bug caught: review inserted before checking the product (FK error / 500 instead of 404)
  it('missing product -> NotFoundException "Product 999 not found", nothing stored', async () => {
    const w = makeWorld({ products: [{ id: 1, ratings: [5], rating: 5 }] });

    const err = await rejection(w.service.addReview(999, dto()));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.message).toBe('Product 999 not found');
    expect(w.allReviewCount()).toBe(1); // only the seeded one
    expect(w.storedRating(1)).toBe(5);
  });

  // bug caught: no transaction, so a failure after the insert leaves an orphan review
  it('an error after the review was inserted rolls the review back and is re-thrown', async () => {
    const w = makeWorld({
      products: [{ id: 1, ratings: [5, 4], rating: 4.5 }],
      failProductWrite: new Error('db down'),
    });

    await expect(w.service.addReview(1, dto())).rejects.toThrow('db down');

    expect(w.reviewsOf(1)).toHaveLength(2);
    expect(w.storedRating(1)).toBe(4.5);
  });
});
