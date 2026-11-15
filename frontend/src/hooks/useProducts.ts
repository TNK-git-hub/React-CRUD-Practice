import { useState } from 'react';
import { useQuery, useMutationState, keepPreviousData } from '@tanstack/react-query';
import { getProducts } from '../api/productsQuerParam';
import type { ProductQuery } from '../api/productsQuerParam';
import { productKeys, productMutationKeys } from '../api/queryKeys';
import type { DeleteVars } from './useProductMutations';
import type { ApiError } from '../api/client';
import type { ProductListResponse, SortField, SortOrder } from '../types/product';

export type ProductsStatus = 'loading' | 'success' | 'error';

interface UseProductsParams {
    page: number;
    limit: number;
    query?: string;
    sortBy?: SortField | '';
    order?: SortOrder;
    minPrice?: string;
    maxPrice?: string;
}

export function useProducts({ page, limit, query = "", sortBy = '', order = 'asc', minPrice = '', maxPrice = '' }: UseProductsParams) {
    const skip = limit * (page - 1);

    // check xem là search hay là lấy danh sách full; khoảng giá chỉ vào key khi có (001-ADR-2)
    const params: ProductQuery = { limit, skip, sortBy, order };
    if (query) params.q = query;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;

    // mỗi page / search / sort = 1 key riêng -> quay lại page cũ lấy từ cache, ko loading
    const { data, status, error, refetch, isPlaceholderData } = useQuery<ProductListResponse, ApiError>({
        queryKey: productKeys.list(params),
        queryFn: () => getProducts(params),
        placeholderData: keepPreviousData, // đang tải page mới -> giữ data page cũ, ko nháy loading
    });

    // last successful response: shown again when a new range is rejected with 400 (placeholder data is gone then)
    const [lastData, setLastData] = useState<ProductListResponse | undefined>();
    if (status === 'success' && !isPlaceholderData && data !== lastData) setLastData(data);
    const rejected = status === 'error' && error?.status === 400 && lastData !== undefined;
    const shown = rejected ? lastData : data;

    // id các product đang chờ xoá (5s hoàn tác + lúc gửi request) -> ẩn khỏi list = optimistic
    const deletingIds = useMutationState({
        filters: { mutationKey: productMutationKeys.delete, status: 'pending' },
        select: (mutation) => (mutation.state.variables as DeleteVars).id,
    });

    const retry = () => { refetch(); };

    const allProducts = shown?.products ?? [];
    const products = allProducts.filter(p => !deletingIds.includes(p.id)); // lưu array 10 products
    const hiddenCount = allProducts.length - products.length;

    return {
        products,
        total: shown && shown.total - hiddenCount,
        shownPage: shown && shown.limit > 0 ? Math.floor(shown.skip / shown.limit) + 1 : page,
        fieldErrors: error?.status === 400 ? error.errors : undefined, // track cho "trong .... sản phẩm" góc trái dưới màn hình
        status: (rejected ? 'success' : status === 'pending' ? 'loading' : status) as ProductsStatus, // track 3 trạng thái
        error,
        retry,
    }
}
