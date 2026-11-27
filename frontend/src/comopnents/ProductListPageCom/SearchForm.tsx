import { useId, useState } from "react";
import type { FormEvent } from "react";
import SearchBar from "./SearchBar";
import Button from "./Button";
import Sorting from "./Sorting";
import type { SortChange } from "./Sorting";
import type { SortField, SortOrder } from "../../types/product";
import { checkPriceRange, MSG_MIN_GT_MAX } from "../../utils/priceRange";

export interface PriceRange {
    minPrice: string;
    maxPrice: string;
}

export interface PriceFieldErrors {
    minPrice?: string;
    maxPrice?: string;
}

interface SearchFormProps {
    initialValue?: string;
    initialMinPrice?: string;
    initialMaxPrice?: string;
    urlKey?: string; // identifies the applied URL
    onSearch: (query: string, range: PriceRange) => void;
    sortBy: SortField;
    order: SortOrder;
    handleSort: (next: SortChange) => void;
    isError?: boolean;
    fieldErrors?: PriceFieldErrors; // messages of a 400 from the server
}

// client-side messages; `pair` = the min > max message (goes away when either input is edited)
interface ClientErrors {
    min?: string;
    max?: string;
    pair: boolean;
}

const inputClass = "h-10 w-[150px] rounded-control border bg-surface px-3.5 max-xs:w-full";

// searchInput nằm ở đây thay vì ProductList → gõ phím chỉ re-render SearchForm
function SearchForm({
    initialValue = "", initialMinPrice = "", initialMaxPrice = "",
    urlKey = "", onSearch, sortBy, order, handleSort, isError = false, fieldErrors,
}: SearchFormProps) {
    const [searchInput, setSearchInput] = useState(initialValue); // Track Search input hiện tại
    const [minInput, setMinInput] = useState(initialMinPrice);
    const [maxInput, setMaxInput] = useState(initialMaxPrice);
    const [clientErrors, setClientErrors] = useState<ClientErrors | null>(null);
    const [dismissedServer, setDismissedServer] = useState<PriceFieldErrors | undefined>(undefined);
    // applied URL changed (search, sort, page, Back) -> range inputs go back to the applied range, messages go away
    const [seenUrlKey, setSeenUrlKey] = useState(urlKey);
    if (seenUrlKey !== urlKey) {
        setSeenUrlKey(urlKey);
        setMinInput(initialMinPrice);
        setMaxInput(initialMaxPrice);
        setClientErrors(null);
    }
    const baseId = useId();
    const minErrId = `${baseId}-min-error`;
    const maxErrId = `${baseId}-max-error`;

    const serverErrors = fieldErrors && fieldErrors !== dismissedServer ? fieldErrors : undefined;
    const minError = clientErrors?.min ?? serverErrors?.minPrice;
    const maxError = clientErrors?.max ?? serverErrors?.maxPrice;

    const editMin = (value: string) => {
        setMinInput(value);
        setDismissedServer(fieldErrors);
        setClientErrors((prev) => {
            if (!prev) return prev;
            const next: ClientErrors = prev.pair ? { pair: false } : { max: prev.max, pair: false };
            return next.max ? next : null;
        });
    };
    const editMax = (value: string) => {
        setMaxInput(value);
        setDismissedServer(fieldErrors);
        setClientErrors((prev) => {
            if (!prev) return prev;
            const next: ClientErrors = prev.pair ? { pair: false } : { min: prev.min, pair: false };
            return next.min ? next : null;
        });
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const result = checkPriceRange(minInput, maxInput);
        if (!result.ok) {
            setClientErrors({ ...result.errors, pair: result.errors.min === MSG_MIN_GT_MAX });
            return; // nothing is sent, URL and list stay
        }
        setClientErrors(null);
        onSearch(searchInput.trim(), { minPrice: result.min, maxPrice: result.max }); // chỉ báo lên cha khi submit
    }

    console.log("searchForm rendered");
    return (
        <form onSubmit={handleSubmit}>
            <SearchBar value={searchInput} onChange={setSearchInput} isError={isError} />
            <div className="flex items-start gap-3 max-xs:w-full max-xs:flex-col max-xs:gap-2">
                <div className="flex flex-col gap-1 max-xs:w-full">
                    <label htmlFor={`${baseId}-min`} className="text-meta text-muted">Giá tối thiểu ($)</label>
                    <input
                        id={`${baseId}-min`}
                        type="text"
                        inputMode="decimal"
                        value={minInput}
                        onChange={(e) => editMin(e.target.value)}
                        className={`${inputClass} ${minError ? "border-danger" : "border-line"}`}
                        {...(minError ? { "aria-invalid": true, "aria-describedby": minErrId } : {})}
                    />
                    {minError && <p id={minErrId} className="text-meta text-danger">{minError}</p>}
                </div>
                <div className="flex flex-col gap-1 max-xs:w-full">
                    <label htmlFor={`${baseId}-max`} className="text-meta text-muted">Giá tối đa ($)</label>
                    <input
                        id={`${baseId}-max`}
                        type="text"
                        inputMode="decimal"
                        value={maxInput}
                        onChange={(e) => editMax(e.target.value)}
                        className={`${inputClass} ${maxError ? "border-danger" : "border-line"}`}
                        {...(maxError ? { "aria-invalid": true, "aria-describedby": maxErrId } : {})}
                    />
                    {maxError && <p id={maxErrId} className="text-meta text-danger">{maxError}</p>}
                </div>
            </div>
            <Button text="Search" type="submit" />
            <div style={{ flexGrow: 1 }}></div>
            <Sorting sortBy={sortBy} order={order} onChange={handleSort} />
        </form>
    )
}

export default SearchForm;
