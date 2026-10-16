import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useDeleteProduct } from '../hooks/useProductMutations';
import { useToast } from '../hooks/useToast';
import { isSortField, isSortOrder } from '../utils/sortParams';
import { btn } from '../utils/buttonStyles';
import type { ProductSummary, SortField, SortOrder } from '../types/product';
import type { SortChange } from '../comopnents/ProductListPageCom/Sorting';

import '../styles/pages/ProductList.css';

import SearchForm from '../comopnents/ProductListPageCom/SearchForm';
import ProList from '../comopnents/ProductListPageCom/ProList';
import StatusMessage from '../comopnents/ProductListPageCom/StatusMessage';
import PageNav from '../comopnents/ProductListPageCom/PageNav';
import ConfirmDeleteDialog from '../comopnents/ProductListPageCom/ConfirmDeleteDialog';

function ProductList() {
    const [searchParams] = useSearchParams(); //----{cần đọc thêm }
    const navigate = useNavigate();

    // URL là "nơi lưu state": đọc giá trị từ URL, không lưu trong useState nữa ----{cần đọc thêm }
    const query = searchParams.get('q') ?? '';
    const page = Number(searchParams.get('page')) || 1;
    // sortBy / order không hợp lệ (vd ?sortBy=abc) -> dùng mặc định thay vì để backend trả 400
    const sortByParam = searchParams.get('sortBy');
    const sortBy: SortField = isSortField(sortByParam) ? sortByParam : 'title';
    const orderParam = searchParams.get('order');
    const order: SortOrder = isSortOrder(orderParam) ? orderParam : 'asc';

    // changes: object các key muốn đổi. Giá trị null/'' → xoá key khỏi URL ----{cần đọc thêm }
    const updateParams = (changes: Record<string, string | number | null>) => {
        const next = new URLSearchParams(searchParams);          // (1) copy params hiện tại

        Object.entries(changes).forEach(([key, value]) => {      // (2) áp từng thay đổi
            if (value) next.set(key, String(value));
            else next.delete(key);
        });

        // (3) sắp xếp lại thứ tự key: q → page → sortBy → order
        const ordered = new URLSearchParams();
        ['q', 'page', 'sortBy', 'order'].forEach((key) => {
            const value = next.get(key);
            if (value) ordered.set(key, value);
        });

        const path = ordered.get('q') ? '/products/search' : '/'; // (4) có từ khoá → trang search
        const qs = ordered.toString();                           // (5) tự encode: "iphone 15" → "iphone+15"
        navigate(qs ? `${path}?${qs}` : path);                   // (6) đổi URL
    };
    // useProducts values
    const { products, total, status, error, retry } = useProducts({ page, limit: 10, query, sortBy, order });

    const [productToDelete, setProductToDelete] = useState<ProductSummary | null>(null); // null = dialog đóng
    const deleteMutation = useDeleteProduct();
    const showToast = useToast();

    // optimistic: đóng dialog + card biến mất ngay; chờ 5s (hoàn tác được) rồi mới gửi DELETE
    const handleConfirmDelete = () => {
        if (!productToDelete) return;               // dialog chỉ mở khi đã chọn sản phẩm
        const { id, title } = productToDelete;
        setProductToDelete(null);                   // đóng dialog luôn, ko chờ server

        // xoá card cuối cùng của 1 trang (không phải trang 1) → lùi về trang trước
        if (products.length === 1 && page > 1) setPage(page - 1);

        const undo = new AbortController();
        deleteMutation.mutate({ id, title, undo }); // lỗi -> toast đỏ (trong hook)
        showToast({ kind: 'deleted', title, onUndo: () => undo.abort() });
    };


    console.log("productListPage rendered", { status, query, page });

    const totalPage = Math.ceil((total ?? 0) / 10); /* tính sô page để truyền vào PageNav */

    const firstProIdx = (page - 1) * 10 + 1;
    const lastProIdx = Math.min(page * 10, total ?? 0); // so Min để phòng hờ trang cuối không tròn 10

    const handleSort = (next: SortChange) => { // -----{cần đọc thêm }
        updateParams({ sortBy: next.sortBy, order: next.order, page: null }); // sort mới → về trang 1
    };

    const handleSearch = (newQuery: string) => {
        updateParams({ q: newQuery, page: null });   // search mới → về trang 1
    };

    const clearSearch = () => {
        updateParams({ q: null, page: null });       // xoá q → path tự về "/"
    };

    // thay cho setPage của useState, PageNav vẫn gọi setPage(số) như cũ
    const setPage = (p: number) => {
        updateParams({ page: p === 1 ? null : p });  // trang 1 thì không cần ghi vào URL
    };


    console.log("productListPage rendered");
    const renderContent = () => { // hàm logic track state render phần prolist
        if (status === 'error') return <StatusMessage // TH: lỗi API
            icon="exclamation"
            title="Không tải dược danh sách sản phẩm"
            description="Yêu cầu tới DummyJSON thất bại. Kiểm tra kết nối mạng rồi thử lại."
            code={`HTTP ${error?.status} · /${error?.path}`}
            action={retry} />;
        if (status === 'loading') return <ProList isLoading />; // TH: loading
        if (products.length === 0) return <StatusMessage // TH: không serch được ra sản phẩm
            icon="magnifier"
            title="Không tìm thấy sản phẩm nào"
            description={<>Không có kết quả cho từ khoá “<strong>{query}</strong>”.Thử từ khoá ngắn hơn hoặc xoá bộ lọc.</>}
            action={clearSearch} />;
        return <ProList products={products} onDelete={setProductToDelete} /> // TH: tìm ra danh sách bình thường;
    };


    return (
        <main className="product-list-main">
            <div className='pro-intro'>
                <div className='pro-intro-first-div'>
                    <h1>Products</h1>
                    <p className='vanish-in-mobile'>Dữ liệu từ <code>GET /products?limit=10&skip=0</code></p>
                </div>
                <div className='pro-intro-actions'>
                    <span className='product-route-badge vanish-in-mobile'>/PRODUCTS</span>
                    <Link to="/products/add" className={`${btn.primary} add-product-btn`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        Thêm sản phẩm
                    </Link>
                </div>
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

            {/* dialog xác nhận xoá: chỉ render khi đã chọn 1 sản phẩm */}
            {productToDelete && (
                <ConfirmDeleteDialog
                    product={productToDelete}
                    isDeleting={false} // optimistic: dialog đóng ngay, ko có trạng thái đang xoá
                    error={null} // lỗi xoá hiện bằng toast đỏ
                    onCancel={() => setProductToDelete(null)}
                    onConfirm={handleConfirmDelete}
                />
            )}
        </main>
    )
}

export default ProductList;