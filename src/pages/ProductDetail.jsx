import "../styles/pages/ProductDetail.css";

import { Link, useParams, useNavigate } from "react-router-dom";
import { useProduct } from "../hooks/useProduct";
import ImageGallery from "../comopnents/ProductDetail/ImageGallery";
import StarRating from "../comopnents/ProductDetail/StarRating";
import PriceBlock from "../comopnents/ProductDetail/PriceBlock";
import StockStatus from "../comopnents/ProductDetail/StockStatus";
import SpecGrid from "../comopnents/ProductDetail/SpecGrid";
import TagsContainer from "../comopnents/ProductDetail/TagsContainer";
import CommentsContainer from "../comopnents/ProductDetail/CommentsContainer";
import StatusMessage from "../comopnents/ProductListPageCom/StatusMessage";

function ProductDetail() {
    const { id } = useParams();
    const { product, status } = useProduct(id)
    const navigate = useNavigate(); // hook của react router dom, trả về một hàm navigate chuyển trang theo tham số đường dẫn 

    const returnToProductPage = () => navigate("/");

    if (status === "loading") return <main className="product-detail-main"></main>;// tạm
    if (status === "error") return <StatusMessage // TH: lỗi API
        icon="exclamation"
        title="Không tải dược danh sách sản phẩm"
        description="Yêu cầu tới DummyJSON thất bại. Kiểm tra kết nối mạng rồi thử lại."
        code={`HTTP ${error.status} · /${error.path}`}
        action={retry} />;
    if (status === "notfound") return <StatusMessage // TH: ko tìm thấy sp
        icon="404"
        title="Sản phẩm không tồn tại"
        description={<>DummyJSON trả về <code className="four04-code-style">404</code> cho id này. Hiển thị màn hình trống kèm lối quay lại danh sách</>}
        action={returnToProductPage} />;
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