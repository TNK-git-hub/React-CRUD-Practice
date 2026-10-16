import SpecDiv from "./SpecDiv";
import type { Dimensions } from "../../types/product";

interface SpecGridProps {
    weight: number | null;
    dimensions: Dimensions;
    warrantyInformation: string | null;
    shippingInformation: string | null;
    returnPolicy: string | null;
    barcode: string | null;
}

export default function SpecGrid({
    weight,
    dimensions,
    warrantyInformation,
    shippingInformation,
    returnPolicy,
    barcode }: SpecGridProps) {
    return (
        <div className="mt-1.5 grid grid-cols-3 gap-x-7">
            <SpecDiv name="Weight" value={weight} unit={"g"} />
            <SpecDiv name="Dimensions" value={dimensions} unit={"cm"} />
            <SpecDiv name="Warranty Information" value={warrantyInformation} />
            <SpecDiv name="Shipping Information" value={shippingInformation} />
            <SpecDiv name="Return Policy" value={returnPolicy} />
            <SpecDiv name="Barcode" value={barcode} />
        </div >
    )
}