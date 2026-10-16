import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

// shouldGuard: true -> chặn rời trang
// trả về blocker: { state: 'unblocked' | 'blocked' | 'proceeding', proceed(), reset() }
export function useUnsavedChangesGuard(shouldGuard: boolean) {
    // điều hướng trong app (Link, back/forward, navigate()): chỉ chặn khi sang trang KHÁC
    // (cùng pathname = vd chỉ đổi ?query -> cho qua)
    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
        shouldGuard && currentLocation.pathname !== nextLocation.pathname);

    // refresh / đóng tab: trình duyệt tự hiện hộp "Leave site?" (không tuỳ biến được)
    useEffect(() => {
        if (!shouldGuard) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';   // trình duyệt cũ cần dòng này
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [shouldGuard]);

    return blocker;
}
