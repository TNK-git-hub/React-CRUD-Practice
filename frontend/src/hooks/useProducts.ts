import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getProducts } from '../api/productsQuerParam';
import type { ProductQuery } from '../api/productsQuerParam';
import { productKeys } from '../api/queryKeys';
import type { ApiError } from '../api/client';
import type { ProductListResponse, SortField, SortOrder } from '../types/product';

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

    // check xem là search hay là lấy danh sách full
    const params: ProductQuery = query
        ? { q: query, limit, skip, sortBy, order }
        : { limit, skip, sortBy, order };

    // mỗi page / search / sort = 1 key riêng -> quay lại page cũ lấy từ cache, ko loading
    const { data, status, error, refetch } = useQuery<ProductListResponse, ApiError>({
        queryKey: productKeys.list(params),
        queryFn: () => getProducts(params),
        placeholderData: keepPreviousData, // đang tải page mới -> giữ data page cũ, ko nháy loading
    });

    const retry = () => { refetch(); };

    return {
        products: data?.products ?? [], // lưu array 10 products
        total: data?.total, // track cho "trong .... sản phẩm" góc trái dưới màn hình
        status: (status === 'pending' ? 'loading' : status) as ProductsStatus, // track 3 trạng thái
        error,
        retry,
    }
}
