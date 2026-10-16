import type { ReactNode } from "react";

type StatusIcon = "exclamation" | "magnifier" | "404";

interface StatusMessageProps {
    icon: StatusIcon;
    title: string;
    description: ReactNode;
    code?: string;
    action: () => void;
}

// hàm trả icon (svg ko có viewBox -> toạ độ = px, giữ y như CSS cũ)
const iconCircle = 'flex size-14 items-center justify-center rounded-pill bg-chip';

function returnIcon(icon: StatusIcon) {
    if (icon === "exclamation") {
        return (
            <span className={iconCircle}>
                <svg className="size-[26px] stroke-danger" fill="none" strokeWidth={1.8} strokeLinecap="round">
                    <circle cx={12} cy={12} r={9} />
                    <path d="M 12 7.5 v 5.2 M 12 16.3 v 0.2" />
                </svg>
            </span>
        )
    }
    if (icon === "magnifier") {
        return (
            <span className={iconCircle}>
                <svg className="size-7 stroke-muted" fill="none" strokeWidth={1.7} strokeLinecap="round">
                    <circle cx={10.5} cy={10.5} r={6.5} />
                    <path d="M 20 20 l -4.6 -4.6 M 8 10.5 h 5" />
                </svg>
            </span>
        );
    }
    if (icon === "404") {
        return (
            <span className="font-display text-[46px] leading-none text-[#877E70]">
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

// màu nút: thử lại / về danh sách = accent, xoá từ khoá = viền trắng
function returnBtnStyle(icon: StatusIcon) {
    if (icon === "exclamation" || icon === "404") {
        return "bg-accent text-surface";
    }
    if (icon === "magnifier") {
        return "border border-line bg-surface text-ink";
    }
    return "";
}

export default function StatusMessage({ icon, title, description, code, action }: StatusMessageProps) {
    return (
        <div className="flex grow flex-col justify-center">
            <div className="flex flex-col items-center gap-2.5 py-2 text-center">
                {returnIcon(icon)}
                <p className="font-sans text-[15px] font-semibold text-ink">{title}</p>
                <p className="max-w-[330px] font-sans text-[13px] leading-normal text-muted">{description}</p>
                {code && <code>{code}</code>}
                <button className={`mt-1 h-[38px] cursor-pointer rounded-control px-[18px] font-sans text-[13px] font-semibold ${returnBtnStyle(icon)}`}
                    onClick={action}>{returnTextBtn(icon)}</button>
            </div>
        </div>

    );
}
