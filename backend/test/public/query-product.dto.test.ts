import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';

// Same options as the global pipe in src/main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

// Query string values always arrive as strings
const parse = (query: Record<string, string>) =>
  pipe.transform(query, { type: 'query', metatype: QueryProductDto });

describe('GET /products query validation (QueryProductDto)', () => {
  it('fills in skip=0 and order=asc when the query is empty', async () => {
    const dto = await parse({});
    expect(dto).toMatchObject({ skip: 0, order: 'asc' });
    expect(dto.limit).toBeUndefined();
  });

  it('turns numeric strings into numbers', async () => {
    const dto = await parse({ limit: '25', skip: '40' });
    expect(dto.limit).toBe(25);
    expect(dto.skip).toBe(40);
  });

  it.each([
    ['limit at lower bound', { limit: '1' }],
    ['limit at upper bound', { limit: '100' }],
    ['skip at lower bound', { skip: '0' }],
    ['sortBy on a sortable field', { sortBy: 'price' }],
    ['order desc', { order: 'desc' }],
  ])('accepts %s', async (_label, query) => {
    await expect(parse(query)).resolves.toBeInstanceOf(QueryProductDto);
  });

  it.each([
    ['limit below 1', { limit: '0' }],
    ['limit above 100', { limit: '101' }],
    ['non-integer limit', { limit: '1.5' }],
    ['non-numeric limit', { limit: 'abc' }],
    ['negative skip', { skip: '-1' }],
    ['sortBy on a field that is not sortable', { sortBy: 'id' }],
    ['order in the wrong case', { order: 'DESC' }],
  ])('rejects %s', async (_label, query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('drops unknown query params instead of passing them to the service', async () => {
    const dto = await parse({ q: 'phone', admin: 'true' });
    expect(dto.q).toBe('phone');
    expect(dto).not.toHaveProperty('admin');
  });
});

describe('GET /products price range validation (minPrice / maxPrice)', () => {
  it('turns minPrice and maxPrice into numbers, decimals included (bug: missing @Type, stays a string)', async () => {
    const dto = await parse({ minPrice: '9.99', maxPrice: '20' });
    expect(dto.minPrice).toBe(9.99);
    expect(dto.maxPrice).toBe(20);
  });

  it('accepts only minPrice and leaves maxPrice undefined (bug: missing @IsOptional, or default 0/NaN)', async () => {
    const dto = await parse({ minPrice: '10' });
    expect(dto.minPrice).toBe(10);
    expect(dto.maxPrice).toBeUndefined();
  });

  it('accepts only maxPrice and leaves minPrice undefined (bug: min > max check treats undefined as a number)', async () => {
    const dto = await parse({ maxPrice: '10' });
    expect(dto.maxPrice).toBe(10);
    expect(dto.minPrice).toBeUndefined();
  });

  it('accepts 0 for both bounds (bug: @IsPositive / @Min(1) instead of @Min(0))', async () => {
    const dto = await parse({ minPrice: '0', maxPrice: '0' });
    expect(dto.minPrice).toBe(0);
    expect(dto.maxPrice).toBe(0);
  });

  it('accepts minPrice equal to maxPrice (bug: check uses >= instead of >)', async () => {
    const dto = await parse({ minPrice: '10', maxPrice: '10' });
    expect(dto.minPrice).toBe(10);
    expect(dto.maxPrice).toBe(10);
  });

  it('compares prices as numbers, not strings: 9 <= 10 is valid (bug: "9" > "10" as strings)', async () => {
    const dto = await parse({ minPrice: '9', maxPrice: '10' });
    expect(dto.minPrice).toBe(9);
    expect(dto.maxPrice).toBe(10);
  });

  it.each([
    ['negative minPrice', { minPrice: '-1' }],
    ['negative maxPrice', { maxPrice: '-5' }],
    ['tiny negative minPrice', { minPrice: '-0.01' }],
    ['non-numeric minPrice', { minPrice: 'abc' }],
    ['non-numeric maxPrice', { maxPrice: 'xyz' }],
    ['malformed exponent', { minPrice: '1e' }],
    ['NaN text', { maxPrice: 'NaN' }],
    ['Infinity text', { maxPrice: 'Infinity' }],
    ['empty minPrice (Number("") is 0 and would slip through)', { minPrice: '' }],
    ['empty maxPrice', { maxPrice: '' }],
    ['minPrice greater than maxPrice', { minPrice: '30', maxPrice: '10' }],
    ['decimal minPrice just above maxPrice', { minPrice: '10.01', maxPrice: '10' }],
  ])('rejects %s', async (_label, query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  const price = fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true });

  it('property: a pair of non-negative prices is accepted iff min <= max (bug: wrong side, off-by-one)', async () => {
    await fc.assert(
      fc.asyncProperty(price, price, async (a, b) => {
        const outcome = await parse({ minPrice: String(a), maxPrice: String(b) }).then(
          () => 'ok',
          (e) => (e instanceof BadRequestException ? 'bad' : 'other'),
        );
        expect(outcome).toBe(a <= b ? 'ok' : 'bad');
      }),
    );
  });

  it('property: a single non-negative bound is always accepted and kept as a number', async () => {
    await fc.assert(
      fc.asyncProperty(price, fc.constantFrom('minPrice', 'maxPrice'), async (a, field) => {
        const dto = await parse({ [field]: String(a) });
        expect((dto as any)[field]).toBe(a);
      }),
    );
  });

  it('property: a negative value is rejected whichever bound carries it (bug: only one field has @Min(0))', async () => {
    const negative = fc.double({ min: -1e6, max: -1e-6, noNaN: true, noDefaultInfinity: true });
    await fc.assert(
      fc.asyncProperty(negative, fc.constantFrom('minPrice', 'maxPrice'), async (n, field) => {
        await expect(parse({ [field]: String(n) })).rejects.toBeInstanceOf(BadRequestException);
      }),
    );
  });
});
