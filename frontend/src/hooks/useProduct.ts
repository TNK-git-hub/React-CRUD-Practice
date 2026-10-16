import { useState, useEffect } from 'react'
import { getProductById } from '../api/productsQuerParam';
import type { ApiError } from '../api/client';
import type { Product } from '../types/product';

export type ProductStatus = 'loading' | 'success' | 'error' | 'notfound';

export function useProduct(id: number | string) {
    const [product, setProduct] = useState<Product | null>(null);
    const [status, setStatus] = useState<ProductStatus>("loading");
    const [error, setError] = useState<ApiError | null>(null);
    const [retryCount, setRetryCount] = useState(0); // đổi số này → useEffect chạy lại

    useEffect(() => {
        setStatus('loading');
        getProductById(id)
            .then(data => {
                setProduct(data);
                setStatus('success');
            })
            .catch((err) => {
                setError(err);
                setStatus(err.status === 404 ? 'notfound' : 'error');
            })
    }, [id, retryCount])

    // retry (thử lại): gọi lại API, truyền id nhưng tăng retryCount để useEffect chạy
    const retry = () => setRetryCount((prev) => prev + 1);

    return { product, status, error, retry }
}
