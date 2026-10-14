import "../../styles/ProductFormStyle/PreviewCard.css";
import getPreviousPrice from "../../utils/getPreviousPrice";

// shows the product card live while the user fills in the form
function PreviewCard({ title, category, price, discountPercentage }) {
    const priceNum = Number(price) || 0;               // '' -> 0
    const discount = Number(discountPercentage) || 0;
    const hasDiscount = discount > 0 && discount < 100;

    return (
        <div className="preview-card">
            <div className="preview-media">{title.trim().charAt(0).toUpperCase() || '?'}</div>
            <div className="preview-body">
                <div className="preview-category">{category || 'Danh mục'}</div>
                <span className="preview-title">{title.trim() || 'Tên sản phẩm'}</span>
                <div className="preview-price-row">
                    <span className="preview-price">${priceNum.toFixed(2)}</span>
                    {hasDiscount && (
                        <span className="preview-old-price">${getPreviousPrice(priceNum, discount)}</span>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PreviewCard;
