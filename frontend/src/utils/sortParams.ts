import type { SortField, SortOrder } from '../types/product';

// các field backend cho sort (= SORTABLE_FIELDS ở backend)
export const SORT_FIELDS: readonly SortField[] = ['title', 'price', 'rating', 'stock'];

// giá trị từ URL có thể là bất kỳ string nào (người dùng tự gõ) -> check trước khi dùng
export const isSortField = (v: string | null): v is SortField => SORT_FIELDS.includes(v as SortField);
export const isSortOrder = (v: string | null): v is SortOrder => v === 'asc' || v === 'desc';
