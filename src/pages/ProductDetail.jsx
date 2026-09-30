import "../styles/pages/ProductDetail.css";

import { Link, useParams } from "react-router-dom";
import { useProduct } from "../hooks/useProduct";

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
                    <span className="typo-cap-meta">cate</span>
                    <span className="typo-cap-meta">t</span>
                    <span className="typo-cap-meta">title</span>
                </nav>
                <span className="product-route-badge">{`/products/${product.id}`}</span>
            </div>
        </main>
    )
}

export default ProductDetail;