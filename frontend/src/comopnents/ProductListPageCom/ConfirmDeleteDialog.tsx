import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { btn } from "../../utils/buttonStyles";
import { dialog } from "../../utils/dialogStyles";
import type { ProductSummary } from "../../types/product";

interface ConfirmDeleteDialogProps {
    product: Pick<ProductSummary, "id" | "title">; // chỉ cần id + title -> dùng được cho cả list và detail
    isDeleting: boolean;
    error: string | null;
    onCancel: () => void;
    onConfirm: () => void;
}

function ConfirmDeleteDialog({ product, isDeleting, error, onCancel, onConfirm }: ConfirmDeleteDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    // open as a modal when mounted: gives backdrop, Esc, focus trap
    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();   // StrictMode runs this twice in dev
    }, []);

    // a click on the dark backdrop is reported on the <dialog> itself
    const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
        if (e.target === dialogRef.current && !isDeleting) onCancel();
    };

    return (
        <dialog ref={dialogRef} className={dialog.box}
            onCancel={(e) => { if (isDeleting) e.preventDefault(); }}   // Esc: chặn đóng khi đang xoá
            onClose={onCancel}
            onClick={handleBackdropClick}>
            <div className={dialog.body}>
                <span className="flex size-[46px] items-center justify-center rounded-pill bg-danger-soft" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="size-[21px] stroke-danger" fill="none" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
                        <path d="M10.5 11v5.5M13.5 11v5.5" />
                    </svg>
                </span>
                <h2 className={dialog.title}>Xoá sản phẩm này?</h2>
                <p className={dialog.text}>
                    <strong>{product.title}</strong> #{product.id} sẽ bị gỡ khỏi danh sách.
                    Hành động này không thể hoàn tác.
                </p>
                <code className="text-meta text-muted">DELETE /products/{product.id}</code>

                {error && <p className="rounded-control bg-danger-soft px-3 py-2.5 text-[13px] leading-[1.4] text-danger" role="alert">Xoá thất bại: {error}</p>}

                <div className={dialog.actions}>
                    <button type="button" className={btn.secondary} onClick={onCancel} disabled={isDeleting}>
                        Huỷ
                    </button>
                    <button type="button" className={btn.danger} onClick={onConfirm} disabled={isDeleting}>
                        {isDeleting ? "Đang xoá…" : "Xoá sản phẩm"}
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default ConfirmDeleteDialog;
