import apiFetch from "./client";

// dùng cho search
// export function searchProduct(query, { limit = 10, skip = 0 } = {}) {
//     return apiFetch(`/products/search?q=${encodeURIComponent(query)}&limit=${limit}&skip=${skip}`)
// }
// ------ merge searhProduct và getProducts: dùng dummyjson sang getProducts với backend
export function getProducts({ q = '', limit = 10, skip = 0, sortBy = '', order = 'asc' } = {}) {
    const params = new URLSearchParams({ limit, skip, order });
    if (q) params.set('q', q);
    if (sortBy) params.set('sortBy', sortBy);
    return apiFetch(`/products?${params}`);
}

// dùng cho product detail
export function getProductById(id) {
    return apiFetch(`/products/${id}`)
}

// POST /products/add: create a new product
export function createProduct(data) {
    return apiFetch('/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

// DELETE /products/:id: delete a product
export function deleteProduct(id) {
    return apiFetch(`/products/${id}`, { method: 'DELETE' });
}

// PATCH /products/:id: update some fields of a product
export function updateProduct(id, data) {
    return apiFetch(`/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}



