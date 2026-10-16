import "../../styles/Sorting.css";

import type { SortField, SortOrder } from "../../types/product";

const SORT_FIELDS: SortField[] = ['title', 'price', 'rating', 'stock'];

export interface SortChange {
    sortBy: SortField;
    order: SortOrder;
}

interface SortingProps {
    sortBy: SortField;
    order: SortOrder;
    onChange: (next: SortChange) => void;
}

function Sorting({ sortBy, order, onChange }: SortingProps) {
    return (
        <div className='sorting-container'>
            <span>Sắp xếp</span>
            <select value={sortBy} onChange={e => onChange({ sortBy: e.target.value as SortField, order })} name="title" id="title-select">
                {SORT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={order} onChange={e => onChange({ sortBy, order: e.target.value as SortOrder })} name="order" id="order-select">
                <option value="asc">asc</option>
                <option value="desc">desc</option>
            </select>

        </div>
    )
}

export default Sorting;
