import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';
import { ProductsController } from '../../src/products/products.controller';
import { inMemoryProducts, makeService, productRow } from './products.fakes';

const pipe = new ValidationPipe({ whitelist: true, transform: true });

// Query string values always arrive as strings
const parse = (query: Record<string, string>) =>
  pipe.transform(query, { type: 'query', metatype: QueryProductDto }) as Promise<any>;

// Full request path: pipe -> controller -> service. A 400 may be thrown at any of the three
// (DTO validator, controller or service), so the tests do not care where the min > max check lives.
const rows = [5, 10, 20, 30].map((price, i) => productRow(i + 1, { price }));
const getProducts = async (query: Record<string, string>) => {
  const dto = await parse(query);
  const controller = new ProductsController(makeService({ findAndCount: inMemoryProducts(rows) }));
  return controller.findAll(dto, { setHeader() {} } as any);
};
const status = async (query: Record<string, string>): Promise<'ok' | 400> => {
  try {
    await getProducts(query);
    return 'ok';
  } catch (e) {
    if (e instanceof BadRequestException) return 400;
    throw e;
  }
};

describe('GET /products minPrice / maxPrice validation', () => {
  it('turns numeric strings (decimals too) into numbers; catches missing @Type or @IsInt', async () => {
    const dto = await parse({ minPrice: '10', maxPrice: '9.99' });
    expect(dto.minPrice).toBe(10);
    expect(dto.maxPrice).toBe(9.99);
  });

  it('accepts 0 and keeps it as 0; catches @Min(1) or a falsy check dropping 0', async () => {
    const dto = await parse({ minPrice: '0', maxPrice: '0' });
    expect(dto.minPrice).toBe(0);
    expect(dto.maxPrice).toBe(0);
  });

  it('leaves both undefined when absent and accepts just one of them; catches missing @IsOptional or 0/NaN defaults', async () => {
    const none = await parse({});
    expect(none.minPrice).toBeUndefined();
    expect(none.maxPrice).toBeUndefined();

    const onlyMin = await parse({ minPrice: '5' });
    expect(onlyMin.minPrice).toBe(5);
    expect(onlyMin.maxPrice).toBeUndefined();

    const onlyMax = await parse({ maxPrice: '5' });
    expect(onlyMax.maxPrice).toBe(5);
    expect(onlyMax.minPrice).toBeUndefined();
  });

  it.each([
    ['minPrice=-1', { minPrice: '-1' }],
    ['maxPrice=-5', { maxPrice: '-5' }],
    ['minPrice=-0.01', { minPrice: '-0.01' }],
    ['maxPrice=-0.01', { maxPrice: '-0.01' }],
  ])('rejects %s with 400; catches missing @Min(0)', async (_l, query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['minPrice=abc', { minPrice: 'abc' }],
    ['maxPrice=abc', { maxPrice: 'abc' }],
    ['minPrice=NaN', { minPrice: 'NaN' }],
    ['maxPrice=NaN', { maxPrice: 'NaN' }],
  ])('rejects %s with 400; catches missing @IsNumber (NaN slipping through)', async (_l, query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still validates existing params next to minPrice; catches broken old validation', async () => {
    await expect(parse({ minPrice: '1', limit: '0' })).rejects.toBeInstanceOf(BadRequestException);
    const dto = await parse({ minPrice: '1', q: 'phone', limit: '5', skip: '2' });
    expect(dto).toMatchObject({ minPrice: 1, q: 'phone', limit: 5, skip: 2 });
  });

  it('property: any non-negative decimal is accepted and kept exactly; catches rounding / integer-only checks', async () => {
    await fc.assert(
      fc.asyncProperty(fc.double({ min: 0, max: 1e6, noNaN: true }), async (n) => {
        const dto = await parse({ minPrice: String(n), maxPrice: String(n) });
        expect(dto.minPrice).toBe(n);
        expect(dto.maxPrice).toBe(n);
      }),
    );
  });

  it('property: any negative number is rejected for minPrice and for maxPrice; catches @Min on only one param', async () => {
    await fc.assert(
      fc.asyncProperty(fc.double({ min: -1e6, max: -1e-9, noNaN: true }), async (n) => {
        await expect(parse({ minPrice: String(n) })).rejects.toBeInstanceOf(BadRequestException);
        await expect(parse({ maxPrice: String(n) })).rejects.toBeInstanceOf(BadRequestException);
      }),
    );
  });
});

describe('GET /products minPrice > maxPrice', () => {
  it('rejects minPrice=30&maxPrice=10 with 400; catches missing min > max check', async () => {
    expect(await status({ minPrice: '30', maxPrice: '10' })).toBe(400);
  });

  it('numeric, not string, comparison: 9 <= 10 is fine, 10 > 9 is 400; catches "10" < "9" string compare', async () => {
    expect(await status({ minPrice: '9', maxPrice: '10' })).toBe('ok');
    expect(await status({ minPrice: '10', maxPrice: '9' })).toBe(400);
  });

  it('accepts minPrice == maxPrice; catches >= instead of > in the check', async () => {
    expect(await status({ minPrice: '10', maxPrice: '10' })).toBe('ok');
  });

  it('property: 400 exactly when min > max; never 400 with only one bound', async () => {
    const price = fc.double({ min: 0, max: 1000, noNaN: true });
    await fc.assert(
      fc.asyncProperty(price, price, async (a, b) => {
        expect(await status({ minPrice: String(a), maxPrice: String(b) })).toBe(a > b ? 400 : 'ok');
        expect(await status({ minPrice: String(a) })).toBe('ok');
        expect(await status({ maxPrice: String(b) })).toBe('ok');
      }),
    );
  });
});
