import "../../styles/StatusMessage.css"

// hàm trả icon
function returnIcon(icon) {
    if (icon === "exclamation") {
        return (
            <span className="exclamation-container">
                <svg className="exclamation-svg">
                    <circle className="exclamation-circle" />
                    <path className="exclamation-path" />
                </svg>
            </span>
        )
    }
    if (icon === "magnifier") {
        return (
            <span className="magnifier-container">
                <svg className="magnifier-svg">
                    <circle className="magnifier-circle" />
                    <path className="magnifier-path" />
                </svg>
            </span>
        );
    }
    return null;
}

function returnTextBtn(icon) {
    if (icon === "exclamation") {
        return "Thử lại";
    }
    if (icon === "magnifier") {
        return "Xoá từ khoá";
    }
    return null;
}

function returnBtnStyle(icon) {
    if (icon === "exclamation") {
        return "accent-btn";
    }
    if (icon === "magnifier") {
        return "surface-btn";
    }
    return null;
}

export default function StatusMessage({ icon, title, description, code, action }) {
    return (
        <div className="status-message-container">
            {returnIcon(icon)}
            <p className="status-title">{title}</p>
            <p className="status-desc">{description}</p>
            {code && <code className="status-code">{code}</code>}
            <button className={returnBtnStyle(icon)} onClick={action}>{returnTextBtn(icon)}</button>
        </div>
    );
}
