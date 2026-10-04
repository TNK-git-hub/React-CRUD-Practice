import "../../styles/ProductCardSkeleton.css";

export default function ProductCardSkeleton() {
    return (
        <article className='product-card-container skeleton-card'>
            <div className="skeleton-image"></div>
            <div className="skeleton-card-detail">
                <div className="skeleton-category-and-brand"></div>
                <div className="skeleton-product-title"></div>
                <div className="skeleton-rating"></div>
                <div className="skeleton-price-div"></div>
            </div>
        </article >
    )
}

