import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Next.js không có useBlocker như React Router -> tự chặn 3 kiểu rời trang:
//   (1) click <Link>/<a>   (2) nút back của trình duyệt   (3) refresh / đóng tab
// shouldGuard: true -> chặn rời trang
// trả về blocker giống React Router: { state: 'unblocked' | 'blocked', proceed(), reset() }
export function useUnsavedChangesGuard(shouldGuard: boolean) {
    const router = useRouter();
    // hàm "đi tiếp" của lần điều hướng đang bị chặn; null = ko chặn gì
    const [pending, setPending] = useState<(() => void) | null>(null);
    const hasSentinel = useRef(false);   // đã pushState 1 entry "lính gác" để bắt nút back chưa
    const leaving = useRef(false);       // đã bấm "Rời trang" -> ko chặn nữa

    useEffect(() => {
        if (!shouldGuard) return;

        // (1) click link: bắt ở capture phase của window -> chạy trước onClick của <Link> (React nghe ở document)
        // chỉ chặn khi sang trang KHÁC (cùng pathname = vd chỉ đổi ?query -> cho qua)
        const handleClick = (e: MouseEvent) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // mở tab mới -> cho qua
            const a = (e.target as Element | null)?.closest?.('a');
            if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
            const url = new URL(a.href, window.location.href);
            if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
            e.preventDefault();
            e.stopPropagation();
            setPending(() => () => router.push(url.pathname + url.search + url.hash));
        };

        // (2) back: thêm 1 entry trùng URL -> bấm back chỉ lùi về entry thật của trang này (vẫn ở trang)
        // rồi hỏi người dùng; "Rời trang" -> back thêm 1 lần nữa
        if (!hasSentinel.current) {
            window.history.pushState(window.history.state, '', window.location.href);
            hasSentinel.current = true;
        }
        const handlePopState = () => {
            if (leaving.current) return;
            hasSentinel.current = false;
            setPending(() => () => window.history.back());
        };

        // (3) refresh / đóng tab: trình duyệt tự hiện hộp "Leave site?" (không tuỳ biến được)
        // đã bấm "Rời trang" mà back sang 1 trang load riêng (vd gõ URL trực tiếp) -> ko hỏi lần 2
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (leaving.current) return;
            e.preventDefault();
            e.returnValue = '';   // trình duyệt cũ cần dòng này
        };

        window.addEventListener('click', handleClick, true);
        window.addEventListener('popstate', handlePopState);
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('click', handleClick, true);
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [shouldGuard, router]);

    return {
        state: pending ? 'blocked' as const : 'unblocked' as const,
        // "Rời trang": bỏ chặn rồi đi tiếp
        proceed: () => {
            leaving.current = true;
            setPending(null);
            pending?.();
        },
        // "Ở lại": đóng dialog; nếu entry lính gác đã bị back mất -> thêm lại
        reset: () => {
            setPending(null);
            if (!hasSentinel.current) {
                window.history.pushState(window.history.state, '', window.location.href);
                hasSentinel.current = true;
            }
        },
    };
}
