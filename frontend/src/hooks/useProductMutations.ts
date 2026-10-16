import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProduct, deleteProduct, updateProduct } from '../api/productsQuerParam';
import { productKeys, productMutationKeys } from '../api/queryKeys';
import { useToast } from './useToast';
import type { ApiError } from '../api/client';
import type { DeletedProduct, Product, ProductListResponse, ProductPayload } from '../types/product';

export const UNDO_MS = 5000; // design: giữ 5s để hoàn tác

export interface DeleteVars {
    id: number;
    title: string;
    undo?: AbortController; // có -> chờ 5s mới gửi DELETE, abort() = hoàn tác
}

// chờ ms, hoặc dừng sớm (reject) khi signal bị abort
function wait(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); });
    });
}

// DELETE: optimistic "qua UI" -> useProducts ẩn mọi product có mutation xoá đang pending
// (ko sửa cache: trong 5s chờ, refetch lấy lại product từ server cũng ko hiện lại)
// hoàn tác / lỗi -> mutation hết pending -> card tự hiện lại, ko cần rollback
export function useDeleteProduct() {
    const queryClient = useQueryClient();
    const showToast = useToast();

    return useMutation<DeletedProduct, Error, DeleteVars>({
        mutationKey: productMutationKeys.delete,
        mutationFn: async ({ id, undo }) => {
            if (undo) await wait(UNDO_MS, undo.signal); // hoàn tác trong 5s -> reject, ko gửi request
            return deleteProduct(id);
        },

        // xoá xong: bỏ product khỏi cache luôn, rồi fetch lại list thật
        // return promise -> mutation còn pending tới khi fetch xong -> card ko nháy hiện lại
        onSuccess: (_data, { id }) => {
            queryClient.setQueriesData<ProductListResponse>({ queryKey: productKeys.lists() }, (old) =>
                old && { ...old, products: old.products.filter(p => p.id !== id), total: old.total - 1 });
            queryClient.removeQueries({ queryKey: productKeys.detail(id) });
            return queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        },

        // xoá chạy nền (có undo) mà lỗi -> toast đỏ; hoàn tác thì ko báo lỗi
        // (callback ở useMutation vẫn chạy dù trang đã unmount)
        onError: (err, { title, undo }) => {
            if (undo && !undo.signal.aborted) showToast({ kind: 'error', title, message: err.message });
        },
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
