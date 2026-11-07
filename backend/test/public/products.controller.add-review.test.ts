import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';
import { ProductsController } from '../../src/products/products.controller';
import type { ProductsService } from '../../src/products/products.service';

// A small working stand-in for the service: it stores the review under the product id it was given.
// Limits: this does not check the route, status 201 or ParseIntPipe (those need an HTTP-level test).
function fakeService() {
  const byProduct = new Map<number, Array<Record<string, unknown>>>();
  return {
    byProduct,
    service: {
      async addReview(productId: number, dto: CreateReviewDto) {
        const row = { id: 100 + productId, ...dto };
        byProduct.set(productId, [...(byProduct.get(productId) ?? []), row]);
        return row;
      },
    } as unknown as ProductsService,
  };
}

describe('ProductsController.addReview', () => {
  // bug caught: empty body, missing return, or id and dto swapped
  it('returns the created review and files it under the product id from the URL', async () => {
    const { service, byProduct } = fakeService();
    const controller = new ProductsController(service);
    const dto = { rating: 4, reviewerName: 'Ann Lee', reviewerEmail: 'ann@example.com' } as CreateReviewDto;

    const res = await controller.addReview(7, dto);

    expect(res).toEqual({ id: 107, rating: 4, reviewerName: 'Ann Lee', reviewerEmail: 'ann@example.com' });
    expect(byProduct.get(7)).toHaveLength(1);
    expect(byProduct.size).toBe(1);
  });
});
