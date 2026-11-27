import getPreviousPrice from "../../utils/getPreviousPrice"

interface PriceBlockProps {
    price: number;
    discountPercentage: number;
}

export default function PriceBlock({ price, discountPercentage }: PriceBlockProps) {
    return (
        <div className="flex items-baseline gap-3 pt-3.5 pb-0.5">
            <span className="text-[40px] font-bold tracking-[-0.02em] text-ink">{`$${price}`}</span>
            <span className="text-[15px] line-through">{`$${getPreviousPrice(price, discountPercentage)}`}</span>
            <span className="rounded-pill bg-accent px-[9px] py-1 font-bold text-surface">{`-`}{discountPercentage}%</span>
        </div>
    )
}