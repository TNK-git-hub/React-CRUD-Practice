import { useQuery } from '@tanstack/react-query';
import { getProductById } from '../api/productsQuerParam';
import { productKeys } from '../api/queryKeys';
import type { ApiError } from '../api/client';
import type { Product } from '../types/product';

export type ProductStatus = 'loading' | 'success' | 'error' | 'notfound';

export function useProduct(id: number | string) {
    // TanStack Query lo state data / loading / error + cache theo key, ko cần useState + useEffect nữa
    const { data, status, error, refetch } = useQuery<Product, ApiError>({
        queryKey: productKeys.detail(id),
        queryFn: () => getProductById(id),
    });

    // đổi status của TanStack ('pending' | 'error' | 'success') về status cũ -> page ko phải sửa
    let productStatus: ProductStatus = 'success';
    if (status === 'pending') productStatus = 'loading';
    else if (status === 'error') productStatus = error?.status === 404 ? 'notfound' : 'error';

    // retry (thử lại): gọi lại API
    const retry = () => { refetch(); };

    return { product: data ?? null, status: productStatus, error, retry }
}
