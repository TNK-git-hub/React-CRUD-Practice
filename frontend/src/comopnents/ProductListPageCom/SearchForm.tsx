import { useId, useState } from "react";
import type { FormEvent } from "react";
import SearchBar from "./SearchBar";
import Button from "./Button";
import Sorting from "./Sorting";
import type { SortChange } from "./Sorting";
import type { SortField, SortOrder } from "../../types/product";

export interface PriceRangeInput {
    minPrice: string;
    maxPrice: string;
}

interface SearchFormProps {
    initialValue?: string;
    initialMinPrice?: string;
    initialMaxPrice?: string;
    onSearch: (query: string, range: PriceRangeInput) => void;
    sortBy: SortField;
    order: SortOrder;
    handleSort: (next: SortChange) => void;
    isError?: boolean;
}

const inputClass = "h-10 w-[140px] rounded-control border border-line bg-surface px-3.5 focus:border-accent focus:ring-3 focus:ring-focus-ring max-xs:w-full";
const fieldClass = "flex flex-col gap-1 max-xs:w-full";

// searchInput nằm ở đây thay vì ProductList → gõ phím chỉ re-render SearchForm
function SearchForm({ initialValue = "", initialMinPrice = "", initialMaxPrice = "", onSearch, sortBy, order, handleSort, isError = false }: SearchFormProps) {
    const [searchInput, setSearchInput] = useState(initialValue); // Track Search input hiện tại
    const [minInput, setMinInput] = useState(initialMinPrice);
    const [maxInput, setMaxInput] = useState(initialMaxPrice);
    const id = useId();
    const minId = `${id}-min-price`;
    const maxId = `${id}-max-price`;

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSearch(searchInput.trim(), { minPrice: minInput.trim(), maxPrice: maxInput.trim() }); // chỉ báo lên cha khi submit
    }

    console.log("searchForm rendered");
    return (
        <form onSubmit={handleSubmit}>
            <SearchBar value={searchInput} onChange={setSearchInput} isError={isError} />
            <div className="flex items-end gap-3 max-xs:w-full max-xs:flex-col max-xs:items-stretch">
                <div className={fieldClass}>
                    <label htmlFor={minId}>Giá tối thiểu ($)</label>
                    <input id={minId} type="text" inputMode="decimal" className={inputClass}
                        value={minInput} onChange={(e) => setMinInput(e.target.value)} />
                </div>
                <div className={fieldClass}>
                    <label htmlFor={maxId}>Giá tối đa ($)</label>
                    <input id={maxId} type="text" inputMode="decimal" className={inputClass}
                        value={maxInput} onChange={(e) => setMaxInput(e.target.value)} />
                </div>
            </div>
            <Button text="Search" type="submit" />
            <div style={{ flexGrow: 1 }}></div>
            <Sorting sortBy={sortBy} order={order} onChange={handleSort} />
        </form>
    )
}

export default SearchForm;
