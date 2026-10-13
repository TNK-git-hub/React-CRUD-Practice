import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "../../styles/CardMenu.css";

// phần menu ... để bám sửa hoặc xoá sản phẩm
function CardMenu({ product, onDelete }) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    // close when the user clicks outside the menu or presses Esc
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e) => {
            if (!menuRef.current.contains(e.target)) setIsOpen(false);
        };
        const handleEsc = (e) => {
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
        <div className="card-menu" ref={menuRef}>
            <button type="button" className="card-menu-trigger"
                aria-label={`Tác vụ cho ${product.title}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(o => !o)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="5.5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="18.5" r="1.9" />
                </svg>
            </button>

            {isOpen && (
                <div role="menu" className="card-menu-list">
                    <Link role="menuitem" to={`/products/${product.id}/edit`} className="card-menu-item">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="M14.5 5.5L18.5 9.5" /></svg>
                        Sửa
                    </Link>
                    <button type="button" role="menuitem" className="card-menu-item danger" onClick={handleDelete}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></svg>
                        Xoá
                    </button>
                </div>
            )}
        </div>
    );
}

export default CardMenu;
