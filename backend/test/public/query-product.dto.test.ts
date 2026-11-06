import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
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
