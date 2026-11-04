import { expect, type APIRequestContext } from '@playwright/test';
import { API_URL } from '../playwright.config';

// unique per test run, so tests only ever see their own products
export const uid = () => Math.random().toString(36).slice(2, 8);

export interface CreatedProduct {
    id: number;
    title: string;
    price: number;
}

// create a product straight through the backend API (faster than the form)
export async function createProduct(
    request: APIRequestContext,
    data: { title: string; description?: string; price?: number; stock?: number },
): Promise<CreatedProduct> {
    const res = await request.post(`${API_URL}/products/add`, {
        data: {
            description: 'Created by an end-to-end test',
            category: 'beauty',
            price: 10,
            discountPercentage: 10,
            stock: 5,
            ...data,
        },
    });
    expect(res.status(), await res.text()).toBe(201);
    return res.json();
}

export async function productExists(request: APIRequestContext, id: number) {
    const res = await request.get(`${API_URL}/products/${id}`);
    return res.status() !== 404;
}
