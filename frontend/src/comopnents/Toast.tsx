import '../styles/Toast.css';

// toast ở giữa trên màn hình — theo design CrudStates; RootLayout lo việc hiện/ẩn
//   created: "Tạo thành công" (201) — navigate(..., { state: { toast } }) gửi object này
//   deleted: "Xoá thành công + hoàn tác" — onUndo có thì hiện nút Hoàn tác
//   error:   API lỗi -> toast đỏ
export type ToastData =
    | { kind: 'created'; title: string; id: number }
    | { kind: 'deleted'; title: string; onUndo?: () => void }
    | { kind: 'error'; title: string; message: string };

interface ToastProps {
    toast: ToastData;
    onClose: () => void;
}

function Toast({ toast, onClose }: ToastProps) {
    if (toast.kind === 'error') {
        return (
            <div role="alert" className="toast toast-error">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.3v.2" /></svg>
                <p className="toast-text">
                    Không xoá được <strong>{toast.title}</strong> — {toast.message}
                </p>
            </div>
        );
    }

    return (
        <div role="status" className="toast">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            {toast.kind === 'created' ? (
                <p className="toast-text">
                    Đã tạo <strong>{toast.title}</strong> — id <code>{toast.id}</code>.
                </p>
            ) : (
                <>
                    <p className="toast-text">Đã xoá <strong>{toast.title}</strong>.</p>
                    {toast.onUndo && (
                        <button type="button" className="toast-undo"
                            onClick={() => { toast.onUndo?.(); onClose(); }}>
                            Hoàn tác
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default Toast;
