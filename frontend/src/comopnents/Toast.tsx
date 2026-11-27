// toast ở giữa trên màn hình — theo design CrudStates; Providers (app/providers.tsx) lo việc hiện/ẩn
//   created: "Tạo thành công" (201) — showToast() rồi router.push() sang trang mới
//   deleted: "Xoá thành công + hoàn tác" — onUndo có thì hiện nút Hoàn tác
//   error:   API lỗi -> toast đỏ
// khung chung: giữa trên màn hình, max 420px (trừ lề 16px mỗi bên trên mobile)
const box =
    'fixed top-6 left-1/2 z-1000 flex max-w-[min(420px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2.5 ' +
    'rounded-xl border px-3.5 py-3 shadow-[0_10px_26px_rgba(0,0,0,.16)]';
const icon = 'size-[18px] shrink-0';
const text = 'grow font-sans text-[12.5px] leading-[1.45] text-ink';

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
            <div role="alert" className={`${box} border-danger-soft bg-danger-soft`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className={`${icon} stroke-danger`}
                    fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.3v.2" /></svg>
                <p className={text}>
                    Không xoá được <strong>{toast.title}</strong> — {toast.message}
                </p>
            </div>
        );
    }

    return (
        <div role="status" className={`${box} border-line bg-surface`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className={`${icon} stroke-ok`}
                fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            {toast.kind === 'created' ? (
                <p className={text}>
                    Đã tạo <strong>{toast.title}</strong> — id <code className="rounded-none bg-transparent p-0 font-mono text-[11px] text-inherit">{toast.id}</code>.
                </p>
            ) : (
                <>
                    <p className={text}>Đã xoá <strong>{toast.title}</strong>.</p>
                    {toast.onUndo && (
                        <button type="button"
                            className="h-7 shrink-0 cursor-pointer rounded-badge bg-chip px-2.5 font-sans text-meta font-bold text-ink hover:bg-line"
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
