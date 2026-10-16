import type { SortField, SortOrder } from "../../types/product";
import { SORT_FIELDS } from "../../utils/sortParams";

export interface SortChange {
    sortBy: SortField;
    order: SortOrder;
}

interface SortingProps {
    sortBy: SortField;
    order: SortOrder;
    onChange: (next: SortChange) => void;
}

// appearance-none: bỏ giao diện select mặc định của trình duyệt
const select =
    "h-10 appearance-none rounded-control border border-line bg-surface pr-[34px] pl-[13px] font-sans text-[13px] font-medium text-ink";

function Sorting({ sortBy, order, onChange }: SortingProps) {
    return (
        <div className="flex items-center gap-2 max-[401px]:hidden">
            <span>Sắp xếp</span>
            <select value={sortBy} onChange={e => onChange({ sortBy: e.target.value as SortField, order })} name="title" id="title-select" className={select}>
                {SORT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={order} onChange={e => onChange({ sortBy, order: e.target.value as SortOrder })} name="order" id="order-select" className={select}>
                <option value="asc">asc</option>
                <option value="desc">desc</option>
            </select>

        </div>
    )
}

export default Sorting;
