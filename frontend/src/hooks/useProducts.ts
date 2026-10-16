import { useState, useEffect } from 'react'
import { getProducts } from '../api/productsQuerParam';
import type { ApiError } from '../api/client';
import type { ProductSummary, SortField, SortOrder } from '../types/product';

export type ProductsStatus = 'loading' | 'success' | 'error';

interface UseProductsParams {
    page: number;
    limit: number;
    query?: string;
    sortBy?: SortField | '';
    order?: SortOrder;
}

export function useProducts({ page, limit, query = "", sortBy = '', order = 'asc' }: UseProductsParams) {
    const skip = limit * (page - 1);

    const [products, setProducts] = useState<ProductSummary[]>([]); // lưu array 10 products
    const [total, setTotal] = useState<number | undefined>() // track cho "trong .... sản phẩm" góc trái dưới màn hình
    const [status, setStatus] = useState<ProductsStatus>("loading"); // track 3 trạng thái

    // track error state và cho thử lại
    const [error, setError] = useState<ApiError | null>(null); // có đang error ko
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

    return { products, total, status, error, retry}
}