import { useState, useEffect } from 'react'
import { getProducts, searchProduct } from '../api/productsQuerParam';

export function useProducts({ page, limit, query = "" }) {
    const skip = 10 * (page - 1);

    const [products, setProducts] = useState([]); // lưu array 10 products
    const [total, setTotal] = useState() // track cho "trong .... sản phẩm" góc trái dưới màn hình
    const [status, setStatus] = useState("loading"); // track 3 trạng thái

    // track error state và cho thử lại
    const [error, setError] = useState(null); // có đang error ko
    const [reloadKey, setReloadKey] = useState(0); // mỗi lần reload

    useEffect(() => {
        setStatus('loading');
        setError(null)
        const request = query
            ? searchProduct(query, { limit, skip }) // check xem là search hay là lấy danh sách full
            : getProducts({ limit, skip });

        request
            .then(data => {
                setProducts(data.products);
                setTotal(data.total);
                setStatus('success');
            })
            .catch(err => { setError(err); setStatus('error'); });
    }, [page, limit, query, reloadKey])

    const retry = () => setReloadKey(k => k + 1);
    return { products, total, status, error, retry }
}