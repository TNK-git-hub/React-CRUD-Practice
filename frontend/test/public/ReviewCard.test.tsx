import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReviewCard from '../../src/comopnents/ProductDetail/ReviewCard';
import type { Review } from '../../src/types/product';

const review: Review = {
  id: 1,
  rating: 3,
  comment: 'Great',
  date: '2026-01-02T03:04:05.000Z',
  reviewerName: 'Minh',
  reviewerEmail: 'minh@x.vn',
};

const render = (patch: Partial<Review>) => renderToStaticMarkup(createElement(ReviewCard, { review: { ...review, ...patch } }));

describe('ReviewCard comment', () => {
  it('null comment prints neither "null" nor a paragraph', () => {
    // catches: the card printing the literal text "null"
    const html = render({ comment: null });

    expect(html).not.toContain('null');
    expect(html).not.toContain('<p');
  });

  it('empty comment renders no paragraph', () => {
    // catches: only null handled, empty string renders an empty pair of quotes
    const html = render({ comment: '' });

    expect(html).not.toContain('<p');
    expect(html).not.toContain('&quot;');
  });

  it('a real comment is shown', () => {
    // catches: the comment branch removed along with the null case
    expect(render({ comment: 'Great' })).toContain('Great');
  });

  it('reviewer name and the date stay in the output with and without a comment', () => {
    // catches: other parts of the card lost while removing the comment
    for (const comment of [null, 'Great']) {
      const html = render({ comment });
      expect(html).toContain('Minh');
      expect(html).toContain('2026');
    }
  });

  it('exactly `rating` stars are filled, with or without a comment', () => {
    // catches: star rendering broken by the comment change
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.constantFrom(null, 'Great'), (rating, comment) => {
        const html = render({ rating, comment });
        expect(html.match(/fill-accent/g) ?? []).toHaveLength(rating);
        expect(html.match(/<svg/g) ?? []).toHaveLength(5);
      }),
    );
  });
});
