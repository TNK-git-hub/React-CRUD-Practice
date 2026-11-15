import { isSortField, isSortOrder } from './sortParams';
import { checkPriceRange } from './priceRange';
import type { SortField, SortOrder } from '../types/product';

// URL is the only place that holds the applied list state (001-ADR-4)
const KEY_ORDER = ['q', 'minPrice', 'maxPrice', 'page', 'sortBy', 'order'] as const;

type Source = { get(key: string): string | null };

// changes: null / '' / undefined removes a key
export function buildListUrl(
    current: Source,
    changes: Record<string, string | number | null | undefined>,
): string {
    const params = new URLSearchParams();
    for (const key of KEY_ORDER) {
        const value = key in changes ? changes[key] : current.get(key);
        if (value === null || value === undefined || value === '') continue;
        const text = String(value);
        if (key === 'page' && text === '1') continue;
        params.set(key, text);
    }
    const path = params.get('q') ? '/products/search' : '/';
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

export interface ListParams {
    query: string;
    page: number;
    sortBy: SortField;
    order: SortOrder;
    minPrice: string;
    maxPrice: string;
}

type ReadSource = Source & { getAll(key: string): string[] };

export function readListParams(searchParams: ReadSource): ListParams {
    const sortByParam = searchParams.get('sortBy');
    const orderParam = searchParams.get('order');

    // a repeated key is ignored; an invalid side is ignored; min > max ignores both
    const single = (key: string) => {
        const all = searchParams.getAll(key);
        return all.length === 1 ? (all[0] ?? '') : '';
    };
    let minPrice = single('minPrice');
    let maxPrice = single('maxPrice');
    const minCheck = checkPriceRange(minPrice, '');
    const maxCheck = checkPriceRange('', maxPrice);
    if (!minCheck.ok) minPrice = '';
    else minPrice = minCheck.min;
    if (!maxCheck.ok) maxPrice = '';
    else maxPrice = maxCheck.max;
    if (minPrice && maxPrice && !checkPriceRange(minPrice, maxPrice).ok) {
        minPrice = '';
        maxPrice = '';
    }

    return {
        query: searchParams.get('q') ?? '',
        page: Number(searchParams.get('page')) || 1,
        sortBy: isSortField(sortByParam) ? sortByParam : 'title',
        order: isSortOrder(orderParam) ? orderParam : 'asc',
        minPrice,
        maxPrice,
    };
}
