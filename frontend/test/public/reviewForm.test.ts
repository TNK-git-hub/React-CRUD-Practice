import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateReview } from '../../src/utils/reviewForm';

type Values = Parameters<typeof validateReview>[0];

const valid: Values = { rating: 5, reviewerName: 'An', reviewerEmail: 'an@x.vn', comment: '' };
const with_ = (patch: Partial<Values>): Values => ({ ...valid, ...patch });

describe('validateReview', () => {
  it('reports every broken field with its exact message and nothing for comment', () => {
    // catches: a missing rule, a changed message, name not trimmed ("   " slipping through), a `comment: undefined` key
    const errors = validateReview({ rating: null, reviewerName: '   ', reviewerEmail: 'not-an-email', comment: '' });

    expect(errors).toEqual({
      rating: 'Vui lòng chọn số sao',
      reviewerName: 'Vui lòng nhập tên',
      reviewerEmail: 'Email không hợp lệ',
    });
  });

  it('returns {} for valid values with an empty comment', () => {
    // catches: a rule rejecting valid input, an empty optional comment treated as an error
    expect(validateReview(valid)).toEqual({});
  });

  it.each([1, 2, 3, 4, 5])('rating %i is accepted', (rating) => {
    // catches: a falsy/range check on rating that rejects real stars
    expect(validateReview(with_({ rating }))).toEqual({});
  });

  describe('name length (measured after trim)', () => {
    it('100 chars is valid, 101 chars is "Tên tối đa 100 ký tự"', () => {
      // catches: off-by-one (>= 100)
      expect(validateReview(with_({ reviewerName: 'a'.repeat(100) }))).toEqual({});
      expect(validateReview(with_({ reviewerName: 'a'.repeat(101) }))).toEqual({ reviewerName: 'Tên tối đa 100 ký tự' });
    });

    it('any length 1..100 is valid and 101..300 is too long, whatever the padding', () => {
      // catches: length measured before trim, wrong threshold
      const pad = fc.stringMatching(/^[ \t\n]{0,5}$/);
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), pad, pad, (n, l, r) => {
          expect(validateReview(with_({ reviewerName: `${l}${'b'.repeat(n)}${r}` }))).toEqual({});
        }),
      );
      fc.assert(
        fc.property(fc.integer({ min: 101, max: 300 }), pad, pad, (n, l, r) => {
          expect(validateReview(with_({ reviewerName: `${l}${'b'.repeat(n)}${r}` }))).toEqual({
            reviewerName: 'Tên tối đa 100 ký tự',
          });
        }),
      );
    });

    it('100 chars surrounded by spaces is still valid', () => {
      // catches: counting the padding towards the limit
      expect(validateReview(with_({ reviewerName: `  ${'a'.repeat(100)}  ` }))).toEqual({});
    });

    it('whitespace-only names give the "enter a name" message, not the "max" one', () => {
      // catches: the two name messages swapped; tab/newline not treated as whitespace
      fc.assert(
        fc.property(fc.stringMatching(/^[ \t\n\r]{0,150}$/), (name) => {
          expect(validateReview(with_({ reviewerName: name }))).toEqual({ reviewerName: 'Vui lòng nhập tên' });
        }),
      );
    });
  });

  describe('comment length', () => {
    it('1000 chars is valid, 1001 chars is "Nhận xét tối đa 1000 ký tự"', () => {
      // catches: off-by-one on the comment limit
      expect(validateReview(with_({ comment: 'c'.repeat(1000) }))).toEqual({});
      expect(validateReview(with_({ comment: 'c'.repeat(1001) }))).toEqual({ comment: 'Nhận xét tối đa 1000 ký tự' });
    });

    it('any length 0..1000 is valid and 1001..1500 is an error', () => {
      // catches: wrong threshold at other lengths
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (n) => {
          expect(validateReview(with_({ comment: 'c'.repeat(n) }))).toEqual({});
        }),
      );
      fc.assert(
        fc.property(fc.integer({ min: 1001, max: 1500 }), (n) => {
          expect(validateReview(with_({ comment: 'c'.repeat(n) }))).toEqual({ comment: 'Nhận xét tối đa 1000 ký tự' });
        }),
      );
    });
  });

  describe('email', () => {
    const word = fc.stringMatching(/^[a-z0-9._-]{1,12}$/);

    it('local@domain.tld is valid, also with surrounding whitespace', () => {
      // catches: regex too strict; email not trimmed (" a@b.co " rejected)
      const pad = fc.stringMatching(/^[ \t]{0,3}$/);
      fc.assert(
        fc.property(word, word, word, pad, pad, (local, domain, tld, l, r) => {
          expect(validateReview(with_({ reviewerEmail: `${l}${local}@${domain}.${tld}${r}` }))).toEqual({});
        }),
      );
    });

    it.each(['a@b', '@b.c', 'a@b.', 'ab.c', 'a b@c.d', 'a@b c.d', 'a@@b.c', 'a@b@c.d', '', '   '])(
      '%j is rejected',
      (email) => {
        // catches: regex too loose (missing dot, empty parts, whitespace inside, two @)
        expect(validateReview(with_({ reviewerEmail: email }))).toEqual({ reviewerEmail: 'Email không hợp lệ' });
      },
    );
  });

  it('does not mutate its input', () => {
    // catches: trimming written back into the form values
    const input: Values = { rating: 3, reviewerName: '  An  ', reviewerEmail: ' an@x.vn ', comment: ' hi ' };

    validateReview(input);

    expect(input).toEqual({ rating: 3, reviewerName: '  An  ', reviewerEmail: ' an@x.vn ', comment: ' hi ' });
  });
});
