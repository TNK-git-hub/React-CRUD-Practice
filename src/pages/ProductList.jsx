import { useState } from 'react';
import SearchBar from '../comopnents/ProductListPageCom/SearchBar';
import Button from '../comopnents/Button';
import Sorting from '../comopnents/ProductListPageCom/Sorting';
import '../styles/pages/ProductList.css';
import ProList from '../comopnents/ProductListPageCom/ProList';

function ProductList() {
    const [page, setPage] = useState(1); //useState này sau dùng để track page để display product items

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
                    <Button />
                    <div style={{ flexGrow: 1 }}></div>
                    <Sorting />
                </form>
            </div>
            <ProList />

        </main>
    )
}

export default ProductList;