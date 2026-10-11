import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';

import '../styles/pages/ProductList.css';

import SearchForm from '../comopnents/ProductListPageCom/SearchForm';
import ProList from '../comopnents/ProductListPageCom/ProList';
import StatusMessage from '../comopnents/ProductListPageCom/StatusMessage';
import PageNav from '../comopnents/ProductListPageCom/PageNav';

function ProductList() {
    const [searchParams] = useSearchParams(); //----{cần đọc thêm }
    const navigate = useNavigate();

    // URL là "nơi lưu state": đọc giá trị từ URL, không lưu trong useState nữa ----{cần đọc thêm }
    const query = searchParams.get('q') ?? '';
    const page = Number(searchParams.get('page')) || 1;
    const sortBy = searchParams.get('sortBy') ?? '';
    const order = searchParams.get('order') ?? 'asc';

    // changes: object các key muốn đổi. Giá trị null/'' → xoá key khỏi URL ----{cần đọc thêm }
    const updateParams = (changes) => {
        const next = new URLSearchParams(searchParams);          // (1) copy params hiện tại

        Object.entries(changes).forEach(([key, value]) => {      // (2) áp từng thay đổi
            if (value) next.set(key, value);
            else next.delete(key);
        });

        const path = next.get('q') ? '/products/search' : '/';   // (3) có từ khoá → trang search
        const qs = next.toString();                              // (4) tự encode: "iphone 15" → "iphone+15"
        navigate(qs ? `${path}?${qs}` : path);                   // (5) đổi URL
    };
    //
    const { products, total, status, error, retry } = useProducts({ page, limit: 10, query, sortBy, order });// NEW: pass sortBy + order

    console.log("productListPage rendered", { status, query, page });

    const totalPage = Math.ceil(total / 10); /* tính sô page để truyền vào PageNav */

    const firstProIdx = (page - 1) * 10 + 1;
    const lastProIdx = Math.min(page * 10, total); // so Min để phòng hờ trang cuối không tròn 10

    const handleSort = (next) => { // -----{cần đọc thêm }
        updateParams({ sortBy: next.sortBy, order: next.order, page: null }); // sort mới → về trang 1
    };

    const handleSearch = (newQuery) => {
        updateParams({ q: newQuery, page: null });   // search mới → về trang 1
    };

    const clearSearch = () => {
        updateParams({ q: null, page: null });       // xoá q → path tự về "/"
    };

    // thay cho setPage của useState, PageNav vẫn gọi setPage(số) như cũ
    const setPage = (p) => {
        updateParams({ page: p === 1 ? null : p });  // trang 1 thì không cần ghi vào URL
    };


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
                <SearchForm
                    key={query}
                    initialValue={query}
                    onSearch={handleSearch}
                    sortBy={sortBy} // thêm sort
                    order={order} // thêm sort
                    handleSort={handleSort} //
                    isError={status === 'error'}
                />
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