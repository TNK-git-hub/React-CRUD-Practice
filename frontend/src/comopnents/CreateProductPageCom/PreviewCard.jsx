import "../../styles/CreateProductElementStyle/PreviewCard.css";

// tạm thời hardcode; khi có state sẽ truyền props vào
function PreviewCard() {
    return (
        <div className="preview-card">
            <div className="preview-media">?</div>
            <div className="preview-body">
                <div className="preview-category">beauty</div>
                <span className="preview-title">Tên sản phẩm</span>
                <div className="preview-price-row">
                    <span className="preview-price">$0.00</span>
                    <span className="preview-old-price">$0.00</span>
                </div>
            </div>
        </div>
    )
}

export default PreviewCard;
