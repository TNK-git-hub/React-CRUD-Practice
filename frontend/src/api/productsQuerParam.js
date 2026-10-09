import apiFetch from "./client";

// lưu querry param
// get Products
// Thông tin product items
// - giảm giá
// - ảnh đồ// api ko có // api có ảnh, bao gồm thumbnail, images
// - category
// - brand
// - title
// - rating
// - price 
// bỏ select đi vì cuối cùng dùng nhiều properties quá

// export function getProducts({ limit = 10, skip = 0 } = {}) {
//     return apiFetch(`/products?limit=${limit}&skip=${skip}`)
// }

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
