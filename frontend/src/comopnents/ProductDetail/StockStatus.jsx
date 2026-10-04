import "../../styles/ProductDetailElementStyle/StockStatus.css";

export default function StockStatus({ status, stock, minimum }) {
    return (
        <div className="stock-status-container">
            <span className="stock-status-pill">
                <span className="stock-status-dot"></span>
                In Stock
            </span>

            <span className="stock-status-remain-minimum-label">
                còn <strong>{stock}</strong> sản phẩm · đặt tối thiểu <strong>{minimum}</strong>
            </span>

        </div>
    )
}