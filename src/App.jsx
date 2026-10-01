import { useEffect, useState } from 'react'
import './App.css'

import { BrowserRouter, Routes, Route } from "react-router-dom"
import Header from './comopnents/Header'
import ProductDetail from './pages/ProductDetail'
import ProductList from './pages/ProductList'

function App() {
  const [theme, setTheme] = useState('light')

  // bắt sự thay đổi của state light và dark rồi đổi <html data-theme="dark/light"></html>
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme])

  //truyền hàm toggle theme vào button tại header
  const toggleTheme = () => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <BrowserRouter>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/products/:id" element={<ProductDetail />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App;