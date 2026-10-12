import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProduct } from '../api/productsQuerParam';

import '../styles/pages/CreateProduct.css'
import '../styles/Button.css';

import FormSection from "../comopnents/CreateProductPageCom/FormSection";
import FormField from '../comopnents/CreateProductPageCom/FormField';
import ImageDropzone from '../comopnents/CreateProductPageCom/ImageDropzone';
import PreviewCard from '../comopnents/CreateProductPageCom/PreviewCard';

const CATEGORIES = ['beauty', 'fragrances', 'furniture', 'groceries', 'home-decoration', 'kitchen-accessories'];
const STATUSES = ['In Stock', 'Low Stock', 'Out of Stock'];

// mũi tên cho <select>
const Chevron = () => (
    <span className="form-control-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </span>
);

const EMPTY_FORM = {
    title: '', description: '', category: '', brand: '',
    price: '', discountPercentage: '', stock: '', minimumOrderQuantity: '',
    availabilityStatus: '', sku: '',
    weight: '', width: '', height: '', depth: '',
    warrantyInformation: '', shippingInformation: '', returnPolicy: '',
};

// '' -> undefined (JSON.stringify drops it), otherwise string -> number
const toNum = (v) => (v === '' ? undefined : Number(v)); // string to num
const toStr = (v) => (v.trim() === '' ? undefined : v.trim()); // string trim 

function buildPayload(form, tags) {
    return {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        brand: toStr(form.brand),
        tags,
        price: toNum(form.price),
        discountPercentage: toNum(form.discountPercentage),
        stock: toNum(form.stock),
        minimumOrderQuantity: toNum(form.minimumOrderQuantity),
        availabilityStatus: form.availabilityStatus || undefined,
        sku: toStr(form.sku),
        weight: toNum(form.weight),
        dimensions: { width: toNum(form.width), height: toNum(form.height), depth: toNum(form.depth) },
        warrantyInformation: toStr(form.warrantyInformation),
        shippingInformation: toStr(form.shippingInformation),
        returnPolicy: toStr(form.returnPolicy),
        images: [],   // file upload = later
        // no barcode: the backend generates it
    };
}


