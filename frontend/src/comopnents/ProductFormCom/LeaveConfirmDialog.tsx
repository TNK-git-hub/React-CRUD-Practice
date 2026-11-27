import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { btn } from '../../utils/buttonStyles';
import { dialog } from '../../utils/dialogStyles';   // dùng lại giao diện dialog xoá

// changeCount: số thay đổi chưa lưu
// onStay: blocker.reset   onLeave: blocker.proceed
interface LeaveConfirmDialogProps {
    changeCount: number;
    onStay: () => void;
    onLeave: () => void;
}

function LeaveConfirmDialog({ changeCount, onStay, onLeave }: LeaveConfirmDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    // mở dạng modal khi mount: có backdrop, Esc, focus trap
    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();   // StrictMode chạy 2 lần ở dev
    }, []);

    // click vào nền tối = "Ở lại"
    const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
        if (e.target === dialogRef.current) onStay();
    };

    return (
        <dialog ref={dialogRef} className={dialog.box}
            onClose={onStay}                     // Esc -> close -> ở lại
            onClick={handleBackdropClick}>
            <div className={dialog.body}>
                <h2 className={dialog.title}>Bỏ các thay đổi?</h2>
                <p className={dialog.text}>
                    Bạn có <strong>{changeCount}</strong> thay đổi chưa lưu.
                    Rời trang bây giờ sẽ mất các thay đổi đó.
                </p>
                <div className={dialog.actions}>
                    <button type="button" className={btn.secondary} onClick={onStay}>
                        Ở lại
                    </button>
                    {/* proceed -> blocker.state 'proceeding' -> dialog unmount (không bắn close -> không gọi onStay) */}
                    <button type="button" className={btn.danger} onClick={onLeave}>
                        Rời trang
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default LeaveConfirmDialog;
