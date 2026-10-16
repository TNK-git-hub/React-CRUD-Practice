import apiFetch from "./client";
import type { DeletedProduct, Product, ProductListResponse, ProductPayload, SortField, SortOrder } from "../types/product";

export interface ProductQuery {
    q?: string;
    limit?: number;
    skip?: number;
    sortBy?: SortField | ''; // '' = sort theo id
    order?: SortOrder;
}

// dùng cho search
// export function searchProduct(query, { limit = 10, skip = 0 } = {}) {
//     return apiFetch(`/products/search?q=${encodeURIComponent(query)}&limit=${limit}&skip=${skip}`)
// }
// ------ merge searhProduct và getProducts: dùng dummyjson sang getProducts với backend
export function getProducts({ q = '', limit = 10, skip = 0, sortBy = '', order = 'asc' }: ProductQuery = {}) {
    const params = new URLSearchParams({ limit: String(limit), skip: String(skip), order }); // URLSearchParams chỉ nhận string
    if (q) params.set('q', q);
    if (sortBy) params.set('sortBy', sortBy);
    return apiFetch<ProductListResponse>(`/products?${params}`);
}

// dùng cho product detail
export function getProductById(id: number | string) {
    return apiFetch<Product>(`/products/${id}`)
}

// POST /products/add: create a new product
export function createProduct(data: ProductPayload) {
    return apiFetch<Product>('/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

// POST /uploads: upload one image, returns { url }
export function uploadImage(file: File) { //IMG_FeToBe
    const body = new FormData(); //IMG_FeToBe
    body.append('file', file); //IMG_FeToBe: "file" must match FileInterceptor('file') on the backend
    return apiFetch<{ url: string }>('/uploads', { method: 'POST', body }); //IMG_FeToBe: no Content-Type -> the browser adds "multipart/form-data; boundary=..."
} //IMG_FeToBe

// DELETE /products/:id: delete a product
export function deleteProduct(id: number | string) {
    return apiFetch<DeletedProduct>(`/products/${id}`, { method: 'DELETE' });
}

// PATCH /products/:id: update some fields of a product
export function updateProduct(id: number | string, data: Partial<ProductPayload>) {
    return apiFetch<Product>(`/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}



