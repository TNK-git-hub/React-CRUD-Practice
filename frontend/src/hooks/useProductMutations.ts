import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { createProduct, deleteProduct, updateProduct } from '../api/productsQuerParam';
import { productKeys } from '../api/queryKeys';
import type { ApiError } from '../api/client';
import type { DeletedProduct, Product, ProductListResponse, ProductPayload } from '../types/product';

// DELETE: optimistic update -> xoá khỏi list trong cache NGAY, ko chờ server
export function useDeleteProduct() {
    const queryClient = useQueryClient();

    return useMutation<DeletedProduct, ApiError, number, { snapshot: [QueryKey, ProductListResponse | undefined][] }>({
        mutationFn: (id) => deleteProduct(id),

        // (1) chạy TRƯỚC khi gửi request
        onMutate: async (id) => {
            // dừng các fetch list đang chạy -> response cũ ko ghi đè lên thay đổi của mình
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            // lưu data cũ của mọi page list để rollback
            const snapshot = queryClient.getQueriesData<ProductListResponse>({ queryKey: productKeys.lists() });
            // bỏ product khỏi mọi page list đang có trong cache -> UI cập nhật luôn
            queryClient.setQueriesData<ProductListResponse>({ queryKey: productKeys.lists() }, (old) =>
                old && { ...old, products: old.products.filter(p => p.id !== id), total: old.total - 1 });
            return { snapshot }; // -> onError nhận được
        },

        // (2) server báo lỗi -> trả data cũ lại (rollback)
        onError: (_err, _id, ctx) => {
            ctx?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
        },

        // (3) xoá xong -> bỏ cache detail của product đó
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: productKeys.detail(id) });
        },

        // (4) thành công hay lỗi -> fetch lại list thật từ server (vd: page bị thiếu 1 dòng sau khi xoá)
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
    });
}

// PATCH: ko optimistic (lỗi thì user cần ở lại form), nhưng dùng response để cập nhật cache detail
export function useUpdateProduct() {
    const queryClient = useQueryClient();

    return useMutation<Product, ApiError, { id: number; data: Partial<ProductPayload> }>({
        mutationFn: ({ id, data }) => updateProduct(id, data),
        onSuccess: (updated) => {
            queryClient.setQueryData(productKeys.detail(updated.id), updated); // trang detail hiện data mới luôn, ko gọi api lại
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });  // title / price trong list có thể đã đổi
        },
    });
}

// POST: cần id từ server mới điều hướng được -> chờ response
export function useCreateProduct() {
    const queryClient = useQueryClient();

    return useMutation<Product, ApiError, ProductPayload>({
        mutationFn: (data) => createProduct(data),
        onSuccess: (created) => {
            queryClient.setQueryData(productKeys.detail(created.id), created); // trang detail ko phải loading
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });  // list có thêm 1 product
        },
    });
}
