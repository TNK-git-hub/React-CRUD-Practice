import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Product } from '../types/product';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useProduct } from '../hooks/useProduct';
import { uploadImage } from '../api/productsQuerParam';
import { useUpdateProduct, useDeleteProduct } from '../hooks/useProductMutations';
import { useToast } from '../hooks/useToast';
import { toError } from '../api/client';
import FormSection from '../comopnents/ProductFormCom/FormSection';
import ConfirmDeleteDialog from '../comopnents/ProductListPageCom/ConfirmDeleteDialog';

import '../styles/pages/EditProduct.css';     // only the Edit-only bits
import '../styles/pages/CreateProduct.css';
import '../styles/Button.css';

import StatusMessage from '../comopnents/ProductListPageCom/StatusMessage';
import { useProductForm } from '../hooks/useProductForm';
import { productToForm, getChangedFields, buildPayload } from '../utils/productForm';
import ProductFormFields from '../comopnents/ProductFormCom/ProductFormFields';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import LeaveConfirmDialog from '../comopnents/ProductFormCom/LeaveConfirmDialog';
import SaveErrorBanner from '../comopnents/ProductFormCom/SaveErrorBanner';

// ---- parent: load the product, handle loading / error / 404 (check if the product exist yet)----
function EditProduct() {
    const { id } = useParams();
    const { product, status, error, retry } = useProduct(id!); // route /products/:id/edit -> luôn có id
    const navigate = useNavigate();

    if (status === 'loading') return <main className="create-product-main"></main>; // tạm, giống ProductDetail
    if (status === 'error') return <StatusMessage
        icon="exclamation"
        title="Không tải được sản phẩm"
        description="Yêu cầu tới server thất bại. Kiểm tra kết nối mạng rồi thử lại."
        code={`HTTP ${error?.status} · /${error?.path}`}
        action={retry} />;
    if (status === 'notfound') return <StatusMessage
        icon="404"
        title="Sản phẩm không tồn tại"
        description={<>Server trả về <code className="four04-code-style">404</code> cho id này.</>}
        action={() => navigate('/')} />;

    if (!product) return null; // status === 'success' -> luôn có product

    // key: another product -> brand-new form state
    return <EditProductForm key={product.id} product={product} />;
}

//---- child: temporary, just to prove the data arrives (if the product exist then render the children) ----
function EditProductForm({ product }: { product: Product }) {
    // computed only once: the arrow function runs on the first render only
    const [initialForm] = useState(() => productToForm(product));
    const initialTags = product.tags;

    const initialImageUrls = product.images; //IMG_Edit: urls already in the db

    const formState = useProductForm(initialForm, initialTags, initialImageUrls); // track state với state ban đầu gồm tất cả các thông tin form, tags và ảnh cũ
    const { form, tags, images } = formState;

    // derived on every render, NOT stored in state
    const changedFields = getChangedFields(form, initialForm, tags, initialTags, images, initialImageUrls); // hàm thay đổi fields khi ngừoi dùng nhập
    const changeCount = changedFields.size;

    const navigate = useNavigate();
    const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
    const [error, setError] = useState<Error | null>(null);
    const updateMutation = useUpdateProduct(); // thành công -> cache detail = response mới
    const deleteMutation = useDeleteProduct();
    const showToast = useToast();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus('submitting');
        try {
            // IMG_Edit: images untouched -> undefined -> JSON.stringify drops it (sending them would delete + re-insert the same rows)
            // changed -> upload only the new files, keep the display order: new file -> uploaded url, old image -> its url
            const urls = changedFields.has('images')
                ? await Promise.all(images.map(img => img.file ? uploadImage(img.file).then(r => r.url) : img.url))
                : undefined;
            await updateMutation.mutateAsync({ id: product.id, data: { ...buildPayload(form, formState.withPendingTag()), images: urls } });
            navigate(`/products/${product.id}`);
        } catch (err) {
            setError(toError(err));                          // giữ cả object: banner cần .status
            setStatus('error');                     // form data stays: nothing resets it
        }
    };

    // ---- delete (same pattern as ProductList) ----
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // chặn rời trang khi form dirty; tắt khi đang lưu / xoá -> navigate() lúc thành công không bị chặn
    const blocker = useUnsavedChangesGuard(changeCount > 0 && status !== 'submitting' && !isDeleting);

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteMutation.mutateAsync({ id: product.id, title: product.title }); // ko undo: chờ xong mới rời trang, lỗi thì vẫn ở lại form
            navigate('/');                       // the product is gone -> back to the list
            showToast({ kind: 'deleted', title: product.title });
        } catch (err) {
            setDeleteError(toError(err).message);
            setIsDeleting(false);
        }
    };


    return (


        <main className="create-product-main">
            {/* breadcrumb + API badge */}
            <div className="create-top-row">
                <nav aria-label="Breadcrumb" className="breadcrumb">
                    <Link to="/">Products</Link>
                    <span>/</span>
                    <Link to={`/products/${product.id}`}>{product.title}</Link>
                    <span>/</span>
                    <span className="breadcrumb-current">Sửa</span>
                </nav>
                <span className="api-badge">PATCH /products/{product.id}</span>
            </div>

            {/* title + nút */}
            <div className="create-title-row">
                <div className="edit-title-group">
                    <h1>Sửa sản phẩm</h1>
                    <span className="id-chip">#{product.id}</span>
                </div>
                <div className="create-actions">
                    {changeCount > 0 && <span className="dirty-count">{changeCount} thay đổi chưa lưu</span>}
                    <Link to={`/products/${product.id}`} className="button-secondary">Huỷ</Link>
                    <button type="submit" form="edit-product-form" className="button-container"
                        disabled={status === 'submitting' || changeCount === 0}>
                        {status === 'submitting' ? 'Đang lưu…' : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>

            {status === 'error' && <SaveErrorBanner error={error} formId="edit-product-form" />}

            <ProductFormFields
                formId="edit-product-form"
                onSubmit={handleSubmit}
                formState={formState}
                changedFields={changedFields}
            >
                {/* children -> rendered at the bottom of the left column */}
                <FormSection title="Xoá sản phẩm" variant="danger">
                    <div className="danger-row">
                        <p>Gỡ sản phẩm này khỏi danh sách. Không thể hoàn tác sau khi xác nhận — luôn hỏi lại bằng dialog trước khi gọi <code>DELETE</code>.</p>
                        <button type="button" className="button-danger-outline" onClick={() => setIsConfirmOpen(true)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
                                <path d="M10.5 11v5.5M13.5 11v5.5" />
                            </svg>
                            Xoá sản phẩm
                        </button>
                    </div>
                </FormSection>
            </ProductFormFields>

            <p className="create-footnote">
                <span>*</span> bắt buộc. Nút lưu chỉ bật khi có thay đổi.
            </p>

            {isConfirmOpen && (
                <ConfirmDeleteDialog
                    product={product}
                    isDeleting={isDeleting}
                    error={deleteError}
                    onCancel={() => { setIsConfirmOpen(false); setDeleteError(null); }}
                    onConfirm={handleConfirmDelete}
                />
            )}

            {blocker.state === 'blocked' && (
                <LeaveConfirmDialog
                    changeCount={changeCount}
                    onStay={() => blocker.reset()}
                    onLeave={() => blocker.proceed()}
                />
            )}
        </main>
    );

}

export default EditProduct;
