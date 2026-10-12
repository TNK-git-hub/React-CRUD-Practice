import "../../styles/ProductDetailElementStyle/SpecDiv.css"

export default function SpecDiv({ name, value, unit = "" }) {
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