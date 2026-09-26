import apiFetch from "./client";

// lưu querry param
// get Products
// Thông tin product items
// - giảm giá
// - ảnh đồ
// - category
// - brand
// - title
// - rating
// - price 
export function getProducts({ limit = 10, skip = 0 } = {}) {
    return apiFetch(`/products?limit=${limit}&skip=${skip}&select=discountPercentage,category,brand,title,rating,price`)
}




