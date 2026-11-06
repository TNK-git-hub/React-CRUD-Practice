import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CreateProductDto } from '../../src/products/dto/create-product.dto';
import {
  makeService,
  productRow,
  queryFailed,
  rejection,
  uniqueViolation,
} from './products.fakes';

const validDto = {
  title: 'Red Lipstick',
  description: 'A bright red lipstick',
  category: 'beauty',
  price: 12.5,
  stock: 10,
  sku: 'ABC',
  tags: [],
  images: [],
} as unknown as CreateProductDto;

// save() inside the transaction is where Postgres reports a unique violation
const failingSave = (err: unknown) => ({
  managerFindOneBy: (where: Record<string, unknown>) => (where.id === 1 ? productRow(1) : null),
  managerSave: () => {
    throw err;
  },
});

const callers = [
  ['create', (svc: ReturnType<typeof makeService>) => svc.create(validDto)],
  ['update', (svc: ReturnType<typeof makeService>) => svc.update(1, { sku: 'ABC' })],
] as const;

describe.each(callers)('ProductsService.%s: db errors', (_name, call) => {
  it.each([
    ['sku', 'Key (sku)=(ABC) already exists.', 'sku already exists'],
    ['barcode', 'Key (barcode)=(1234567890123) already exists.', 'barcode already exists'],
    ['no detail', undefined, 'value already exists'],
    // composite key: "\w+" stops at the comma, so the regex finds no column name
    ['composite key', 'Key (product_id, tag_id)=(1, 2) already exists.', 'value already exists'],
    // expression index: "\w+" stops at "(", so the regex finds no column name
    ['expression index', 'Key (lower(title::text))=(x) already exists.', 'value already exists'],
  ])('maps a 23505 unique violation (%s) to 409 Conflict', async (_label, detail, message) => {
    const svc = makeService(failingSave(uniqueViolation(detail)));

    const err = await rejection(call(svc));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe(message);
  });

  it('re-throws a QueryFailedError with another code unchanged', async () => {
    const dbErr = queryFailed('23502'); // not_null_violation
    const svc = makeService(failingSave(dbErr));

    await expect(call(svc)).rejects.toBe(dbErr);
  });

  it('re-throws an error with code 23505 that is not a QueryFailedError unchanged', async () => {
    const lookalike = Object.assign(new Error('x'), { code: '23505' });
    const svc = makeService(failingSave(lookalike));

    await expect(call(svc)).rejects.toBe(lookalike);
  });
});

describe('ProductsService unique-violation message (property)', () => {
  it('names the column from the "Key (<column>)" part of the detail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z_]\w{0,20}$/),
        fc.string().map((s) => s.replaceAll(')', '')),
        async (field, value) => {
          const detail = `Key (${field})=(${value}) already exists.`;
          const svc = makeService(failingSave(uniqueViolation(detail)));

          const err = await rejection(svc.create(validDto));

          expect(err).toBeInstanceOf(ConflictException);
          expect(err.message).toBe(`${field} already exists`);
        },
      ),
    );
  });
});

describe('ProductsService.update: missing product', () => {
  it('rejects with 404 when the row does not exist', async () => {
    const svc = makeService({ managerFindOneBy: () => null });

    const err = await rejection(svc.update(999, { title: 'x' }));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.message).toBe('Product 999 not found');
  });
});
