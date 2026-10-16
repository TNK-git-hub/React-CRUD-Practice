import { useEffect, useRef } from 'react';
import '../../styles/ProductFormStyle/SaveErrorBanner.css';

// error: Error từ apiFetch (có .status) hoặc TypeError của fetch (backend tắt -> không có .status)
// formId: "Thử lại" submit lại form này (giống bấm Lưu)
interface SaveErrorBannerProps {
    error: Error | null;
    formId: string;
}

function SaveErrorBanner({ error, formId }: SaveErrorBannerProps) {
    const ref = useRef<HTMLDivElement>(null);

    // design: hiện banner ở đầu form và cuộn tới nó (mount lại mỗi lần lỗi -> cuộn lại)
    useEffect(() => {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    return (
        <div ref={ref} role="alert" className="save-error-banner">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.3v.2" /></svg>
            <p className='error-message-text'>
                Lưu thất bại — <code>{`HTTP 500`}</code>.
                Dữ liệu trong form vẫn được giữ.
            </p>
            <button type="submit" form={formId} className="save-error-retry">Thử lại</button>
        </div>
    );
}

export default SaveErrorBanner;
