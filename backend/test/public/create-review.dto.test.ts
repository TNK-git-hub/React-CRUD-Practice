import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';

// Same options as the global pipe in src/main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const valid = { rating: 4, reviewerName: 'Ann', reviewerEmail: 'ann@example.com', comment: 'Nice' };

const parse = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: CreateReviewDto });

const accepts = async (body: Record<string, unknown>) => {
  try {
    await parse(body);
    return true;
  } catch (err) {
    if (err instanceof BadRequestException) return false;
    throw err;
  }
};

const without = (key: string) => {
  const { [key]: _omitted, ...rest } = valid as Record<string, unknown>;
  return rest;
};

describe('POST /products/:id/reviews body validation (CreateReviewDto)', () => {
  it('accepts a valid body and keeps every field', async () => {
    const dto = await parse(valid);
    expect(dto).toBeInstanceOf(CreateReviewDto);
    expect(dto).toMatchObject(valid);
  });

  it('drops a client-sent date instead of passing it on (bug: DTO or pipe lets date through)', async () => {
    const dto = await parse({ ...valid, date: '2000-01-01T00:00:00.000Z' });
    expect(dto).not.toHaveProperty('date');
  });

  // rating
  it.each([1, 5])('accepts rating %i (bug: off-by-one at the bounds)', async (rating) => {
    expect(await accepts({ ...valid, rating })).toBe(true);
  });

  it.each([0, 6, -1, 2.5])('rejects rating %s (bug: missing @Min/@Max/@IsInt)', async (rating) => {
    expect(await accepts({ ...valid, rating })).toBe(false);
  });

  it('rejects a missing rating (bug: rating treated as optional)', async () => {
    expect(await accepts(without('rating'))).toBe(false);
  });

  it('rejects a non-numeric rating', async () => {
    expect(await accepts({ ...valid, rating: 'abc' })).toBe(false);
  });

  it('property: accepts exactly the integers 1..5 among all numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.integer({ min: -50, max: 50 }), fc.double({ noNaN: false })),
        async (rating) => {
          const expected = Number.isInteger(rating) && rating >= 1 && rating <= 5;
          expect(await accepts({ ...valid, rating })).toBe(expected);
        },
      ),
    );
  });

  // reviewerName
  it.each([['spaces', '   '], ['empty', ''], ['tabs/newlines', ' \t\n ']])(
    'rejects a blank reviewerName (%s) (bug: no trim before the non-empty check)',
    async (_label, reviewerName) => {
      expect(await accepts({ ...valid, reviewerName })).toBe(false);
    },
  );

  it('rejects a missing reviewerName', async () => {
    expect(await accepts(without('reviewerName'))).toBe(false);
  });

  it('accepts a 100-char name and rejects 101 (bug: @MaxLength off by one)', async () => {
    expect(await accepts({ ...valid, reviewerName: 'a'.repeat(100) })).toBe(true);
    expect(await accepts({ ...valid, reviewerName: 'a'.repeat(101) })).toBe(false);
  });

  it('accepts a name with surrounding whitespace', async () => {
    expect(await accepts({ ...valid, reviewerName: '  A  ' })).toBe(true);
  });

  it('property: any whitespace-only name is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 30 }).map((a) => a.join('')),
        async (reviewerName) => {
          expect(await accepts({ ...valid, reviewerName })).toBe(false);
        },
      ),
    );
  });

  // reviewerEmail
  it.each(['not-an-email', ''])('rejects reviewerEmail %j (bug: no @IsEmail)', async (reviewerEmail) => {
    expect(await accepts({ ...valid, reviewerEmail })).toBe(false);
  });

  it('rejects a missing reviewerEmail', async () => {
    expect(await accepts(without('reviewerEmail'))).toBe(false);
  });

  it('accepts a normal email', async () => {
    expect(await accepts({ ...valid, reviewerEmail: 'a@b.com' })).toBe(true);
  });

  // comment
  it('accepts a body without comment (bug: comment required)', async () => {
    expect(await accepts(without('comment'))).toBe(true);
  });

  it('accepts a 1000-char comment and rejects 1001 (bug: @MaxLength off by one)', async () => {
    expect(await accepts({ ...valid, comment: 'c'.repeat(1000) })).toBe(true);
    expect(await accepts({ ...valid, comment: 'c'.repeat(1001) })).toBe(false);
  });

  it.each([[123], [{ a: 1 }]])('rejects a non-string comment %j (bug: no @IsString)', async (comment) => {
    expect(await accepts({ ...valid, comment })).toBe(false);
  });
});
