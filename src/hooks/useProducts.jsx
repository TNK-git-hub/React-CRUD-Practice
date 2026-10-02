import { useState, useEffect } from 'react'
import { getProducts, searchProduct } from '../api/productsQuerParam';

export function useProducts({ page, limit, query = "" }) {
    const skip = 10 * (page - 1);

    const [products, setProducts] = useState([]); // lưu array 10 products
    const [total, setTotal] = useState() // track cho "trong .... sản phẩm" góc trái dưới màn hình
    const [status, setStatus] = useState("loading"); // track 3 trạng thái

    useEffect(() => {
        setStatus('loading');
        const request = query
            ? searchProduct(query, { limit, skip }) // check xem là search hay là lấy danh sách full
            : getProducts({ limit, skip });

        request
            .then(data => {
                setProducts(data.products);
                setTotal(data.total);
                setStatus('success');
            })
            .catch(() => setStatus('error'));
    }, [page, limit, query])

    return { products, total, status }
}