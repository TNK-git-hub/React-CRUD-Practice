import { Link } from 'react-router-dom';

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

function CreateProduct() {
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
                    <button type="submit" form="create-product-form" className="button-container">
                        Lưu sản phẩm
                    </button>
                </div>
            </div>

            <form id="create-product-form" className="create-form" onSubmit={(e) => e.preventDefault()}>
                {/* ---- cột trái ---- */}
                <div className="create-form-col">
                    <FormSection title="Thông tin cơ bản">
                        <FormField label="Tên sản phẩm" htmlFor="title" required hint="3–100 ký tự">
                            <input id="title" type="text" className="form-input" placeholder="VD: Essence Mascara Lash Princess" />
                        </FormField>

                        <FormField label="Mô tả" htmlFor="description" required>
                            <textarea id="description" className="form-textarea" placeholder="Mô tả ngắn về sản phẩm…" />
                        </FormField>

                        <div className="form-row cols-2">
                            <FormField label="Danh mục" htmlFor="category" required>
                                <div className="form-control-wrap">
                                    <select id="category" className="form-select" defaultValue="">
                                        <option value="" disabled>Chọn danh mục</option>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <Chevron />
                                </div>
                            </FormField>
                            <FormField label="Thương hiệu" htmlFor="brand">
                                <input id="brand" type="text" className="form-input" placeholder="VD: Essence" />
                            </FormField>
                        </div>

                        <FormField label="Tags" htmlFor="tags" hint="dùng cho search phía client">
                            <div className="tag-input-box">
                                <span className="tag-chip">
                                    beauty
                                    <button type="button" aria-label="Xoá tag beauty">×</button>
                                </span>
                                <input id="tags" type="text" placeholder="Thêm tag rồi Enter…" />
                            </div>
                        </FormField>
                    </FormSection>

                    <FormSection title="Giá & kho">
                        <div className="form-row cols-4">
                            <FormField label="Giá" htmlFor="price" required>
                                <div className="form-control-wrap">
                                    <input id="price" type="number" min="0" step="0.01" className="form-input has-suffix" placeholder="0.00" />
                                    <span className="form-control-icon">$</span>
                                </div>
                            </FormField>
                            <FormField label="Giảm giá" htmlFor="discountPercentage">
                                <input id="discountPercentage" type="number" min="0" max="100" className="form-input" placeholder="0" />
                            </FormField>
                            <FormField label="Tồn kho" htmlFor="stock" required>
                                <input id="stock" type="number" min="0" className="form-input" placeholder="0" />
                            </FormField>
                            <FormField label="Đặt tối thiểu" htmlFor="minimumOrderQuantity">
                                <input id="minimumOrderQuantity" type="number" min="1" className="form-input" placeholder="1" />
                            </FormField>
                        </div>

                        <div className="form-row cols-2">
                            <FormField label="Tình trạng" htmlFor="availabilityStatus">
                                <div className="form-control-wrap">
                                    <select id="availabilityStatus" className="form-select" defaultValue="">
                                        <option value="" disabled>Chọn tình trạng</option>
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <Chevron />
                                </div>
                            </FormField>
                            <FormField label="SKU" htmlFor="sku">
                                <input id="sku" type="text" className="form-input" placeholder="BEA-ESS-ESS-001" />
                            </FormField>
                        </div>
                    </FormSection>

                    <FormSection title="Quy cách & vận chuyển">
                        <div className="form-row cols-4">
                            <FormField label="Khối lượng" htmlFor="weight">
                                <input id="weight" type="number" min="0" className="form-input" placeholder="0" />
                            </FormField>
                            <FormField label="Rộng" htmlFor="width">
                                <input id="width" type="number" min="0" className="form-input" placeholder="0" />
                            </FormField>
                            <FormField label="Cao" htmlFor="height">
                                <input id="height" type="number" min="0" className="form-input" placeholder="0" />
                            </FormField>
                            <FormField label="Sâu" htmlFor="depth">
                                <input id="depth" type="number" min="0" className="form-input" placeholder="0" />
                            </FormField>
                        </div>

                        <div className="form-row cols-2">
                            <FormField label="Bảo hành" htmlFor="warrantyInformation">
                                <input id="warrantyInformation" type="text" className="form-input" placeholder="VD: 1 year warranty" />
                            </FormField>
                            <FormField label="Giao hàng" htmlFor="shippingInformation">
                                <input id="shippingInformation" type="text" className="form-input" placeholder="VD: Ships in 1 week" />
                            </FormField>
                        </div>

                        <FormField label="Chính sách đổi trả" htmlFor="returnPolicy">
                            <input id="returnPolicy" type="text" className="form-input" placeholder="VD: 7 days return policy" />
                        </FormField>
                    </FormSection>
                </div>

                {/* ---- cột phải ---- */}
                <div className="create-form-col">
                    <FormSection title="Ảnh sản phẩm" meta="0/5">
                        <ImageDropzone />
                    </FormSection>
                    <FormSection title="Xem trước">
                        <PreviewCard />
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
