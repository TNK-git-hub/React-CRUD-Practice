import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CreateReviewDto } from '../../src/products/dto/create-review.dto';

// Same options as the global pipe in src/main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const base = { rating: 3, reviewerName: 'Ann', reviewerEmail: 'ann@example.com' };
const parse = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: CreateReviewDto });
const rejects = (body: Record<string, unknown>) =>
  expect(parse(body)).rejects.toBeInstanceOf(BadRequestException);

describe('CreateReviewDto rating', () => {
  // bug caught: off-by-one @Min/@Max (e.g. @Min(2) or @Max(4))
  it.each([1, 5])('accepts rating %i (boundary)', async (rating) => {
    const dto = await parse({ ...base, rating });
    expect(dto).toBeInstanceOf(CreateReviewDto);
    expect(dto.rating).toBe(rating);
  });

  // bug caught: missing @Min / @Max or wrong boundary
  it.each([0, 6, -1, 100])('rejects rating %i', (rating) => rejects({ ...base, rating }));

  // bug caught: @IsNumber used instead of @IsInt
  it('rejects a fractional rating 2.5', () => rejects({ ...base, rating: 2.5 }));

  // bug caught: undefined slips through because there is no required check
  it('rejects a missing rating', () => {
    const { rating: _r, ...body } = base;
    return rejects(body);
  });

  // bug caught: type check skipped
  it('rejects a non-numeric rating', () => rejects({ ...base, rating: 'abc' }));

  // bug caught: boundary wrong at some other integer
  it('accepts an integer exactly when it is between 1 and 5 (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -50, max: 50 }), async (n) => {
        const ok = await parse({ ...base, rating: n }).then(() => true, () => false);
        expect(ok).toBe(n >= 1 && n <= 5);
      }),
    );
  });
});

describe('CreateReviewDto reviewerName', () => {
  // bug caught: only @IsNotEmpty, no trimming
  it('rejects a whitespace-only name', () => rejects({ ...base, reviewerName: '   ' }));

  // bug caught: only plain spaces are treated as blank
  it('rejects any all-whitespace name (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(' ', '\t', '\n'), { maxLength: 20 }).map((a) => a.join('')),
        async (name) => {
          await expect(parse({ ...base, reviewerName: name })).rejects.toBeInstanceOf(BadRequestException);
        },
      ),
    );
  });

  // bug caught: @IsNotEmpty missing
  it('rejects a missing name', () => {
    const { reviewerName: _n, ...body } = base;
    return rejects(body);
  });

  // bug caught: wrong @MaxLength boundary
  it('accepts 100 characters and rejects 101', async () => {
    await expect(parse({ ...base, reviewerName: 'a'.repeat(100) })).resolves.toBeInstanceOf(CreateReviewDto);
    await rejects({ ...base, reviewerName: 'a'.repeat(101) });
  });

  // bug caught: valid names with surrounding spaces blocked
  it('accepts a name with surrounding spaces but real content', async () => {
    await expect(parse({ ...base, reviewerName: ' Ann ' })).resolves.toBeInstanceOf(CreateReviewDto);
  });
});

describe('CreateReviewDto reviewerEmail', () => {
  // bug caught: @IsEmail missing
  it('rejects a malformed email', () => rejects({ ...base, reviewerEmail: 'not-an-email' }));

  it('rejects a missing email', () => {
    const { reviewerEmail: _e, ...body } = base;
    return rejects(body);
  });

  // bug caught: email check stricter than the standard (plain addresses must pass)
  it('accepts plain well-formed addresses (property)', async () => {
    const part = fc.stringMatching(/^[a-z][a-z0-9]{0,15}$/);
    await fc.assert(
      fc.asyncProperty(part, part, fc.constantFrom('com', 'org', 'vn'), async (local, host, tld) => {
        await expect(parse({ ...base, reviewerEmail: `${local}@${host}.${tld}` })).resolves.toBeInstanceOf(
          CreateReviewDto,
        );
      }),
    );
  });
});

describe('CreateReviewDto comment', () => {
  // bug caught: comment treated as required
  it('accepts a body without comment', async () => {
    const dto = await parse(base);
    expect(dto.comment).toBeUndefined();
  });

  // bug caught: wrong @MaxLength boundary
  it('accepts 1000 characters and rejects 1001', async () => {
    await expect(parse({ ...base, comment: 'a'.repeat(1000) })).resolves.toBeInstanceOf(CreateReviewDto);
    await rejects({ ...base, comment: 'a'.repeat(1001) });
  });

  // bug caught: @IsString missing
  it('rejects a non-string comment', () => rejects({ ...base, comment: 42 }));
});

describe('CreateReviewDto whitelist', () => {
  // bug caught: a client-sent date reaches the service
  it('drops a date sent by the client', async () => {
    const dto = await parse({ ...base, date: '2000-01-01T00:00:00.000Z' });
    expect(dto).not.toHaveProperty('date');
  });
});
