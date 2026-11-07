import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { fakeRedis, rejection } from './products.fakes';
import { makeWorld, validReview } from './reviews.fakes';

const Q = { q: 'phone', limit: 10, skip: 0, sortBy: 'rating', order: 'desc' } as QueryProductDto;
const dto = (over: Record<string, unknown> = {}) => ({ ...validReview, ...over }) as CreateReviewDto;

// every list load returns a different page, so a stale HIT can be told apart from a fresh MISS
const countingList = () => {
  let calls = 0;
  return () => {
    calls++;
    return [[{ id: 100 + calls }], calls] as [unknown[], number];
  };
};

const twoProducts = () => ({ products: [{ id: 1, ratings: [5, 4], rating: 4.5 }, { id: 2, ratings: [3] }] });

describe('ProductsService.addReview cache invalidation', () => {
  // bug caught: cache.del(detailKey) forgotten -> old rating and reviews served for 60s
  it('the next findOne of that product is a MISS', async () => {
    const w = makeWorld(twoProducts());
    expect((await w.service.findOne(1)).cache).toBe('MISS');
    expect((await w.service.findOne(1)).cache).toBe('HIT');

    await w.service.addReview(1, dto());

    expect((await w.service.findOne(1)).cache).toBe('MISS');
  });

  // bug caught: cache cleared before the commit and refilled with the old data
  it('the fresh MISS carries the new rating', async () => {
    const w = makeWorld(twoProducts());
    await w.service.findOne(1);

    await w.service.addReview(1, dto({ rating: 4 }));
    const after = await w.service.findOne(1);

    expect(after.cache).toBe('MISS');
    expect(after.data.rating).toBe(4.33);
    expect((await w.service.findOne(1)).data.rating).toBe(4.33); // and the refreshed value is cached
  });

  // bug caught: invalidateLists forgotten -> lists sorted by rating stay stale for 30s
  it('a list cached before is a MISS afterwards', async () => {
    const w = makeWorld({ ...twoProducts(), findAndCount: countingList() });
    expect((await w.service.findAll(Q)).cache).toBe('MISS');
    expect((await w.service.findAll(Q)).cache).toBe('HIT');

    await w.service.addReview(1, dto());

    const list = await w.service.findAll(Q);
    expect(list.cache).toBe('MISS');
    expect(list.data.total).toBe(2); // second load from the db
  });

  // bug caught: version bumped only once / key deleted instead of versioned
  it('every review invalidates the list, not only the first', async () => {
    const w = makeWorld({ ...twoProducts(), findAndCount: countingList() });
    await w.service.findAll(Q);

    await w.service.addReview(1, dto());
    expect((await w.service.findAll(Q)).cache).toBe('MISS');
    expect((await w.service.findAll(Q)).cache).toBe('HIT');

    await w.service.addReview(1, dto());
    const third = await w.service.findAll(Q);
    expect(third.cache).toBe('MISS');
    expect(third.data.total).toBe(3);
  });

  // bug caught: whole cache wiped instead of just the reviewed product's key
  it('another product cached detail stays a HIT', async () => {
    const w = makeWorld(twoProducts());
    await w.service.findOne(2);

    await w.service.addReview(1, dto());

    expect((await w.service.findOne(2)).cache).toBe('HIT');
  });

  // bug caught: cache invalidated before knowing the product exists
  it('missing product -> 404 and cached detail and list stay HITs', async () => {
    const w = makeWorld({ ...twoProducts(), findAndCount: countingList() });
    await w.service.findOne(1);
    await w.service.findAll(Q);

    const err = await rejection(w.service.addReview(999, dto()));

    expect(err).toBeInstanceOf(NotFoundException);
    expect((await w.service.findOne(1)).cache).toBe('HIT');
    const list = await w.service.findAll(Q);
    expect(list.cache).toBe('HIT');
    expect(list.data.total).toBe(1);
  });

  // bug caught: cache invalidated before the commit / in a finally block
  it('a transaction failure leaves cached detail and list in place', async () => {
    const w = makeWorld({
      ...twoProducts(),
      findAndCount: countingList(),
      failProductWrite: new Error('db down'),
    });
    await w.service.findOne(1);
    await w.service.findAll(Q);

    await expect(w.service.addReview(1, dto())).rejects.toThrow('db down');

    expect((await w.service.findOne(1)).cache).toBe('HIT');
    expect((await w.service.findAll(Q)).cache).toBe('HIT');
  });

  // bug caught: a Redis outage breaks the write (cache must fail open)
  it('still saves the review when Redis is not ready', async () => {
    const w = makeWorld({ ...twoProducts(), redis: fakeRedis({ isReady: false }) });

    const res = await w.service.addReview(1, dto({ rating: 4 }));

    expect(res.rating).toBe(4);
    expect(w.reviewsOf(1)).toHaveLength(3);
    expect(w.storedRating(1)).toBe(4.33);
  });
});
