import "../../styles/ProductCard.css";
import defaultProductImg from "../../assets/website-7-kh-2026-08-12t163109-795.jpg";


// Thông tin product items
// - giảm giá

// - category
// - brand
// - title
// - rating
// - price 

function ProductCard({ product }) {
    const title = product.title;
    const category = product.category;
    const brand = product.brand;
    const rating = product.rating;
    const price = product.price;
    const discountPercentage = product.discountPercentage;

    // Tính toán các giá trị hiển thị
    const discount = Math.round(discountPercentage);
    const previousPrice = (price / (1 - (discountPercentage / 100))).toFixed(2);

    return (
        <article className='product-card-container'>
            <div className="product-image-block">
                <span className="discount-badge">-{discount}%</span>
                <img alt="product pic" src={defaultProductImg} />
            </div>
            <div className="product-card-detail">
                <div className="category-and-brand">{`${category} - ${brand}`}</div>
                <a className="product-title" href="#">{title}</a>
                <div className="rating">
                    <svg data-dc-tpl="56" width="12" height="12" viewBox="0 0 24 24" fill="#B4531F" aria-hidden="true"><path data-dc-tpl="57" d="M12 2.4l2.86 6.02 6.44.86-4.7 4.6 1.16 6.55L12 17.32 6.24 20.43 7.4 13.88l-4.7-4.6 6.44-.86z"></path></svg>
                    <span className="rating-point">{rating}</span>
                    <span className="rating-count">(67)</span>   {/*chỉ có dummy*/}
                </div>
                <div className="price-div">
                    <span className="price">${price}</span>
                    <span className="previous-price">${previousPrice}</span>    {/*Tự tính tự discount và price*/}
                </div>
                <span className=""></span>
            </div>
        </article>
    )
}

export default ProductCard;
