import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReviewForm from '../../src/comopnents/ProductDetail/ReviewForm';

const html = renderToStaticMarkup(
  createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ReviewForm, { productId: 1 })),
);

// all tags matching `<name ...>` in the markup
const tags = (name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];

describe('ReviewForm initial markup', () => {
  it('has 5 star buttons "1 sao".."5 sao", type=button, none pressed', () => {
    // catches: missing star, button without type="button" (would submit), wrong default pressed state
    const stars = tags('button').filter((b) => /aria-label="\d sao"/.test(b));

    expect(stars).toHaveLength(5);
    [1, 2, 3, 4, 5].forEach((n, i) => {
      expect(stars[i]).toContain(`aria-label="${n} sao"`);
      expect(stars[i]).toContain('type="button"');
      expect(stars[i]).toContain('aria-pressed="false"');
    });
  });

  it('has name and email inputs and a comment textarea with the expected names', () => {
    // catches: wrong name attributes, email not type=email, comment as an input
    const inputs = tags('input');
    const name = inputs.find((i) => i.includes('name="reviewerName"'));
    const email = inputs.find((i) => i.includes('name="reviewerEmail"'));

    expect(name).toBeDefined();
    expect(email).toContain('type="email"');
    expect(tags('textarea').some((t) => t.includes('name="comment"'))).toBe(true);
  });

  it('shows the heading, field labels and the enabled submit button', () => {
    // catches: wrong texts, button disabled on mount
    expect(html).toContain('Viết đánh giá');
    for (const label of ['Tên', 'Email', 'Nhận xét']) expect(html).toMatch(new RegExp(`<label[^>]*>\\s*${label}\\s*<`));
    const submit = tags('button').find((b) => b.includes('type="submit"'));
    expect(submit).toBeDefined();
    expect(submit).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>\s*Gửi đánh giá\s*<\/button>/);
  });

  it('shows no error or success message before the user does anything', () => {
    // catches: validation errors or the thank-you rendered on mount
    for (const text of ['Vui lòng', 'không hợp lệ', 'tối đa', 'Cảm ơn', 'Đang gửi']) expect(html).not.toContain(text);
  });
});
