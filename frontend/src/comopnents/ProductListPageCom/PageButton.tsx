import type { ReactNode } from "react";

interface PageButtonProps {
    children: ReactNode;
    disabled?: boolean;
    onClick: () => void;
    active?: boolean; // trang hiện tại -> nền accent
}

const base =
    "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-[5px] rounded-[9px] border px-2.5 " +
    "font-sans text-[13px] font-semibold disabled:cursor-default disabled:opacity-50";

function PageButton({ children, disabled, onClick, active = false }: PageButtonProps) {
    // active ko có hover: 2 class nền cùng lúc thì hover: luôn thắng (variant sinh sau trong CSS)
    // enabled:hover -> nút disabled (Previous ở trang 1) ko đổi màu khi rê chuột
    const color = active
        ? "border-line bg-accent text-surface hover:border-accent"
        : "border-line bg-surface text-ink enabled:hover:border-accent enabled:hover:bg-accent-soft enabled:hover:text-accent";

    return (
        <button className={`${base} ${color}`}
            disabled={disabled}
            onClick={onClick}>
            {children}
        </button>
    )
}

export default PageButton;
