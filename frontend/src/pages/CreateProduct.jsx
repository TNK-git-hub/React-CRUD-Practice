import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProduct, uploadImage } from '../api/productsQuerParam';

import '../styles/pages/CreateProduct.css'
import '../styles/Button.css';

import ProductFormFields from '../comopnents/ProductFormCom/ProductFormFields';
import { useProductForm } from '../hooks/useProductForm';
import { EMPTY_FORM, buildPayload, validateProduct } from '../utils/productForm';

function CreateProduct() {
    const formState = useProductForm(EMPTY_FORM);
    const navigate = useNavigate();
    const [status, setStatus] = useState('idle');   // 'idle' | 'submitting' | 'error'
    const [error, setError] = useState(null);
    const errorCount = Object.keys(formState.errors).length;

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
            navigate(`/products/${created.id}`);
        } catch (err) {
            setError(err.message);
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

            {status === 'error' && <p className="create-error">{error}</p>}

            <ProductFormFields formId="create-product-form" onSubmit={handleSubmit} formState={formState} />

            <p className="create-footnote">
                <span>*</span>  bắt buộc
            </p>
        </main>
    )
}

export default CreateProduct;
