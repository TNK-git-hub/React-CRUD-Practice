import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import fc from 'fast-check';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';

// The ValidationPipe under test is the real global pipe configured in src/main.ts (options and
// exceptionFactory included). main.ts boots Nest on import, so only the things around the pipe are
// replaced: NestFactory.create hands back a tiny app that records useGlobalPipes, and AppModule / Swagger
// setup are stubbed because no server is started. Nothing of the validation itself is faked.
const captured = vi.hoisted(() => ({ pipe: undefined as PipeTransform | undefined }));

vi.mock('@nestjs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/core')>();
  const app = {
    enableShutdownHooks() {},
    enableCors() {},
    useGlobalPipes(pipe: PipeTransform) {
      captured.pipe = pipe;
    },
    useStaticAssets() {},
    async listen() {},
  };
  return { ...actual, NestFactory: { create: async () => app } };
});
vi.mock('@nestjs/swagger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/swagger')>();
  return { ...actual, SwaggerModule: { setup() {}, createDocument: () => ({}) } };
});
vi.mock('../../src/app.module', () => ({ AppModule: class AppModule {} }));

beforeAll(async () => {
  await import('../../src/main');
  await vi.waitFor(() => expect(captured.pipe).toBeDefined());
});

type Query = Record<string, string | string[]>;

interface ErrorBody {
  statusCode: number;
  message: string[];
  error: string;
  errors?: Record<string, string>;
}

const NEGATIVE = 'Giá không được âm';
const NOT_A_NUMBER = 'Giá phải là số';
const DECIMALS = 'Giá chỉ được có tối đa 2 chữ số thập phân';
const TOO_BIG = 'Giá không được lớn hơn $99,999,999.99';
const MIN_GT_MAX = 'Giá tối thiểu không được lớn hơn giá tối đa';

function pipe(): PipeTransform {
  if (!captured.pipe) throw new Error('main.ts did not register a global pipe');
  return captured.pipe;
}

// Query string values always arrive as strings (or an array for a repeated key)
async function parse(query: Query): Promise<Record<string, unknown>> {
  const out: unknown = await pipe().transform(query, { type: 'query', metatype: QueryProductDto });
  return out as Record<string, unknown>;
}

async function reject(query: Query): Promise<ErrorBody> {
  try {
    await parse(query);
  } catch (err) {
    if (err instanceof BadRequestException) return err.getResponse() as ErrorBody;
    throw err;
  }
  throw new Error(`expected HTTP 400 for ${JSON.stringify(query)}, but the query was accepted`);
}

describe('GET /products price parameters: accepted values', () => {
  it('PROD-003-S1 accepts 10.50 and 20 and keeps them as the strings that were sent', async () => {
    const dto = await parse({ minPrice: '10.50', maxPrice: '20' });

    expect(dto.minPrice).toBe('10.50'); // a number here would mean float parsing (001-ADR-1)
    expect(dto.maxPrice).toBe('20');
  });

  it('PROD-001-S4 minPrice and maxPrice survive the whitelist and sit next to the other parameters', async () => {
    const dto = await parse({ minPrice: '10', maxPrice: '20', q: 'phone' });

    expect(dto).toMatchObject({ minPrice: '10', maxPrice: '20', q: 'phone', skip: 0, order: 'asc' });
  });

  it('PROD-003-S11 an empty minPrice means no lower bound, maxPrice=10 still applies', async () => {
    const dto = await parse({ minPrice: '', maxPrice: '10' });

    expect(dto.minPrice).toBeUndefined();
    expect(dto.maxPrice).toBe('10');
  });

  it('PROD-003-S11 a minPrice of only spaces also means no bound', async () => {
    const dto = await parse({ minPrice: '   ' });

    expect(dto.minPrice).toBeUndefined();
  });

  it('PROD-001-S6 spaces around the values are trimmed before the checks', async () => {
    const dto = await parse({ minPrice: ' 10 ', maxPrice: ' 20 ' });

    expect(dto).toMatchObject({ minPrice: '10', maxPrice: '20' });
  });

  it('PROD-003-S18 keeps leading zeros and a trailing zero decimal as typed, for 0 and 99999999.99 too', async () => {
    await expect(parse({ minPrice: '010', maxPrice: '20.00' })).resolves.toMatchObject({
      minPrice: '010',
      maxPrice: '20.00',
    });
    await expect(parse({ minPrice: '0', maxPrice: '99999999.99' })).resolves.toMatchObject({
      minPrice: '0',
      maxPrice: '99999999.99',
    });
  });

  it('PROD-003-S18 every plain number from 0 to 99999999.99 with at most 2 decimals is accepted as typed (property)', async () => {
    const valid = fc
      .tuple(
        fc.integer({ min: 0, max: 99_999_999 }),
        fc.integer({ min: 0, max: 3 }), // leading zeros
        fc.option(fc.stringMatching(/^[0-9]{1,2}$/), { nil: undefined }),
      )
      .map(([whole, zeros, frac]) => `${'0'.repeat(zeros)}${whole}${frac === undefined ? '' : `.${frac}`}`);

    await fc.assert(
      fc.asyncProperty(valid, async (text) => {
        const dto = await parse({ minPrice: text });
        expect(dto.minPrice).toBe(text);
      }),
    );
  });

  it('PROD-003-S16 a minimum equal to the maximum is valid, and 9 <= 10 (compared as numbers, not text)', async () => {
    await expect(parse({ minPrice: '20', maxPrice: '20' })).resolves.toMatchObject({ minPrice: '20' });
    await expect(parse({ minPrice: '9', maxPrice: '10' })).resolves.toMatchObject({ minPrice: '9' });
    await expect(parse({ minPrice: '010', maxPrice: '10.00' })).resolves.toMatchObject({ minPrice: '010' });
  });

  it('PROD-003-S2 undeclared parameters are still dropped silently (whitelist unchanged)', async () => {
    const dto = await parse({ minPrice: '10', admin: 'true' });

    expect(dto).not.toHaveProperty('admin');
  });
});

