// Spec: docs/specs/frontend-utils.spec.md, section 2 (PAGE-*)
import { describe, expect, it } from 'vitest';
import genPageArray from './genPageArray';

describe('genPageArray', () => {
    it('PAGE-1: 6 pages or fewer shows every page, no gap', () => {
        expect(genPageArray(6, 3)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(genPageArray(1, 1)).toEqual([1]);
        expect(genPageArray(0, 1)).toEqual([]);
    });

    it('PAGE-2: more than 6 pages and current page in the first 5', () => {
        expect(genPageArray(20, 1)).toEqual([1, 2, 3, 4, 5, '...', 20]);
        expect(genPageArray(20, 5)).toEqual([1, 2, 3, 4, 5, '...', 20]);
        expect(genPageArray(7, 5)).toEqual([1, 2, 3, 4, 5, '...', 7]);
    });

    it('PAGE-3: current page in the middle has a gap on both sides', () => {
        expect(genPageArray(20, 6)).toEqual([1, '...', 6, '...', 20]);
        expect(genPageArray(20, 18)).toEqual([1, '...', 18, '...', 20]);
    });

    it('PAGE-4: second to last page has no second gap', () => {
        expect(genPageArray(20, 19)).toEqual([1, '...', 19, 20]);
    });

    it('PAGE-5: last page is shown once', () => {
        expect(genPageArray(20, 20)).toEqual([1, '...', 20]);
    });

    it('PAGE-6: the current page always appears', () => {
        for (const total of [1, 6, 7, 20]) {
            for (let current = 1; current <= total; current++) {
                expect(genPageArray(total, current), `total=${total} current=${current}`).toContain(current);
            }
        }
    });
});
