import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Header, { type Theme } from '../../src/comopnents/Header';

// FAIL-FIRST NOTE for code-writer:
//  - "brand link" tests (anchor href, hover class, cursor, heading) fail today: brand is plain text.
//  - toggle tests are regression guards and pass today.
//  - the property test fails today only on its "exactly one <a href="/">" assertion.

const render = (theme: Theme) =>
  renderToStaticMarkup(createElement(Header, { theme, toggleTheme: () => {} }));

const anchors = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], inner: m[2] }));
const buttons = (html: string) =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    attrs: m[1],
    label: m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').trim(),
  }));
const text = (inner: string) => inner.replace(/<[^>]*>/g, '').trim();
const classOf = (attrs: string) => /class="([^"]*)"/.exec(attrs)?.[1].split(/\s+/) ?? [];
const hrefOf = (attrs: string) => /href="([^"]*)"/.exec(attrs)?.[1];

describe('Header brand link', () => {
  it('renders one <a href="/"> with text "ReactDummy" (catches: brand left as plain text, wrong href, changed text)', () => {
    const found = anchors(render('light')).filter((a) => hrefOf(a.attrs) === '/');
    expect(found).toHaveLength(1);
    expect(text(found[0].inner)).toBe('ReactDummy');
  });

  it('puts hover:text-accent on the <a> itself (catches: missing class, wrong color, class only on <h2>)', () => {
    const [link] = anchors(render('light'));
    expect(link).toBeDefined();
    expect(classOf(link.attrs)).toContain('hover:text-accent');
  });

  it('gives the <a> cursor-pointer (catches: pointer cursor forgotten)', () => {
    const [link] = anchors(render('light'));
    expect(link).toBeDefined();
    expect(classOf(link.attrs)).toContain('cursor-pointer');
  });

  it('keeps the brand a heading inside the link or wrapping it (catches: <h2> dropped)', () => {
    const html = render('light');
    const link = anchors(html).find((a) => hrefOf(a.attrs) === '/');
    expect(link).toBeDefined();
    const h2InsideLink = /<h2\b[^>]*>\s*ReactDummy\s*<\/h2>/.test(link!.inner);
    const linkInsideH2 = /<h2\b[^>]*>\s*<a\b[^>]*href="\/"/.test(html);
    const h2WrapsLink = /<h2\b[^>]*>[\s\S]*<a\b[^>]*href="\/"[^>]*>[\s\S]*ReactDummy[\s\S]*<\/a>[\s\S]*<\/h2>/.test(html);
    expect(h2InsideLink || linkInsideH2 || h2WrapsLink).toBe(true);
    expect(/<h2\b/.test(html)).toBe(true);
  });
});

describe('Header theme toggle', () => {
  it('renders Light and Dark buttons (catches: toggle removed or broken)', () => {
    expect(buttons(render('light')).map((b) => b.label)).toEqual(['Light', 'Dark']);
  });

  it.each<[Theme, string, string]>([
    ['dark', 'Dark', 'Light'],
    ['light', 'Light', 'Dark'],
  ])('theme=%s: only %s is pointer-events-none (catches: inverted active condition)', (theme, active, idle) => {
    const bs = buttons(render(theme));
    expect(classOf(bs.find((b) => b.label === active)!.attrs)).toContain('pointer-events-none');
    expect(classOf(bs.find((b) => b.label === idle)!.attrs)).not.toContain('pointer-events-none');
  });

  it('for any theme: exactly one <a href="/"> and exactly one active button labelled like the theme (catches: brand or active state depending on theme)', () => {
    fc.assert(
      fc.property(fc.constantFrom<Theme>('light', 'dark'), (theme) => {
        const html = render(theme);
        expect(anchors(html).filter((a) => hrefOf(a.attrs) === '/')).toHaveLength(1);
        const active = buttons(html).filter((b) => classOf(b.attrs).includes('pointer-events-none'));
        expect(active).toHaveLength(1);
        expect(active[0].label.toLowerCase()).toBe(theme);
      }),
    );
  });
});