describe('GET /products price parameters: rejected values', () => {
  it.each([
    ['PROD-003-S2', '-1'],
    ['PROD-003-S2', '-0.01'],
    ['PROD-003-S19', '-0'],
  ])('%s rejects the negative minimum %s with "Giá không được âm"', async (_id, value) => {
    const body = await reject({ minPrice: value });

    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual([NEGATIVE]);
  });

  it.each([['10.123'], ['1.000']])(
    'PROD-003-S3 rejects the maximum %s with "Giá chỉ được có tối đa 2 chữ số thập phân"',
    async (value) => {
      const body = await reject({ maxPrice: value });

      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual([DECIMALS]);
    },
  );

  it.each([['abc'], ['10,5'], ['1,000'], ['1e3'], ['+5'], ['.5'], ['5.']])(
    'PROD-003-S6 rejects the minimum "%s" with "Giá phải là số"',
    async (value) => {
      const body = await reject({ minPrice: value });

      expect(body.message).toEqual([NOT_A_NUMBER]);
    },
  );

  it("PROD-003-S7 rejects ' OR 1=1 -- as text with \"Giá phải là số\" before it can reach a query", async () => {
    const body = await reject({ minPrice: "' OR 1=1 --" });

    expect(body.message).toEqual([NOT_A_NUMBER]);
  });

  it('PROD-003-S9 rejects 100000000 with "Giá không được lớn hơn $99,999,999.99", accepts the limit itself', async () => {
    const body = await reject({ maxPrice: '100000000' });

    expect(body.message).toEqual([TOO_BIG]);
    await expect(parse({ maxPrice: '99999999.99' })).resolves.toMatchObject({ maxPrice: '99999999.99' });
  });

  it('PROD-003-S9 99999999.995 fails the decimals check (3) before the size check (4)', async () => {
    const body = await reject({ maxPrice: '99999999.995' });

    expect(body.message).toEqual([DECIMALS]);
  });

  it('PROD-003-S14 a 30-digit value is rejected as too large, nothing crashes', async () => {
    const body = await reject({ maxPrice: '123456789012345678901234567890' });

    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual([TOO_BIG]);
  });

  it('PROD-003-S12 a repeated minPrice (an array) is rejected with "Giá phải là số"', async () => {
    const body = await reject({ minPrice: ['10', '20'] });

    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual([NOT_A_NUMBER]);
  });

  it('PROD-003-S16 minPrice=30 with maxPrice=10 is rejected with "Giá tối thiểu không được lớn hơn giá tối đa"', async () => {
    const body = await reject({ minPrice: '30', maxPrice: '10' });

    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual([MIN_GT_MAX]);
    expect(body.errors).toEqual({ minPrice: MIN_GT_MAX }); // under the minimum
  });

  it('PROD-003-S16 min > max is decided on numbers: 10 vs 9 is rejected, 010 vs 9 is rejected (property)', async () => {
    const pad = fc.integer({ min: 0, max: 2 });
    const centsArb = fc.integer({ min: 0, max: 9_999_999_999 });
    const text = (c: number, zeros: number) =>
      `${'0'.repeat(zeros)}${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

    await fc.assert(
      fc.asyncProperty(centsArb, pad, centsArb, pad, async (a, za, b, zb) => {
        const query = { minPrice: text(a, za), maxPrice: text(b, zb) };
        if (a > b) {
          const body = await reject(query);
          expect(body.message).toEqual([MIN_GT_MAX]);
        } else {
          await expect(parse(query)).resolves.toMatchObject(query);
        }
      }),
    );
  });

  it('PROD-003-S17 min "30,5" with max 10 only reports "Giá phải là số": check 5 needs both bounds valid', async () => {
    const body = await reject({ minPrice: '30,5', maxPrice: '10' });

    expect(body.message).toEqual([NOT_A_NUMBER]);
    expect(body.errors).toEqual({ minPrice: NOT_A_NUMBER });
  });

  it('PROD-003-S20 minPrice=-1 with maxPrice=abc: both messages, errors names each bound', async () => {
    const body = await reject({ minPrice: '-1', maxPrice: 'abc' });

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect([...body.message].sort()).toEqual([NEGATIVE, NOT_A_NUMBER].sort());
    expect(body.errors).toEqual({ minPrice: NEGATIVE, maxPrice: NOT_A_NUMBER });
  });

  it('PROD-003-S13 the 400 body keeps statusCode, message array and error, and adds errors for a bad minimum', async () => {
    const body = await reject({ minPrice: '-1' });

    expect(body).toEqual({
      statusCode: 400,
      message: [NEGATIVE],
      error: 'Bad Request',
      errors: { minPrice: NEGATIVE },
    });
  });

  it('PROD-003-S21 a bad maximum puts its message under maxPrice only, a valid minimum gets no key', async () => {
    const body = await reject({ minPrice: '10', maxPrice: 'abc' });

    expect(body.errors).toEqual({ maxPrice: NOT_A_NUMBER });
    expect(body.errors).not.toHaveProperty('minPrice');
  });

  it('PROD-003-S13 a 400 for another parameter keeps its old shape: no errors key', async () => {
    const body = await reject({ limit: '0' });

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(Array.isArray(body.message)).toBe(true);
    expect(body).not.toHaveProperty('errors');
  });

  it('PROD-003-S13 with a bad limit and a bad minimum, errors only describes the price bound', async () => {
    const body = await reject({ limit: '0', minPrice: '-1' });

    expect(body.errors).toEqual({ minPrice: NEGATIVE });
    expect(body.message).toContain(NEGATIVE);
    expect(body.message.length).toBe(2);
  });

  it('PROD-003-S6 only the first failing check is reported per bound, in the order of the spec (property)', async () => {
    // Oracle written from the check table of PROD-003, independent of the validator
    const expectedMessage = (raw: string): string | null => {
      const s = raw.trim();
      if (s === '') return null;
      if (/^-\d/.test(s)) return NEGATIVE;
      if (!/^\d+(\.\d+)?$/.test(s)) return NOT_A_NUMBER;
      const [whole = '', frac = ''] = s.split('.');
      if (frac.length > 2) return DECIMALS;
      if (whole.replace(/^0+/, '').length > 8) return TOO_BIG;
      return null;
    };
    const text = fc
      .string({ unit: fc.constantFrom(...'-0123456789.,e+ ab'.split('')), minLength: 0, maxLength: 14 })
      .filter((s) => !s.trim().startsWith('-.')); // "-.5": negative or not a number is not decided by the spec

    await fc.assert(
      fc.asyncProperty(text, async (raw) => {
        const expected = expectedMessage(raw);
        if (expected === null) {
          await expect(parse({ maxPrice: raw })).resolves.toBeInstanceOf(QueryProductDto);
        } else {
          const body = await reject({ maxPrice: raw });
          expect(body.message).toEqual([expected]);
          expect(body.errors).toEqual({ maxPrice: expected });
        }
      }),
      { numRuns: 300 },
    );
  });

  it('PROD-003-S14 any digit string with more than 8 whole digits is "too large", never a crash (property)', async () => {
    const digits = fc.stringMatching(/^[1-9][0-9]{8,40}$/);

    await fc.assert(
      fc.asyncProperty(digits, async (value) => {
        const body = await reject({ minPrice: value });
        expect(body.message).toEqual([TOO_BIG]);
      }),
    );
  });
});
