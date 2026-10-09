import { useState, useEffect } from 'react'
import { getProducts } from '../api/productsQuerParam';

export function useProducts({ page, limit, query = "", sortBy = '', order = 'asc'  }) {
    const skip = limit * (page - 1);

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
            ? getProducts({ q: query, limit, skip, sortBy, order }) // check xem là search hay là lấy danh sách full
            : getProducts({ limit, skip, sortBy, order });

        request
            .then(data => {
                setProducts(data.products);
                setTotal(data.total);
                setStatus('success');
            })
            .catch(err => { setError(err); setStatus('error'); });
    }, [page, limit, query, sortBy, order, reloadKey])

    const retry = () => setReloadKey(k => k + 1);
    return { products, total, status, error, retry }
}