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
export function getProducts({ limit = 10, skip = 0 } = {}) {
    return apiFetch(`/products?limit=${limit}&skip=${skip}&select=discountPercentage,category,brand,title,rating,price,thumbnail`)
}

    return apiFetch(`/products/search?q=${query}`)
// dùng cho search
export function searchProduct(query, { limit = 10, skip = 0 } = {}) {
    return apiFetch(`/products/search?q=${encodeURIComponent(query)}&limit=${limit}&skip=${skip}&select=discountPercentage,category,brand,title,rating,price,thumbnail`)
}

// dùng cho product detail
export function getProductById(id) {
    return apiFetch(`/products/${id}`)
}
