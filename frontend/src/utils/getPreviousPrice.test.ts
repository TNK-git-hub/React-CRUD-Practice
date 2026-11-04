// Spec: docs/specs/frontend-utils.spec.md, section 1 (PRICE-*)
import { describe, expect, it } from 'vitest';
import getPreviousPrice from './getPreviousPrice';

describe('getPreviousPrice', () => {
    it('PRICE-1: price / (1 - discount / 100)', () => {
        expect(getPreviousPrice(80, 20)).toBe('100.00');
        expect(getPreviousPrice(100, 50)).toBe('200.00');
    });

    it('PRICE-2: returns a string with exactly 2 decimals, rounded', () => {
        const result = getPreviousPrice(19.99, 10.48);
        expect(typeof result).toBe('string');
        expect(result).toBe('22.33');
        expect(result).toMatch(/^\d+\.\d{2}$/);
    });

    it('PRICE-3: no discount keeps the same price', () => {
        expect(getPreviousPrice(9.99, 0)).toBe('9.99');
    });
});
