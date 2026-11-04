// Spec: docs/specs/e2e-product-crud.spec.md (E2E-*)
import { expect, test, type Page } from '@playwright/test';
import { createProduct, productExists, uid } from './helpers';

const search = async (page: Page, word: string) => {
    await page.getByPlaceholder('Tìm sản phẩm theo tên...').fill(word);
    await page.getByRole('button', { name: 'Search' }).click();
};

const card = (page: Page, title: string) => page.locator('article').filter({ hasText: title });

test('E2E-1: searching for a missing word shows the empty result', async ({ page }) => {
    const word = `nothing${uid()}`;
    await page.goto('/');
    await search(page, word);

    await expect(page).toHaveURL(`/products/search?q=${word}`);
    await expect(page.getByText('Không tìm thấy sản phẩm nào')).toBeVisible();
    await expect(page.locator('strong', { hasText: word })).toBeVisible();

    await page.getByRole('button', { name: 'Xoá từ khoá' }).click();
    await expect(page).toHaveURL('/');
});

test('E2E-2: add a product through the form', async ({ page }) => {
    const title = `E2E-2 Lipstick ${uid()}`;
    await page.goto('/');
    await page.getByRole('link', { name: 'Thêm sản phẩm' }).click();
    await expect(page).toHaveURL('/products/add');

    await page.locator('#title').fill(title);
    await page.locator('#description').fill('A red lipstick made by Playwright');
    await page.locator('#category').selectOption('beauty');
    await page.locator('#price').fill('12.5');
    await page.locator('#discountPercentage').fill('20');
    await page.locator('#stock').fill('7');
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();

    await expect(page).toHaveURL(/\/products\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('$12.5', { exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toBeVisible();   // "created" toast

    await page.goto('/');
    await search(page, title);
    await expect(card(page, title)).toHaveCount(1);
});

test('E2E-3: saving an empty form shows every required error', async ({ page, request }) => {
    await page.goto('/products/add');
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();

    await expect(page).toHaveURL('/products/add');
    await expect(page.getByRole('alert')).toContainText('còn 5 field chưa hợp lệ');
    for (const [id, message] of [
        ['title', 'Tên sản phẩm là bắt buộc.'],
        ['description', 'Mô tả là bắt buộc.'],
        ['category', 'Hãy chọn danh mục.'],
        ['price', 'Giá là bắt buộc.'],
        ['stock', 'Tồn kho là bắt buộc.'],
    ]) {
        await expect(page.locator(`#${id}-error`), id).toHaveText(message);
    }

    const res = await request.get('http://localhost:3100/products?limit=1');
    const before = (await res.json()).total;
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
    const after = (await (await request.get('http://localhost:3100/products?limit=1')).json()).total;
    expect(after).toBe(before);
});

test('E2E-4: edit the price of a product', async ({ page, request }) => {
    const p = await createProduct(request, { title: `E2E-4 Mascara ${uid()}`, price: 10 });
    await page.goto('/');
    await search(page, p.title);

    await page.getByRole('button', { name: `Tác vụ cho ${p.title}` }).click();
    await page.getByRole('menuitem', { name: 'Sửa' }).click();
    await expect(page).toHaveURL(`/products/${p.id}/edit`);

    const save = page.getByRole('button', { name: 'Lưu thay đổi' });
    await expect(page.locator('#price')).toHaveValue('10');
    await expect(save).toBeDisabled();

    await page.locator('#price').fill('15.75');
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page).toHaveURL(`/products/${p.id}`);
    await expect(page.getByText('$15.75', { exact: true })).toBeVisible();
});

test('E2E-5: delete a product from its card menu', async ({ page, request }) => {
    const p = await createProduct(request, { title: `E2E-5 Perfume ${uid()}` });
    await page.goto('/');
    await search(page, p.title);
    await expect(card(page, p.title)).toHaveCount(1);

    await page.getByRole('button', { name: `Tác vụ cho ${p.title}` }).click();
    await page.getByRole('menuitem', { name: 'Xoá' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(p.title);
    await dialog.getByRole('button', { name: 'Xoá sản phẩm' }).click();

    await expect(card(page, p.title)).toHaveCount(0);                     // gone at once (optimistic)
    await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();

    // the DELETE is only sent after the 5 s undo window
    await expect.poll(() => productExists(request, p.id), { timeout: 15_000 }).toBe(false);
    await page.reload();
    await expect(page.getByText('Không tìm thấy sản phẩm nào')).toBeVisible();
});

test('E2E-6: undo a delete within 5 seconds', async ({ page, request }) => {
    const p = await createProduct(request, { title: `E2E-6 Candle ${uid()}` });
    await page.goto('/');
    await search(page, p.title);

    await page.getByRole('button', { name: `Tác vụ cho ${p.title}` }).click();
    await page.getByRole('menuitem', { name: 'Xoá' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xoá sản phẩm' }).click();
    await expect(card(page, p.title)).toHaveCount(0);

    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(card(page, p.title)).toHaveCount(1);

    await page.waitForTimeout(6_000);                                     // past the undo window
    expect(await productExists(request, p.id)).toBe(true);
});

test('E2E-7: search matches the title or the description', async ({ page, request }) => {
    const word = `kiwi${uid()}`;
    await createProduct(request, { title: `E2E-7 Soap ${word}` });
    await createProduct(request, { title: `E2E-7 Shampoo ${uid()}`, description: `Smells like ${word}` });
    await createProduct(request, { title: `E2E-7 Brush ${uid()}` });

    await page.goto('/');
    await search(page, word);

    await expect(page).toHaveURL(`/products/search?q=${word}`);
    await expect(page.locator('article')).toHaveCount(2);
    await expect(card(page, 'Soap')).toHaveCount(1);
    await expect(card(page, 'Shampoo')).toHaveCount(1);
});

test('E2E-8: pagination over 25 search results', async ({ page, request }) => {
    const word = `pg${uid()}`;
    for (let i = 1; i <= 25; i++) {
        await createProduct(request, { title: `E2E-8 Item ${word} ${String(i).padStart(2, '0')}` });
    }
    await page.goto('/');
    await search(page, word);

    const nav = page.locator('main nav').last();
    await expect(nav).toContainText('Hiển thị 1-10 trong 25 sản phẩm');
    await expect(page.locator('article')).toHaveCount(10);
    for (const n of ['1', '2', '3']) await expect(nav.getByRole('button', { name: n, exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: '4', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await nav.getByRole('button', { name: '3', exact: true }).click();
    await expect(page).toHaveURL(`/products/search?q=${word}&page=3`);
    await expect(nav).toContainText('Hiển thị 21-25 trong 25 sản phẩm');
    await expect(page.locator('article')).toHaveCount(5);
    await expect(nav.getByRole('button', { name: 'Next' })).toBeDisabled();
});

test('E2E-9: a product that does not exist shows the 404 screen', async ({ page }) => {
    await page.goto('/products/999999');
    await expect(page.getByText('Sản phẩm không tồn tại')).toBeVisible();
    await page.getByRole('button', { name: '← Về danh sách' }).click();
    await expect(page).toHaveURL('/');
});
