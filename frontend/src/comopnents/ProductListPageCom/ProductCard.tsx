import "../../styles/ProductCard.css";
import defaultProductImg from "../../assets/website-7-kh-2026-08-12t163109-795.jpg";
import { Link } from "react-router-dom";
import getPreviousPrice from "../../utils/getPreviousPrice";
import CardMenu from "./CardMenu";
import type { Review, ProductSummary } from "../../types/product";

// dummyjson (khi chưa đặt VITE_API_URL) trả reviews thay vì reviewCount
type CardProduct = ProductSummary & { reviews?: Review[] };

interface ProductCardProps {
    product: CardProduct;
    onDelete: (product: ProductSummary) => void;
}

// onDelete: fucntion to handle xoá product
function ProductCard({ product, onDelete }: ProductCardProps) {
    const title = product.title;
    const category = product.category;
    const brand = product.brand;
    const rating = product.rating;
    const price = product.price;
    const discountPercentage = product.discountPercentage;
    const thumbnail = product.thumbnail;
    const ratingCount = product.reviewCount ?? product.reviews?.length ?? 0;

    // Tính toán các giá trị hiển thị
    const discount = Math.round(discountPercentage);
    const previousPrice = getPreviousPrice(price, discountPercentage); // dịch chuyển sang hàm tại utils, để tái sử dụng

    console.log("procard re-redered");
    return (
        <article className='product-card-container'>
            <Link to={`/products/${product.id}`} className="product-card-link">
                <div className="product-image-block">
                    <span className="discount-badge">-{discount}%</span>
                    <img alt="product pic" src={thumbnail ?? undefined} />
                </div>
                <div className="product-card-detail">
                    <div className="category-and-brand">{`${category} - ${brand}`}</div>
                    <div className="category-and-brand mobile">{`${category}`}</div>
                    <h3 className="product-title">{title}</h3>
                    <div className="rating">
                        <svg data-dc-tpl="56" width="12" height="12" viewBox="0 0 24 24" fill="#B4531F" aria-hidden="true"><path data-dc-tpl="57" d="M12 2.4l2.86 6.02 6.44.86-4.7 4.6 1.16 6.55L12 17.32 6.24 20.43 7.4 13.88l-4.7-4.6 6.44-.86z"></path></svg>
                        <span className="rating-point">{rating}</span>
                        <span className="rating-count">{`(${ratingCount})`}</span>
                    </div>
                    <div className="price-div">
                        <span className="price">${price}</span>
                        <span className="previous-price">${previousPrice}</span>    {/*Tự tính tự discount và price*/}
                    </div>
                    <span className=""></span>
                </div>
            </Link >
            <CardMenu product={product} onDelete={onDelete} />
        </article>

    )
}

export default ProductCard;
