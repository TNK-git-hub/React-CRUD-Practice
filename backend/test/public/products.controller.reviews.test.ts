import 'reflect-metadata';
import { NotFoundException, ParseIntPipe, RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';
import { ProductsController } from '../../src/products/products.controller';
import { makeReviewService } from './reviews.fakes';

// The method name is not fixed by the task, so find the handler by its route
const handler = () => {
  const proto = ProductsController.prototype as any;
  const name = Object.getOwnPropertyNames(proto).find(
    (n) => n !== 'constructor' && Reflect.getMetadata('path', proto[n]) === ':id/reviews',
  );
  return { proto, name };
};

describe('ProductsController review handler body', () => {
  const body = {
    rating: 4,
    reviewerName: 'Zed',
    reviewerEmail: 'zed@example.com',
  } as CreateReviewDto;

  it('forwards (id, dto) to the service and returns the created review (bug: no call / no return / swapped args)', async () => {
    const db = makeReviewService({ products: [{ id: 7, rating: 1 }], reviews: [] });
    const controller = new ProductsController(db.service);

    const created = await controller.addReview(7, body);

    expect(created).toMatchObject({ rating: 4, reviewerName: 'Zed', reviewerEmail: 'zed@example.com', comment: null });
    expect(created).not.toHaveProperty('product');
    expect(db.allReviews()).toHaveLength(1);
    expect(db.productRating(7)).toBe(4);
  });

  it('lets NotFoundException from the service propagate (bug: error swallowed)', async () => {
    const db = makeReviewService({ products: [{ id: 7, rating: 1 }], reviews: [] });
    const controller = new ProductsController(db.service);

    await expect(controller.addReview(999, body)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.allReviews()).toEqual([]);
  });
});

describe('ProductsController review route', () => {
  it('declares POST :id/reviews (bug: wrong path or HTTP method)', () => {
    const { proto, name } = handler();
    expect(name).toBeDefined();
    expect(Reflect.getMetadata('method', proto[name!])).toBe(RequestMethod.POST);
  });

  it('does not override the default 201 status of POST', () => {
    const { proto, name } = handler();
    expect(name).toBeDefined();
    const code = Reflect.getMetadata('__httpCode__', proto[name!]);
    expect(code === undefined || code === 201).toBe(true);
  });

  it('parses :id with ParseIntPipe (bug: NaN id reaches the db)', () => {
    const { proto, name } = handler();
    expect(name).toBeDefined();
    const args = Reflect.getMetadata('__routeArguments__', ProductsController, name!) ?? {};
    const pipes = Object.values<any>(args).flatMap((a) => a.pipes ?? []);
    const hasParseInt = pipes.some((p) => p === ParseIntPipe || p instanceof ParseIntPipe);
    expect(hasParseInt).toBe(true);
  });
});
