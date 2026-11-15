import type { SortField, SortOrder } from '../types/product';
import { isSortField, isSortOrder } from './sortParams';
import { checkPriceRange } from './priceRange';

type Source = { get(key: string): string | null; getAll(key: string): string[] };

const KEYS = ['q', 'minPrice', 'maxPrice', 'page', 'sortBy', 'order'] as const;

// current: URL hiện tại; changes: các key muốn đổi (null / '' = xoá). Trả về path + query (001-ADR-4)
export function buildListUrl(
    current: Source,
    changes: Record<string, string | number | null | undefined>,
): string {
    const next = new URLSearchParams();
    for (const key of KEYS) {
        const value = key in changes ? changes[key] : current.get(key);
        if (value === null || value === undefined || value === '') continue;
        const text = String(value);
        if (key === 'page' && text === '1') continue;
        next.set(key, text);
    }
    const path = next.get('q') ? '/products/search' : '/';
    const qs = next.toString();
    return qs ? `${path}?${qs}` : path;
}

export interface ListParams {
    q: string;
    page: number;
    sortBy: SortField;
    order: SortOrder;
    minPrice: string;
    maxPrice: string;
}

// khoảng giá không hợp lệ -> bỏ qua (không bound, không message)
function readRange(searchParams: Source): { minPrice: string; maxPrice: string } {
    const one = (key: string) => {
        const all = searchParams.getAll(key);
        return all.length === 1 ? all[0] : '';
    };
    let min = one('minPrice');
    let max = one('maxPrice');

    const minCheck = checkPriceRange(min, '');
    const maxCheck = checkPriceRange('', max);
    if (!minCheck.ok) min = '';
    if (!maxCheck.ok) max = '';

    const pair = checkPriceRange(min, max);
    if (!pair.ok) return { minPrice: '', maxPrice: '' }; // min > max
    return { minPrice: pair.min, maxPrice: pair.max };
}

export function readListParams(searchParams: Source): ListParams {
    const sortByParam = searchParams.get('sortBy');
    const orderParam = searchParams.get('order');
    return {
        q: searchParams.get('q') ?? '',
        page: Number(searchParams.get('page')) || 1,
        sortBy: isSortField(sortByParam) ? sortByParam : 'title',
        order: isSortOrder(orderParam) ? orderParam : 'asc',
        ...readRange(searchParams),
    };
}
