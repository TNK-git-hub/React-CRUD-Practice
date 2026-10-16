import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './styles/index.css'
import App from './App'
import { ApiError } from './api/client'

// cache chung cho cả app: data của mỗi query key được lưu ở đây
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // trong 30s data còn "fresh" -> quay lại trang ko gọi api lại
      // lỗi 4xx (404, 400...) gọi lại vẫn lỗi -> ko retry; lỗi mạng / 5xx thử tối đa 2 lần
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render( // ! = chắc chắn có <div id="root"> trong index.html
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} /> {/* chỉ hiện khi dev, build production tự bỏ */}
    </QueryClientProvider>
  </StrictMode>,
)
