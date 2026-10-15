import '../styles/SuccessToast.css';

// toast "Tạo thành công" — theo design CrudStates (201); RootLayout lo việc hiện/ẩn
function SuccessToast({ title, id }) {
    return (
        <div role="status" className="success-toast">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            <p className="success-toast-text">
                Đã tạo <strong>{title}</strong> — id <code>{id}</code>.
            </p>
        </div>
    );
}

export default SuccessToast;
