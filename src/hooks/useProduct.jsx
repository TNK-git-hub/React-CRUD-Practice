import { useState, useEffect } from 'react'
import { getProductById } from '../api/productsQuerParam';

export function useProduct(id) {
    const [product, setProduct] = useState(null);
    const [status, setStatus] = useState("loading");

    useEffect(() => {
        setStatus('loading');
        getProductById(id)
            .then(data => {
                setProduct(data);
                setStatus('success');
            })
            .catch(() => {
                setStatus('error');
            })
    }, [id])

    return { product, status }
}
