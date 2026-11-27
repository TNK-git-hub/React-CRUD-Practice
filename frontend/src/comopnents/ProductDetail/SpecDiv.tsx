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
        <div className="flex flex-col gap-[3px] border-b border-line py-[11px]">
            <span className="text-[10.5px] font-bold tracking-[0.08em] text-muted uppercase">
                {name}
            </span>
            <span className="text-[13.5px] font-medium text-ink">
                {displayValue}
            </span>
        </div>
    )
}   