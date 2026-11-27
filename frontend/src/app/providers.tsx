'use client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import Header from '../comopnents/Header'
import type { Theme } from '../comopnents/Header'
import Toast from '../comopnents/Toast'
import type { ToastData } from '../comopnents/Toast'
import { ToastContext } from '../hooks/useToast'
import { UNDO_MS } from '../hooks/useProductMutations'
import { ApiError } from '../api/client'

// cache chung cho cả app: data của mỗi query key được lưu ở đây
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // trong 30s data còn "fresh" -> quay lại trang ko gọi api lại
        // lỗi 4xx (404, 400...) gọi lại vẫn lỗi -> ko retry; lỗi mạng / 5xx thử tối đa 2 lần
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
      mutations: {
        // mặc định offline -> mutation bị "paused", online lại mới gửi -> ko lỗi, ko rollback
        // 'always': luôn gửi request -> offline thì lỗi ngay -> rollback + báo lỗi
        networkMode: 'always',
      },
    },
  });
}

// layout client: header + trang hiện tại (children), không bao giờ unmount khi đổi trang -> theme, toast giữ nguyên
export default function Providers({ children }: { children: ReactNode }) {
  // useState(() => ...): mỗi lần mở app tạo 1 QueryClient, ko tạo lại khi re-render
  const [queryClient] = useState(makeQueryClient)
  const [theme, setTheme] = useState<Theme>('light')
  const [toast, setToast] = useState<ToastData | null>(null)

  // design: toast tự ẩn sau 4s; toast xoá có nút hoàn tác -> 5s (= thời gian được hoàn tác)
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === 'deleted' && toast.onUndo ? UNDO_MS : 4000;
    const timer = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(timer);
  }, [toast])

  // bắt sự thay đổi của state light và dark rồi đổi <html data-theme="dark/light"></html>
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme])

  //truyền hàm toggle theme vào button tại header
  const toggleTheme = () => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext value={setToast}> {/* trang con gọi useToast() để hiện toast */}
        <Header theme={theme} toggleTheme={toggleTheme} />
        {children}
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </ToastContext>
      <ReactQueryDevtools initialIsOpen={false} /> {/* chỉ hiện khi dev, build production tự bỏ */}
    </QueryClientProvider>
  )
}
