import { useEffect, useState } from 'react'
import './App.css'

import { createBrowserRouter, RouterProvider, Outlet, useLocation, useNavigate } from "react-router-dom"
import Header from './comopnents/Header'
import type { Theme } from './comopnents/Header'
import SuccessToast from './comopnents/SuccessToast'
import type { ToastData } from './comopnents/SuccessToast'
import ProductDetail from './pages/ProductDetail'
import ProductList from './pages/ProductList'
import CreateProduct from './pages/CreateProduct'   // trang tạo một sản phẩm
import EditProduct from './pages/EditProduct'     // trang sửa một sản phẩm

// layout: header + trang hiện tại (Outlet), không bao giờ unmount -> theme giữ nguyên
function RootLayout() {
  const [theme, setTheme] = useState<Theme>('light')
  const [toast, setToast] = useState<ToastData | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // trang khác gửi toast qua navigate(..., { state: { toast } }) -> giữ vào state ngay lúc render (mỗi location.key một lần)
  const [toastKey, setToastKey] = useState<string | null>(null)
  if (location.state?.toast && location.key !== toastKey) {
    setToastKey(location.key)
    setToast(location.state.toast)
  }

  // xoá toast khỏi history -> refresh/back không hiện lại
  useEffect(() => {
    if (location.state?.toast) navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigate])

  // design: toast tự ẩn sau 4s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
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
    <>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Outlet />
      {toast && <SuccessToast {...toast} />}
    </>
  )
}

// data router: cần cho useBlocker (BrowserRouter không hỗ trợ)
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <ProductList /> },
      { path: '/products/search', element: <ProductList /> },
      { path: '/products/add', element: <CreateProduct /> },
      { path: '/products/:id', element: <ProductDetail /> },
      { path: '/products/:id/edit', element: <EditProduct /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App;