function CreateProduct() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');

    // one handler for every input: uses the input's id as the key
    const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.id]: e.target.value }));

    // returns the tags list with tagInput added (if it's new)
    const withPendingTag = () => {
        const tag = tagInput.trim().toLowerCase();
        return tag && !tags.includes(tag) ? [...tags, tag] : tags;
    };

    const handleTagKeyDown = (e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return; // skip Enter while Telex/IME is composing
        e.preventDefault();               // ⚠️ otherwise Enter submits the whole form
        setTags(withPendingTag());
        setTagInput('');
    };

    const navigate = useNavigate();
    const [status, setStatus] = useState('idle');   // 'idle' | 'submitting' | 'error'
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');
        try {
            const created = await createProduct(buildPayload(form, withPendingTag()));
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

            {status === 'error' && <p className="create-error">{error}</p>}

            <form id="create-product-form" className="create-form" onSubmit={handleSubmit}>
                {/* ---- cột trái ---- */}
                <div className="create-form-col">
                    <FormSection title="Thông tin cơ bản">
                        <FormField label="Tên sản phẩm" htmlFor="title" required hint="3–100 ký tự">
                            <input id="title" type="text" className="form-input" minLength={3} maxLength={100} placeholder="VD: Essence Mascara Lash Princess" value={form.title} onChange={handleChange} />
                        </FormField>

                        <FormField label="Mô tả" htmlFor="description" required>
                            <textarea id="description" className="form-textarea" placeholder="Mô tả ngắn về sản phẩm…" value={form.description} onChange={handleChange} required />
                        </FormField>

                        <div className="form-row cols-2">
                            <FormField label="Danh mục" htmlFor="category" required>
                                <div className="form-control-wrap">
                                    <select id="category" className="form-select" value={form.category} onChange={handleChange} required>
                                        <option value="" disabled>Chọn danh mục</option>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <Chevron />
                                </div>
                            </FormField>
                            <FormField label="Thương hiệu" htmlFor="brand">
                                <input id="brand" type="text" className="form-input" placeholder="VD: Essence" value={form.brand} onChange={handleChange} />
                            </FormField>
                        </div>

                        <FormField label="Tags" htmlFor="tags" hint="dùng cho search phía client">
                            <div className="tag-input-box">
                                {tags.map(tag => (
                                    <span key={tag} className="tag-chip">
                                        {tag}
                                        <button type="button" aria-label={`Xoá tag ${tag}`}
                                            onClick={() => setTags(prev => prev.filter(t => t !== tag))}>×</button>
                                    </span>
                                ))}
                                <input id="tags" type="text" placeholder="Thêm tag rồi Enter…"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleTagKeyDown} />
                            </div>
                        </FormField>
                    </FormSection>

                    <FormSection title="Giá & kho">
                        <div className="form-row cols-4">
                            <FormField label="Giá" htmlFor="price" required>
                                <div className="form-control-wrap">
                                    <input id="price" type="number" min="0" step="0.01" className="form-input has-suffix" placeholder="0.00" value={form.price} onChange={handleChange} required />
                                    <span className="form-control-icon">$</span>
                                </div>
                            </FormField>
                            <FormField label="Giảm giá" htmlFor="discountPercentage">
                                <input id="discountPercentage" type="number" min="0" step="0.01" max="100" className="form-input" placeholder="0" value={form.discountPercentage} onChange={handleChange} />
                            </FormField>
                            <FormField label="Tồn kho" htmlFor="stock" required>
                                <input id="stock" type="number" min="0" className="form-input" placeholder="0" value={form.stock} onChange={handleChange} required />
                            </FormField>
                            <FormField label="Đặt tối thiểu" htmlFor="minimumOrderQuantity">
                                <input id="minimumOrderQuantity" type="number" min="1" className="form-input" placeholder="1" value={form.minimumOrderQuantity} onChange={handleChange} />
                            </FormField>
                        </div>

                        <div className="form-row cols-2">
                            <FormField label="Tình trạng" htmlFor="availabilityStatus">
                                <div className="form-control-wrap">
                                    <select id="availabilityStatus" className="form-select" value={form.availabilityStatus} onChange={handleChange}>
                                        <option value="" disabled>Chọn tình trạng</option>
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <Chevron />
                                </div>
                            </FormField>
                            <FormField label="SKU" htmlFor="sku">
                                <input id="sku" type="text" className="form-input" placeholder="BEA-ESS-ESS-001" value={form.sku} onChange={handleChange} />
                            </FormField>
                        </div>
                    </FormSection>

                    <FormSection title="Quy cách & vận chuyển">
                        <div className="form-row cols-4">
                            <FormField label="Khối lượng" htmlFor="weight">
                                <input id="weight" type="number" min="0" step="0.01" className="form-input" placeholder="0" value={form.weight} onChange={handleChange} />
                            </FormField>
                            <FormField label="Rộng" htmlFor="width">
                                <input id="width" type="number" min="0" step="0.01" className="form-input" placeholder="0" value={form.width} onChange={handleChange} />
                            </FormField>
                            <FormField label="Cao" htmlFor="height">
                                <input id="height" type="number" min="0" step="0.01" className="form-input" placeholder="0" value={form.height} onChange={handleChange} />
                            </FormField>
                            <FormField label="Sâu" htmlFor="depth">
                                <input id="depth" type="number" min="0" step="0.01" className="form-input" placeholder="0" value={form.depth} onChange={handleChange} />
                            </FormField>
                        </div>

                        <div className="form-row cols-2">
                            <FormField label="Bảo hành" htmlFor="warrantyInformation">
                                <input id="warrantyInformation" type="text" className="form-input" placeholder="VD: 1 year warranty" value={form.warrantyInformation} onChange={handleChange} />
                            </FormField>
                            <FormField label="Giao hàng" htmlFor="shippingInformation">
                                <input id="shippingInformation" type="text" className="form-input" placeholder="VD: Ships in 1 week" value={form.shippingInformation} onChange={handleChange} />
                            </FormField>
                        </div>

                        <FormField label="Chính sách đổi trả" htmlFor="returnPolicy">
                            <input id="returnPolicy" type="text" className="form-input" placeholder="VD: 7 days return policy" value={form.returnPolicy} onChange={handleChange} />
                        </FormField>
                    </FormSection>
                </div>

                {/* ---- cột phải ---- */}
                <div className="create-form-col">
                    <FormSection title="Ảnh sản phẩm" meta="0/5">
                        <ImageDropzone />
                    </FormSection>
                    <FormSection title="Xem trước">
                        <PreviewCard
                            title={form.title}
                            category={form.category}
                            price={form.price}
                            discountPercentage={form.discountPercentage}
                        />
                    </FormSection>
                </div>
            </form>

            <p className="create-footnote">
                <span>*</span> footnote
            </p>
        </main>
    )
}

export default CreateProduct;
