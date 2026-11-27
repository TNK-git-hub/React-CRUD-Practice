import { createContext, useContext } from 'react';
import type { ToastData } from '../comopnents/Toast';

// Providers (ko bao giờ unmount) giữ state toast -> trang nào cũng gọi showToast được, kể cả sau khi trang đó unmount
export const ToastContext = createContext<(toast: ToastData) => void>(() => {});

export function useToast() {
    return useContext(ToastContext);
}
