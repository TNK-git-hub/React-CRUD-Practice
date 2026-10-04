import "../../styles/ProductDetailElementStyle/SpecGrid.css"
import SpecDiv from "./SpecDiv.jsx";

export default function SpecGrid({
    weight,
    dimensions,
    warrantyInformation,
    shippingInformation,
    returnPolicy,
    barcode }) {
    return (
        <div className="spec-grid-container">
            <SpecDiv name="Weight" value={weight} unit={"g"} />
            <SpecDiv name="Dimensions" value={dimensions} unit={"cm"} />
            <SpecDiv name="Warranty Information" value={warrantyInformation} />
            <SpecDiv name="Shipping Information" value={shippingInformation} />
            <SpecDiv name="Return Policy" value={returnPolicy} />
            <SpecDiv name="Barcode" value={barcode} />
        </div >
    )
}