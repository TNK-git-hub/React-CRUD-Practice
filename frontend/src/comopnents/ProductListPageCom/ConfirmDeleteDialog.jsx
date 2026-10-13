import { useEffect, useRef } from "react";
import "../../styles/ConfirmDeleteDialog.css";

function ConfirmDeleteDialog({ product, isDeleting, error, onCancel, onConfirm }) {
    const dialogRef = useRef(null);

    // open as a modal when mounted: gives backdrop, Esc, focus trap
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();   // StrictMode runs this twice in dev
    }, []);

    // a click on the dark backdrop is reported on the <dialog> itself
    const handleBackdropClick = (e) => {
        if (e.target === dialogRef.current && !isDeleting) onCancel();
    };

    return (
        <dialog ref={dialogRef} className="confirm-dialog"
            onCancel={(e) => { if (isDeleting) e.preventDefault(); }}   // Esc: chặn đóng khi đang xoá
            onClose={onCancel}
            onClick={handleBackdropClick}>
            <div className="confirm-dialog-body">
                <span className="confirm-dialog-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
                        <path d="M10.5 11v5.5M13.5 11v5.5" />
                    </svg>
                </span>
                <h2>Xoá sản phẩm này?</h2>
                <p>
                    <strong>{product.title}</strong> #{product.id} sẽ bị gỡ khỏi danh sách.
                    Hành động này không thể hoàn tác.
                </p>
                <code>DELETE /products/{product.id}</code>

                {error && <p className="confirm-dialog-error" role="alert">Xoá thất bại: {error}</p>}

                <div className="confirm-dialog-actions">
                    <button type="button" className="button-secondary" onClick={onCancel} disabled={isDeleting}>
                        Huỷ
                    </button>
                    <button type="button" className="button-container danger" onClick={onConfirm} disabled={isDeleting}>
                        {isDeleting ? "Đang xoá…" : "Xoá sản phẩm"}
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default ConfirmDeleteDialog;
