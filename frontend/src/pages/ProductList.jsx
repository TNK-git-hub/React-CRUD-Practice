import { useState, useEffect } from 'react';
import { useProducts } from '../hooks/useProducts';

import '../styles/pages/ProductList.css';

import SearchForm from '../comopnents/ProductListPageCom/SearchForm';
import ProList from '../comopnents/ProductListPageCom/ProList';
import StatusMessage from '../comopnents/ProductListPageCom/StatusMessage';
import PageNav from '../comopnents/ProductListPageCom/PageNav';

function ProductList() {
    const [page, setPage] = useState(1); //useState này sau dùng để track page để display product items
    const [query, setQuery] = useState(""); // track query gửi đi
    const { products, total, status, error, retry } = useProducts({ page, limit: 10, query });

    console.log("productListPage rendered", { status, query, page });

    const totalPage = Math.ceil(total / 10); /* tính sô page để truyền vào PageNav */

    const firstProIdx = (page - 1) * 10 + 1;
    const lastProIdx = Math.min(page * 10, total); // so Min để phòng hờ trang cuối không tròn 10

    const handleSearch = (newQuery) => { // SearchForm chỉ gọi hàm này khi submit
        setQuery(newQuery);
        setPage(1);
    }

    const clearSearch = () => {
        setQuery(""); // key của SearchForm đổi → input tự reset về ""
        setPage(1);
    }

    console.log("productListPage rendered");
    const renderContent = () => { // hàm logic track state render phần prolist
        if (status === 'error') return <StatusMessage // TH: lỗi API
            icon="exclamation"
            title="Không tải dược danh sách sản phẩm"
            description="Yêu cầu tới DummyJSON thất bại. Kiểm tra kết nối mạng rồi thử lại."
            code={`HTTP ${error.status} · /${error.path}`}
            action={retry} />;
        if (status === 'loading') return <ProList isLoading />; // TH: loading
        if (products.length === 0) return <StatusMessage // TH: không serch được ra sản phẩm
            icon="magnifier"
            title="Không tìm thấy sản phẩm nào"
            description={<>Không có kết quả cho từ khoá “<strong>{query}</strong>”.Thử từ khoá ngắn hơn hoặc xoá bộ lọc.</>}
            action={clearSearch} />;
        return <ProList products={products} /> // TH: tìm ra danh sách bình thường;
    };


    return (
        <main className="product-list-main">
            <div className='pro-intro'>
                <div className='pro-intro-first-div'>
                    <h1>Products</h1>
                    <p className='vanish-in-mobile'>Dữ liệu từ <code>GET /products?limit=10&skip=0</code></p>
                </div>
                <div className='vanish-in-mobile'><span className='product-route-badge'>/PRODUCTS</span></div>
            </div>
            <div className='search-sorting-container'>
                <SearchForm key={query} initialValue={query} onSearch={handleSearch} isError={status === 'error'} />
            </div>
            {status === 'success' &&
                <span className='display-product-indexs mobile'>Hiển thị <strong>{firstProIdx}-{lastProIdx}</strong> trong <strong>{total}</strong> sản phẩm</span>
            }
            {renderContent()}
            <div className={`display-page-div ${status === 'error' || (products.length === 0) ? 'vanish' : ''}`}>
                <nav className={'display-page-nav' + (status === 'loading' ? ' shift-right' : '')}>
                    {status === 'success' &&
                        <span className='display-product-indexs vanish-in-mobile'>Hiển thị <strong>{firstProIdx}-{lastProIdx}</strong> trong <strong>{total}</strong> sản phẩm</span>
                    }
                    <PageNav totalPage={totalPage} currentPage={page} setPage={setPage} />
                </nav>
            </div>
        </main>
    )
}

export default ProductList;