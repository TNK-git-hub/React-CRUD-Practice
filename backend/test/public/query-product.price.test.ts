import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryProductDto } from '../../src/products/dto/query-product.dto';

// Same options as the global pipe in src/main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const parse = (query: Record<string, string>): Promise<QueryProductDto> =>
  pipe.transform(query, { type: 'query', metatype: QueryProductDto });

describe('QueryProductDto price bounds', () => {
  it('PROD-001-S4 keeps minPrice and maxPrice as strings (not dropped by whitelist, not turned into numbers)', async () => {
    // Catches: properties not declared (whitelist drops them) or @Type(() => Number) (001-ADR-1)
    const dto = await parse({ minPrice: '10', maxPrice: '20' });

    expect(dto.minPrice).toBe('10');
    expect(dto.maxPrice).toBe('20');
    expect(typeof dto.minPrice).toBe('string');
    expect(typeof dto.maxPrice).toBe('string');
  });

  it('PROD-003-S11 an empty minPrice becomes absent and maxPrice is kept', async () => {
    // Catches: '' reaching the service and becoming Between('', ...)
    const dto = await parse({ minPrice: '', maxPrice: '10' });

    expect(dto.minPrice).toBeUndefined();
    expect(dto.maxPrice).toBe('10');
  });

  it('PROD-003-S11 a repeated key (array) is not trimmed: validation answers, no TypeError', async () => {
    // Catches: calling .trim() on a non-string and crashing before validation can answer
    const outcome = await pipe
      .transform({ minPrice: ['10', '20'] } as unknown as Record<string, string>, {
        type: 'query',
        metatype: QueryProductDto,
      })
      .then(() => 'accepted', (e: unknown) => e);

    expect(outcome instanceof TypeError).toBe(false);
  });

  it('PROD-003-S11 an empty maxPrice becomes absent too', async () => {
    // Catches: only the minimum being normalised
    const dto = await parse({ minPrice: '5', maxPrice: '' });

    expect(dto.minPrice).toBe('5');
    expect(dto.maxPrice).toBeUndefined();
  });

  it('PROD-003-S18 trims spaces and keeps the value as typed ("010", "20.00")', async () => {
    // Catches: number parsing that turns 010 into 10 and 20.00 into 20; missing trim
    const dto = await parse({ minPrice: ' 010 ', maxPrice: '20.00' });

    expect(dto.minPrice).toBe('010');
    expect(dto.maxPrice).toBe('20.00');
  });

  it('PROD-001-S6 trimming works on both sides for any padded valid value', async () => {
    // Catches: trimming only one bound, or only leading / only trailing spaces
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9]{1,8}(\.[0-9]{1,2})?$/),
        fc.stringMatching(/^[0-9]{1,8}(\.[0-9]{1,2})?$/),
        fc.nat({ max: 3 }),
        fc.nat({ max: 3 }),
        async (min, max, lead, trail) => {
          const dto = await parse({
            minPrice: ' '.repeat(lead) + min + ' '.repeat(trail),
            maxPrice: ' '.repeat(trail) + max + ' '.repeat(lead),
          });

          expect(dto.minPrice).toBe(min);
          expect(dto.maxPrice).toBe(max);
        },
      ),
    );
  });

  it('PROD-001-S5 leaves both bounds absent when none is sent', async () => {
    // Catches: a default value being invented for the bounds
    const dto = await parse({});

    expect(dto.minPrice).toBeUndefined();
    expect(dto.maxPrice).toBeUndefined();
  });
});
