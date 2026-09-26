import { useState, useEffect } from 'react'
import { getProducts } from '../api/productsQuerParam';

export function useProducts({ page, limit }) {
    const skip = 10 * (page - 1);

    const [products, setProducts] = useState([]); // lưu array 10 products
    const [total, setTotal] = useState() // track cho trong .... sản phẩm góc trái dưới màn hình
    const [status, setStatus] = useState("loading"); // track 3 trạng thái

    useEffect(() => {
        setStatus('loading'); // set lại mỗi khi chuyển trang
        getProducts({ limit, skip })
            .then(data => {
                setProducts(data.products);
                setTotal(data.total);
                setStatus('success');
            })
            .catch(() => {
                setStatus('error');
            })
    }, [page, limit])
    return (
        { products, total, status }
    )

}