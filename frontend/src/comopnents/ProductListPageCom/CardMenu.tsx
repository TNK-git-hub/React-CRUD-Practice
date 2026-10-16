import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { ProductSummary } from "../../types/product";

interface CardMenuProps {
    product: ProductSummary;
    onDelete: (product: ProductSummary) => void;
}

const item = "flex cursor-pointer items-center gap-[9px] rounded-badge px-3 py-2 text-left font-sans text-[12.5px] leading-normal font-semibold no-underline";

// phần menu ... để bám sửa hoặc xoá sản phẩm
function CardMenu({ product, onDelete }: CardMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // close when the user clicks outside the menu or presses Esc
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setIsOpen(false);
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEsc);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEsc);
        };
    }, [isOpen]);

    const handleDelete = () => {
        setIsOpen(false);
        onDelete(product);
    };

    return (
        <div ref={menuRef}>
            <button type="button"
                className="absolute top-2 right-2 z-2 flex size-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface"
                aria-label={`Tác vụ cho ${product.title}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(o => !o)}>
                <svg viewBox="0 0 24 24" className="size-[15px] fill-ink" aria-hidden="true">
                    <circle cx="12" cy="5.5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="18.5" r="1.9" />
                </svg>
            </button>

            {isOpen && (
                <div role="menu" className="absolute top-10 right-2 z-5 flex w-[146px] flex-col gap-0.5 rounded-control border border-line bg-surface p-[5px] shadow-[0_10px_26px_rgba(0,0,0,0.18)]">
                    <Link role="menuitem" to={`/products/${product.id}/edit`} className={`${item} text-ink hover:bg-chip`}>
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="M14.5 5.5L18.5 9.5" /></svg>
                        Sửa
                    </Link>
                    <button type="button" role="menuitem" className={`${item} text-danger hover:bg-danger-soft`} onClick={handleDelete}>
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></svg>
                        Xoá
                    </button>
                </div>
            )}
        </div>
    );
}

export default CardMenu;
