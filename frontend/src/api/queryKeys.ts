import type { ProductQuery } from './productsQuerParam';

// query key = "tên" của 1 data trong cache TanStack Query
// key dạng mảng, từ chung -> riêng, để invalidate theo nhóm:
//   invalidateQueries({ queryKey: productKeys.all })     -> mọi thứ về products
//   invalidateQueries({ queryKey: productKeys.lists() }) -> mọi trang list, ko đụng detail
export const productKeys = {
    all: ['products'] as const,
    lists: () => [...productKeys.all, 'list'] as const,
    list: (params: ProductQuery) => [...productKeys.lists(), params] as const, // mỗi page / search / sort = 1 key riêng
    details: () => [...productKeys.all, 'detail'] as const,
    // String(): id từ URL là "5", product.id là 5 -> cùng 1 key
    detail: (id: number | string) => [...productKeys.details(), String(id)] as const,
};
