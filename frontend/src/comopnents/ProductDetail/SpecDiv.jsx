import "../../styles/ProductDetailElementStyle/SpecDiv.css"

export default function SpecDiv({ name, value, unit = "" }) {
    const isObject = typeof value === "object"; // vì tái sử dụng SpecDiv, nhưng chỉ có trường hợp dimensions là object

    const displayValue = isObject
        ? Object.values(value).join(" × ") + ` ${unit}`   // { 23.17, 14.43, 28.01 } → [23.17 × 14.43 × 28.01] → "23.17 × 14.43 × 28.01"
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