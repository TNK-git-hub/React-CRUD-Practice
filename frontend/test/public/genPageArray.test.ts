import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import genPageArray, { type PageItem } from '../../src/utils/genPageArray';

describe('genPageArray', () => {
  // Expected values written out by hand from the pagination rules
  it.each<[number, number, PageItem[]]>([
    [1, 1, [1]],
    [6, 3, [1, 2, 3, 4, 5, 6]], // 6 pages or fewer: show every page
    [7, 1, [1, 2, 3, 4, 5, '...', 7]], // first page past the threshold
    [20, 5, [1, 2, 3, 4, 5, '...', 20]], // last page still inside the head
    [20, 6, [1, '...', 6, '...', 20]], // first page past the head
    [20, 18, [1, '...', 18, '...', 20]],
    [20, 19, [1, '...', 19, 20]], // next to last: no second '...'
    [20, 20, [1, '...', 20]], // on the last page: do not show it twice
    [7, 6, [1, '...', 6, 7]],
  ])('genPageArray(%i, %i)', (totalPage, currentPage, expected) => {
    expect(genPageArray(totalPage, currentPage)).toEqual(expected);
  });

  it('always shows the first, current and last page, in increasing order and without duplicates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }).chain((total) =>
          fc.tuple(fc.constant(total), fc.integer({ min: 1, max: total })),
        ),
        ([total, current]) => {
          const items = genPageArray(total, current);
          const pages = items.filter((p): p is number => p !== '...');

          expect(pages).toContain(1);
          expect(pages).toContain(current);
          expect(pages).toContain(total);
          for (let i = 1; i < pages.length; i++) {
            expect(pages[i]).toBeGreaterThan(pages[i - 1]);
          }
          // '...' never stands next to another '...', and never at either end
          items.forEach((item, i) => {
            if (item === '...') {
              expect(i).toBeGreaterThan(0);
              expect(i).toBeLessThan(items.length - 1);
              expect(items[i + 1]).not.toBe('...');
            }
          });
        },
      ),
    );
  });
});
