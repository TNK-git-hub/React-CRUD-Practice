import "../styles/pages/ProductDetail.css";

import { Link, useParams } from "react-router-dom";
import { useProduct } from "../hooks/useProduct";
import ImageGallery from "../comopnents/ProductDetail/ImageGallery";
import StarRating from "../comopnents/ProductDetail/StarRating";
import PriceBlock from "../comopnents/ProductDetail/PriceBlock";
import StockStatus from "../comopnents/ProductDetail/StockStatus";
import SpecGrid from "../comopnents/ProductDetail/SpecGrid";
import TagsContainer from "../comopnents/ProductDetail/TagsContainer";
import CommentsContainer from "../comopnents/ProductDetail/CommentsContainer";

function ProductDetail() {
    const { id } = useParams();
    const { product, status } = useProduct(id)

    if (status === "loading") return <main className="product-detail-main"></main>;// tạm
    if (status === "error") return <main className="product-detail-main"></main>; //tạm 

    return (
        // <h1>Product {id}</h1>;
        <main className="product-detail-main">
            <div className="path-data-div">
                <nav className="path-nav">
                    <Link to="/" className="return-to-product ">Products</Link>
                    <span className="typo-cap-meta">/</span>
                    <span className="typo-cap-meta">{product.category}</span>
                    <span className="typo-cap-meta">/</span>
                    <span className="typo-cap-meta"><strong>{product.title}</strong></span>
                </nav>
                <span className="product-route-badge">{`/products/${product.id}`}</span>
            </div>
            <div className="product-display-container"> {/* phần thông tin phía trên */}
                <ImageGallery key={product.id} images={product.images} title={product.title} />
                <div className="product-data-display">
                    <div className="detail-badges">
                        <span className="detail-pill detail-pill-accent">{product.category}</span>
                        <span className="detail-pill">{product.brand}</span>
                        <span className="detail-sku">{product.sku}</span>
                    </div>
                    <h1 className="detail-title typo-h1">{product.title}</h1>
                    <StarRating rating={product.rating} ratingCount={product.reviews.length} />
                    <PriceBlock price={product.price} discountPercentage={product.discountPercentage} />
                    <StockStatus status={product.availabilityStatus} stock={product.stock} minimum={product.minimumOrderQuantity} />
                    <p className="product-detail-description typo-body">{product.description}</p>
                    <SpecGrid
                        weight={product.weight}
                        dimensions={product.dimensions}
                        warrantyInformation={product.warrantyInformation}
                        shippingInformation={product.shippingInformation}
                        returnPolicy={product.returnPolicy}
                        barcode={product.meta.barcode}
                    />
                    <TagsContainer tags={product.tags} />
                </div>
            </div>
            <section className="product-bottom-section">
                <h2>Đánh giá
                    <span className="num-of-reviews">
                        {` (${product.reviews.length})`}
                    </span>
                </h2>
                <CommentsContainer reviews={product.reviews} />
            </section>
        </main>
    )
}

export default ProductDetail;