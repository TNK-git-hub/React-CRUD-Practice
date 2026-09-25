import "../../styles/ProductCard.css";

// Thông tin product items
// - giảm giá
// - ảnh đồ
// - category
// - brand
// - title
// - rating
// - price 

function ProductCard() {
    return (
        <article className='product-card-container'>
            <div className="product-image-block">
                <span className="discount-badge">-10%</span>
                <span className="replace-img-text">dummy product</span>
            </div>
            <div className="product-card-detail">
                <div className="category-and-brand">cate - brand</div>
                <a className="product-title" href="#">dummy product</a>
                <div className="rating">
                    <svg data-dc-tpl="56" width="12" height="12" viewBox="0 0 24 24" fill="#B4531F" aria-hidden="true"><path data-dc-tpl="57" d="M12 2.4l2.86 6.02 6.44.86-4.7 4.6 1.16 6.55L12 17.32 6.24 20.43 7.4 13.88l-4.7-4.6 6.44-.86z"></path></svg>
                    <span className="rating-point">6.7</span>
                    <span className="rating-count">(67)</span>
                </div>
                <div className="price-div">
                    <span className="price">$9.99</span>
                    <span className="previous-price">$11.11</span>
                </div>
                <span className=""></span>
            </div>
        </article>
    )
}

export default ProductCard;
