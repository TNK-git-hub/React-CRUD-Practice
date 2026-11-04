// Spec: docs/specs/frontend-utils.spec.md, section 3 (SORT-*)
import { describe, expect, it } from 'vitest';
import { isSortField, isSortOrder } from './sortParams';

describe('sortParams', () => {
    it('SORT-1: isSortField accepts only title, price, rating, stock', () => {
        for (const v of ['title', 'price', 'rating', 'stock']) expect(isSortField(v), v).toBe(true);
        for (const v of ['id', 'Price', '', null]) expect(isSortField(v), String(v)).toBe(false);
    });

    it('SORT-2: isSortOrder accepts only lower-case asc and desc', () => {
        expect(isSortOrder('asc')).toBe(true);
        expect(isSortOrder('desc')).toBe(true);
        for (const v of ['ASC', 'up', '', null]) expect(isSortOrder(v), String(v)).toBe(false);
    });
});
