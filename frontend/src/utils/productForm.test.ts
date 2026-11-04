// Spec: docs/specs/frontend-utils.spec.md, sections 4–7 (VAL-*, PAY-*, FORM-*, CHG-*)
import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import {
    EMPTY_FORM,
    buildPayload,
    getChangedFields,
    productToForm,
    validateProduct,
    type FormImage,
    type ProductFormValues,
} from './productForm';

// a form that passes validation; tests change one field at a time
const validForm = (overrides: Partial<ProductFormValues> = {}): ProductFormValues => ({
    ...EMPTY_FORM,
    title: 'Red Lipstick',
    description: 'A nice lipstick',
    category: 'beauty',
    price: '12.5',
    stock: '10',
    ...overrides,
});

const product = (overrides: Partial<Product> = {}): Product => ({
    id: 1,
    title: 'Red Lipstick',
    description: 'A nice lipstick',
    category: 'beauty',
    brand: null,
    sku: 'SKU-1',
    price: 11.49,
    discountPercentage: 5,
    rating: 4.5,
    stock: 0,
    minimumOrderQuantity: 2,
    availabilityStatus: 'In Stock',
    weight: null,
    dimensions: { width: 10, height: null, depth: 3.5 },
    warrantyInformation: null,
    shippingInformation: 'Ships in 2 days',
    returnPolicy: null,
    thumbnail: null,
    reviewCount: 0,
    tags: ['beauty', 'lipstick'],
    images: [],
    reviews: [],
    meta: { barcode: null, qrCode: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ...overrides,
});

describe('validateProduct', () => {
    it('a valid form has no errors', () => {
        expect(validateProduct(validForm())).toEqual({});
    });

    it('VAL-1: title is required (spaces only = empty)', () => {
        expect(validateProduct(validForm({ title: '' })).title).toBe('Tên sản phẩm là bắt buộc.');
        expect(validateProduct(validForm({ title: '   ' })).title).toBe('Tên sản phẩm là bắt buộc.');
    });

    it('VAL-2: title must be 3–100 characters after trimming', () => {
        const msg = 'Tên phải từ 3–100 ký tự.';
        expect(validateProduct(validForm({ title: 'ab' })).title).toBe(msg);
        expect(validateProduct(validForm({ title: '  ab  ' })).title).toBe(msg);
        expect(validateProduct(validForm({ title: 'x'.repeat(101) })).title).toBe(msg);
        expect(validateProduct(validForm({ title: 'abc' })).title).toBeUndefined();
        expect(validateProduct(validForm({ title: 'x'.repeat(100) })).title).toBeUndefined();
    });

    it('VAL-3: description is required', () => {
        expect(validateProduct(validForm({ description: '  ' })).description).toBe('Mô tả là bắt buộc.');
    });

    it('VAL-4: category must be one of CATEGORIES', () => {
        expect(validateProduct(validForm({ category: '' })).category).toBe('Hãy chọn danh mục.');
        expect(validateProduct(validForm({ category: 'toys' })).category).toBe('Hãy chọn danh mục.');
        expect(validateProduct(validForm({ category: 'furniture' })).category).toBeUndefined();
    });

    it('VAL-5: price is required and must be > 0', () => {
        expect(validateProduct(validForm({ price: '' })).price).toBe('Giá là bắt buộc.');
        for (const price of ['0', '-1', 'abc']) {
            expect(validateProduct(validForm({ price })).price, price).toBe('Giá phải lớn hơn 0.');
        }
        expect(validateProduct(validForm({ price: '0.01' })).price).toBeUndefined();
    });

    it('VAL-6: stock is required and must be an integer ≥ 0', () => {
        expect(validateProduct(validForm({ stock: '' })).stock).toBe('Tồn kho là bắt buộc.');
        for (const stock of ['1.5', '-1', 'abc']) {
            expect(validateProduct(validForm({ stock })).stock, stock).toBe('Tồn kho phải là số nguyên ≥ 0.');
        }
        expect(validateProduct(validForm({ stock: '0' })).stock).toBeUndefined();
    });

    it('VAL-7: optional fields never produce errors', () => {
        expect(validateProduct(validForm({ brand: '', sku: '', weight: '', width: '', returnPolicy: '' }))).toEqual({});
    });

    it('VAL-8: the empty form reports every required field at once', () => {
        expect(Object.keys(validateProduct(EMPTY_FORM)).sort())
            .toEqual(['category', 'description', 'price', 'stock', 'title']);
    });
});

describe('buildPayload', () => {
    it('PAY-1: title and description are trimmed', () => {
        const payload = buildPayload(validForm({ title: '  Lipstick  ', description: ' Red ' }), []);
        expect(payload.title).toBe('Lipstick');
        expect(payload.description).toBe('Red');
    });

    it('PAY-2: empty number fields become undefined, others become numbers', () => {
        const payload = buildPayload(validForm({ price: '12.5', stock: '3', weight: '' }), []);
        expect(payload.price).toBe(12.5);
        expect(payload.stock).toBe(3);
        expect(payload.weight).toBeUndefined();
        expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('weight');
    });

    it('PAY-3: optional text is trimmed, empty becomes undefined', () => {
        const payload = buildPayload(validForm({ brand: ' Apple ', sku: '   ' }), []);
        expect(payload.brand).toBe('Apple');
        expect(payload.sku).toBeUndefined();
    });

    it('PAY-4: empty availabilityStatus becomes undefined', () => {
        expect(buildPayload(validForm({ availabilityStatus: '' }), []).availabilityStatus).toBeUndefined();
        expect(buildPayload(validForm({ availabilityStatus: 'Low Stock' }), []).availabilityStatus).toBe('Low Stock');
    });

    it('PAY-5: width, height, depth are grouped into dimensions', () => {
        const payload = buildPayload(validForm({ width: '1', height: '2', depth: '' }), []);
        expect(payload.dimensions).toEqual({ width: 1, height: 2, depth: undefined });
    });

    it('PAY-6: tags are passed through and images default to []', () => {
        expect(buildPayload(validForm(), ['a', 'b']).tags).toEqual(['a', 'b']);
        expect(buildPayload(validForm(), []).images).toEqual([]);
        expect(buildPayload(validForm(), [], ['/uploads/x.jpg']).images).toEqual(['/uploads/x.jpg']);
    });

    it('PAY-7: no barcode field (the backend generates it)', () => {
        expect(buildPayload(validForm(), [])).not.toHaveProperty('barcode');
    });
});

describe('productToForm', () => {
    it('FORM-1: numbers become strings', () => {
        const form = productToForm(product());
        expect(form.price).toBe('11.49');
        expect(form.stock).toBe('0');
        expect(form.minimumOrderQuantity).toBe('2');
    });

    it('FORM-2: null becomes an empty string', () => {
        const form = productToForm(product({ brand: null, weight: null }));
        expect(form.brand).toBe('');
        expect(form.weight).toBe('');
    });

    it('FORM-3: dimensions are flattened', () => {
        const form = productToForm(product({ dimensions: { width: 10, height: null, depth: 3.5 } }));
        expect(form).toMatchObject({ width: '10', height: '', depth: '3.5' });
    });

    it('FORM-4: round trip keeps the same numbers and text', () => {
        const p = product();
        const payload = buildPayload(productToForm(p), p.tags);
        expect(payload).toMatchObject({
            title: p.title,
            category: p.category,
            price: p.price,
            stock: p.stock,
            sku: p.sku,
            dimensions: { width: 10, height: undefined, depth: 3.5 },
            tags: p.tags,
        });
    });
});

describe('getChangedFields', () => {
    const initial = validForm();
    const urls = ['/uploads/a.jpg', '/uploads/b.jpg'];
    const fromDb = (url: string, id = url): FormImage => ({ id, previewUrl: url, url });

    it('CHG-1: nothing changed gives an empty set', () => {
        const changed = getChangedFields({ ...initial }, initial, ['x'], ['x'], urls.map(u => fromDb(u)), urls);
        expect(changed.size).toBe(0);
    });

    it('CHG-2: each changed form field is listed by id', () => {
        const changed = getChangedFields(validForm({ title: 'New title', price: '99' }), initial, [], []);
        expect([...changed].sort()).toEqual(['price', 'title']);
    });

    it('CHG-3: tags added, removed or reordered count as changed', () => {
        expect(getChangedFields(initial, initial, ['a', 'b', 'c'], ['a', 'b']).has('tags')).toBe(true);
        expect(getChangedFields(initial, initial, ['a'], ['a', 'b']).has('tags')).toBe(true);
        expect(getChangedFields(initial, initial, ['b', 'a'], ['a', 'b']).has('tags')).toBe(true);
        expect(getChangedFields(initial, initial, ['a', 'b'], ['a', 'b']).has('tags')).toBe(false);
    });

    it('CHG-4: images added, removed or reordered count as changed', () => {
        const newFile: FormImage = { id: 'new', previewUrl: 'blob:1', file: new File(['x'], 'x.png') };
        const same = urls.map(u => fromDb(u));
        expect(getChangedFields(initial, initial, [], [], same, urls).has('images')).toBe(false);
        expect(getChangedFields(initial, initial, [], [], [...same, newFile], urls).has('images')).toBe(true);
        expect(getChangedFields(initial, initial, [], [], [same[0]], urls).has('images')).toBe(true);
        expect(getChangedFields(initial, initial, [], [], [same[1], same[0]], urls).has('images')).toBe(true);
    });
});
