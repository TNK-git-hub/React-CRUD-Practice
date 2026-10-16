import type { ReactNode } from "react";
import "../../styles/StatusMessage.css"

type StatusIcon = "exclamation" | "magnifier" | "404";

interface StatusMessageProps {
    icon: StatusIcon;
    title: string;
    description: ReactNode;
    code?: string;
    action: () => void;
}

// hàm trả icon
function returnIcon(icon: StatusIcon) {
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
    if (icon === "404") {
        return (
            <span className="four04-container">
                404
            </span>
        );
    }
    return null;
}

function returnTextBtn(icon: StatusIcon) {
    if (icon === "exclamation") {
        return "Thử lại";
    }
    if (icon === "magnifier") {
        return "Xoá từ khoá";
    }
    if (icon === "404") {
        return "← Về danh sách";
    }
    return null;
}

function returnBtnStyle(icon: StatusIcon) {
    if (icon === "exclamation" || icon === "404") {
        return "accent-btn";
    }
    if (icon === "magnifier") {
        return "surface-btn";
    }
    return null;
}

export default function StatusMessage({ icon, title, description, code, action }: StatusMessageProps) {
    return (
        <div className="status-message-outer-container">
            <div className="status-message-container">
                {returnIcon(icon)}
                <p className="status-title">{title}</p>
                <p className="status-desc">{description}</p>
                {code && <code className="status-code">{code}</code>}
                <button className={returnBtnStyle(icon) ?? undefined} onClick={action}>{returnTextBtn(icon)}</button>
            </div>
        </div>

    );
}
