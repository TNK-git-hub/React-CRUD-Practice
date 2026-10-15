import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProduct, uploadImage } from '../api/productsQuerParam';

import '../styles/pages/CreateProduct.css'
import '../styles/Button.css';

import ProductFormFields from '../comopnents/ProductFormCom/ProductFormFields';
import { useProductForm } from '../hooks/useProductForm';
import { EMPTY_FORM, buildPayload, validateProduct, getChangedFields } from '../utils/productForm';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import LeaveConfirmDialog from '../comopnents/ProductFormCom/LeaveConfirmDialog';
import SaveErrorBanner from '../comopnents/ProductFormCom/SaveErrorBanner';

function CreateProduct() {
    const formState = useProductForm(EMPTY_FORM);
    const navigate = useNavigate();
    const [status, setStatus] = useState('idle');   // 'idle' | 'submitting' | 'error'
    const [error, setError] = useState(null);
    const errorCount = Object.keys(formState.errors).length;

    // dirty = khác form rỗng ban đầu (lúc đầu: không tag, không ảnh)
    const changeCount = getChangedFields(formState.form, EMPTY_FORM, formState.tags, [], formState.images, []).size;
    // tắt khi đang lưu -> navigate() lúc tạo thành công không bị chặn
    const blocker = useUnsavedChangesGuard(changeCount > 0 && status !== 'submitting');

    const handleSubmit = async (e) => {
        e.preventDefault();

        const errs = validateProduct(formState.form);
        if (Object.keys(errs).length > 0) {
            formState.setErrors(errs);
            document.getElementById(Object.keys(errs)[0])?.focus();  // jump to the first bad field
            return;                                                  // stop: no API call
        }

        setStatus('submitting');
        try {
            const uploaded = await Promise.all(formState.images.map(img => uploadImage(img.file))); //IMG_FeToBe: all uploads at once -> [{ url }, ...]
            const urls = uploaded.map(r => r.url); //IMG_FeToBe
            const created = await createProduct(buildPayload(formState.form, formState.withPendingTag(), urls)); //IMG_FeToBe: urls -> product images
            // gửi toast kèm điều hướng: trang này unmount ngay, RootLayout sẽ hiện toast
            navigate(`/products/${created.id}`, { state: { toast: { title: created.title, id: created.id } } });
        } catch (err) {
            setError(err);                          // giữ cả object: banner cần .status
            setStatus('error');
        }
    };

    return (
        <main className="create-product-main">
            {/* breadcrumb + API badge */}
            <div className="create-top-row">
                <nav aria-label="Breadcrumb" className="breadcrumb">
                    <Link to="/">Products</Link>
                    <span>/</span>
                    <span className="breadcrumb-current">Thêm sản phẩm</span>
                </nav>
                <span className="api-badge">POST /products/add</span>
            </div>

            {/* title + nút */}
            <div className="create-title-row">
                <h1>Thêm sản phẩm</h1>
                <div className="create-actions">
                    <Link to="/" className="button-secondary">Huỷ</Link>
                    <button type="submit" form="create-product-form" className="button-container"
                        disabled={status === 'submitting'}>
                        {status === 'submitting' ? 'Đang lưu…' : 'Lưu sản phẩm'}
                    </button>
                </div>
            </div>

            {errorCount > 0 && (
                <div role="alert" className="form-invalid-banner">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.3v.2" /></svg>
                    <p>Không lưu được — còn <strong>{errorCount} field</strong> chưa hợp lệ.</p>
                </div>
            )}

            {status === 'error' && <SaveErrorBanner error={error} formId="create-product-form" />}

            <ProductFormFields formId="create-product-form" onSubmit={handleSubmit} formState={formState} />

            <p className="create-footnote">
                <span>*</span>  bắt buộc
            </p>

            {blocker.state === 'blocked' && (
                <LeaveConfirmDialog
                    changeCount={changeCount}
                    onStay={() => blocker.reset()}
                    onLeave={() => blocker.proceed()}
                />
            )}
        </main>
    )
}

export default CreateProduct;
