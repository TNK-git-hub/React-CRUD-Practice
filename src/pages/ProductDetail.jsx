import "../styles/pages/ProductDetail.css";

import { Link, useParams } from "react-router-dom";
import { useProduct } from "../hooks/useProduct";
import ImageGallery from "../comopnents/ProductDetail/ImageGallery";

function ProductDetail() {
    const { id } = useParams();
    const { product, status } = useProduct(id)

    if (status === "loading") return <p>Loading...</p>;// tạm
    if (status === "error") return <p>Không tìm thấy sản phẩm</p>; //tạm 

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
            <div className="product-display-container"> {/* checkpoint */}
                <ImageGallery key={product.id} images={product.images} title={product.title} />
                <div className="product-data-display">
                    <div className="detail-badges">
                        <span className="detail-pill detail-pill-accent">{product.category}</span>
                        <span className="detail-pill">{product.brand}</span>
                        <span className="detail-sku">{product.sku}</span>
                    </div>
                    <h1 className="detail-title typo-h1">{product.title}</h1>
                </div>
            </div>
        </main>
    )
}

export default ProductDetail;