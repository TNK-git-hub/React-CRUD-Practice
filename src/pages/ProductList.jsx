import { useState } from 'react';
import { useProducts } from '../hooks/useProducts';

import '../styles/pages/ProductList.css';

import SearchBar from '../comopnents/ProductListPageCom/SearchBar';
import Button from '../comopnents/ProductListPageCom/Button';
import Sorting from '../comopnents/ProductListPageCom/Sorting';
import ProList from '../comopnents/ProductListPageCom/ProList';
import PageNav from '../comopnents/ProductListPageCom/Pagenav';
import PageButton from '../comopnents/ProductListPageCom/PageButton';


function ProductList() {
    const [page, setPage] = useState(1); //useState này sau dùng để track page để display product items
    const { products, total } = useProducts({ page, limit: 10 });

    const totalPage = Math.ceil(total / 10); /* tính sô page để truyền vào PageNav */

    const firstProIdx = (page - 1) * 10 + 1;
    const lastProIdx = Math.min(page * 10, total); // so để phòng hờ trang cuối không tròn 10


    return (
        <main className="product-list-main">
            <div className='pro-intro'>
                <div className='pro-intro-first-div'>
                    <h1>Products</h1>
                    <p>Dữ liệu từ <code>GET /products?limit=10&skip=0</code></p>
                </div>
                <div><span className='product-route-badge'>/PRODUCTS</span></div>
            </div>
            <div className='search-sorting-container'>
                <form action="">
                    <SearchBar />
                    <Button text="Search" />
                    <div style={{ flexGrow: 1 }}></div>
                    <Sorting />
                </form>
            </div>
            <ProList products={products} />
            <div className='display-page-div'>
                <nav className='display-page-nav'>
                    <span className='display-product-indexs'>Hiển thị <strong>{firstProIdx}-{lastProIdx}</strong> trong <strong>{total}</strong> sản phẩm</span>
                    <PageNav totalPage={totalPage} currentPage={page} setPage={setPage} />
                </nav>
            </div>

        </main>
    )
}

export default ProductList;