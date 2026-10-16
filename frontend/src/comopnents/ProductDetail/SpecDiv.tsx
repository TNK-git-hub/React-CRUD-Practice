import "../../styles/ProductDetailElementStyle/SpecDiv.css"
import type { Dimensions } from "../../types/product";

interface SpecDivProps {
    name: string;
    value: string | number | Dimensions | null | undefined;
    unit?: string;
}

export default function SpecDiv({ name, value, unit = "" }: SpecDivProps) {
    const isEmpty = value === null || value === undefined;
    const isObject = !isEmpty && typeof value === "object"; // typeof null === "object", so check isEmpty first

    const displayValue = isEmpty
        ? "—"
        : isObject
            ? Object.values(value).join(" × ") + ` ${unit}`
            : value + ` ${unit}`;


    return (
        <div className="spec-div-container">
            <span className="spec-name">
                {name}
            </span>
            <span className="spec-value">
                {displayValue}
            </span>
        </div>
    )
}   