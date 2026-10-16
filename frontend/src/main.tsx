import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './styles/index.css'
import App from './App'

// cache chung cho cả app: data của mỗi query key được lưu ở đây
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // trong 30s data còn "fresh" -> quay lại trang ko gọi api lại
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
