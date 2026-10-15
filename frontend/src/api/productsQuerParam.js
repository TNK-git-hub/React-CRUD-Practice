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

// POST /uploads: upload one image, returns { url }
export function uploadImage(file) { //IMG_FeToBe
    const body = new FormData(); //IMG_FeToBe
    body.append('file', file); //IMG_FeToBe: "file" must match FileInterceptor('file') on the backend
    return apiFetch('/uploads', { method: 'POST', body }); //IMG_FeToBe: no Content-Type -> the browser adds "multipart/form-data; boundary=..."
} //IMG_FeToBe

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



