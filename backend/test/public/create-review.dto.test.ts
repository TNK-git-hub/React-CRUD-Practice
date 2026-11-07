import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';

// Same options as the global pipe in src/main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const valid = {
  rating: 4,
  reviewerName: 'Ann Lee',
  reviewerEmail: 'ann@example.com',
  comment: 'Works well',
};

const parse = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: CreateReviewDto });

const accepts = async (body: Record<string, unknown>) => {
  try {
    await parse(body);
    return true;
  } catch (err) {
    if (err instanceof BadRequestException) return false;
    throw err; // anything else is a broken test, not a validation result
  }
};

describe('POST /products/:id/reviews body validation (CreateReviewDto)', () => {
  it('accepts a complete valid body and returns a CreateReviewDto', async () => {
    const dto = await parse(valid);
    expect(dto).toBeInstanceOf(CreateReviewDto);
    expect(dto).toMatchObject({ rating: 4, reviewerEmail: 'ann@example.com', comment: 'Works well' });
  });

  // bug caught: @Min/@Max missing or off by one at the edges (> vs >=)
  it.each([
    [1, true],
    [5, true],
    [0, false],
    [6, false],
    [-1, false],
  ])('rating %s -> accepted: %s', async (rating, ok) => {
    expect(await accepts({ ...valid, rating })).toBe(ok);
  });

  // bug caught: @IsInt missing (2.5 passes), rating optional, or a string "3" coerced into a number
  it.each([
    ['fractional rating 2.5', { ...valid, rating: 2.5 }],
    ['string rating "3"', { ...valid, rating: '3' }],
    ['null rating', { ...valid, rating: null }],
  ])('rejects %s', async (_label, body) => {
    expect(await accepts(body)).toBe(false);
  });

  it('rejects a body without rating', async () => {
    const { rating: _omit, ...body } = valid;
    expect(await accepts(body)).toBe(false);
  });

  // bug caught: boundaries wrong for values nobody thought of
  it('property: an integer rating is valid exactly when 1 <= n <= 5', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -1000, max: 1000 }), async (n) => {
        expect(await accepts({ ...valid, rating: n })).toBe(n >= 1 && n <= 5);
      }),
    );
  });

  // bug caught: @IsInt missing so non-integer numbers slip in
  it('property: a non-integer rating is always rejected', async () => {
    const fractional = fc
      .double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true })
      .filter((n) => !Number.isInteger(n));
    await fc.assert(
      fc.asyncProperty(fractional, async (n) => {
        expect(await accepts({ ...valid, rating: n })).toBe(false);
      }),
    );
  });

  // bug caught: @IsNotEmpty without trim lets whitespace-only names through
  it.each([
    ['empty string', ''],
    ['spaces only', '   '],
    ['tabs and newlines only', ' \t\n '],
    ['non-breaking spaces only', '  '],
  ])('rejects reviewerName that is %s', async (_label, reviewerName) => {
    expect(await accepts({ ...valid, reviewerName })).toBe(false);
  });

  it('accepts a name with surrounding spaces as long as something remains after trimming', async () => {
    expect(await accepts({ ...valid, reviewerName: ' a ' })).toBe(true);
  });

  // bug caught: @MaxLength off by one
  it.each([
    [100, true],
    [101, false],
  ])('reviewerName of %s chars -> accepted: %s', async (len, ok) => {
    expect(await accepts({ ...valid, reviewerName: 'a'.repeat(len) })).toBe(ok);
  });

  // bug caught: a non-string name (number) passes because only @IsNotEmpty is present
  it('rejects a non-string reviewerName and a missing reviewerName', async () => {
    expect(await accepts({ ...valid, reviewerName: 123 })).toBe(false);
    const { reviewerName: _omit, ...body } = valid;
    expect(await accepts(body)).toBe(false);
  });

  // bug caught: trim applied in the wrong place, so padded names are judged wrongly
  it('property: a name with 1-90 visible chars plus up to 5 spaces each side is accepted', async () => {
    const core = fc.stringMatching(/^[A-Za-z0-9]{1,90}$/);
    const pad = fc.integer({ min: 0, max: 5 });
    await fc.assert(
      fc.asyncProperty(core, pad, pad, async (c, left, right) => {
        const reviewerName = ' '.repeat(left) + c + ' '.repeat(right);
        expect(await accepts({ ...valid, reviewerName })).toBe(true);
      }),
    );
  });

  // bug caught: only some whitespace kinds are trimmed
  it('property: a name made only of whitespace is always rejected', async () => {
    const ws = fc.array(fc.constantFrom(' ', '\t', '\n', '\r', ' ', ' '), { minLength: 1, maxLength: 30 });
    await fc.assert(
      fc.asyncProperty(ws, async (chars) => {
        expect(await accepts({ ...valid, reviewerName: chars.join('') })).toBe(false);
      }),
    );
  });

  // bug caught: @IsEmail missing; email optional
  it.each([
    ['not-an-email', false],
    ['', false],
    ['a@b', false],
    ['a@b.com', true],
  ])('reviewerEmail %j -> accepted: %s', async (reviewerEmail, ok) => {
    expect(await accepts({ ...valid, reviewerEmail })).toBe(ok);
  });

  it('rejects a body without reviewerEmail', async () => {
    const { reviewerEmail: _omit, ...body } = valid;
    expect(await accepts(body)).toBe(false);
  });

  // bug caught: @IsOptional missing on comment
  it('accepts a body without comment', async () => {
    const { comment: _omit, ...body } = valid;
    expect(await accepts(body)).toBe(true);
  });

  // bug caught: @MaxLength off by one
  it.each([
    [1000, true],
    [1001, false],
  ])('comment of %s chars -> accepted: %s', async (len, ok) => {
    expect(await accepts({ ...valid, comment: 'c'.repeat(len) })).toBe(ok);
  });

  // bug caught: @IsString missing on comment
  it('rejects a comment that is not a string', async () => {
    expect(await accepts({ ...valid, comment: 42 })).toBe(false);
  });

  // bug caught: DTO declares `date`, letting the client choose the review time
  it('drops a client-sent date and unknown fields', async () => {
    const dto = await parse({ ...valid, date: '2000-01-01T00:00:00.000Z', admin: true });
    expect(dto).not.toHaveProperty('date');
    expect(dto).not.toHaveProperty('admin');
  });
});
