import "../../styles/ProductDetailElementStyle/PriceBlock.css"

import getPreviousPrice from "../../utils/getPreviousPrice"

interface PriceBlockProps {
    price: number;
    discountPercentage: number;
}

export default function PriceBlock({ price, discountPercentage }: PriceBlockProps) {
    return (
        <div className="price-block">
            <span className="current-price">{`$${price}`}</span>
            <span className="pre-price">{`$${getPreviousPrice(price, discountPercentage)}`}</span>
            <span className="discount-pill">{`-`}{discountPercentage}%</span>
        </div>
    )
}