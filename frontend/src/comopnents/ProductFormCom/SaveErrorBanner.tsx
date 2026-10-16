import { useEffect, useRef } from 'react';

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
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    return (
        <div ref={ref} role="alert" className="flex items-center gap-2.5 rounded-[11px] bg-danger-soft px-[13px] py-[11px]">
            <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 stroke-danger" fill="none" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.3v.2" /></svg>
            <p className="grow font-sans text-[12.5px] leading-normal text-ink">
                Lưu thất bại — <code className="rounded-none bg-transparent p-0 font-mono text-[11px] text-inherit">{`HTTP 500`}</code>.
                Dữ liệu trong form vẫn được giữ.
            </p>
            <button type="submit" form={formId} className="h-[30px] shrink-0 cursor-pointer rounded-lg border border-danger bg-transparent px-[11px] font-sans text-meta font-semibold text-danger hover:bg-danger/8">Thử lại</button>
        </div>
    );
}

export default SaveErrorBanner;
