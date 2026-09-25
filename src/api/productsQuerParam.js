import apiFetch from "./client";

// lưu querry param
// get Products
export function getProducts({ limit = 10, skip = 0 }) {
    return apiFetch(`/products?limit=${limit}&skip=${skip}`)
}

//Search Product

