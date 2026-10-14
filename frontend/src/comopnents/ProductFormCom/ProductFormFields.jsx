import { CATEGORIES, STATUSES } from '../../utils/productForm';
import FormSection from './FormSection';
import FormField from './FormField';
import ImageDropzone from './ImageDropzone';
import PreviewCard from './PreviewCard';

// mũi tên cho <select>
const Chevron = () => (
    <span className="form-control-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </span>
);

const NO_CHANGES = new Set();   // default for Create: nothing is ever "changed"

// formState: object returned by useProductForm
// changedFields: Set of field ids to highlight (Edit only)
// children: extra sections at the bottom of the left column (Edit: danger zone)
function ProductFormFields({ formId, onSubmit, formState, changedFields = NO_CHANGES, imageCount = 0, children }) {
    const { form, tags, tagInput, setTagInput, handleChange, handleTagKeyDown, removeTag, errors } = formState;

    // "form-input" -> "form-input is-changed" when that field was edited
    const cls = (base, id) => [base, changedFields.has(id) && 'is-changed', errors[id] && 'is-invalid'].filter(Boolean).join(' ');

    // screen reader: mark the control invalid + link it to its <p id="<id>-error"> message
    const errAria = (id) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined });

    return (
        <form id={formId} className="create-form" onSubmit={onSubmit} noValidate>
            {/* ---- cột trái ---- */}
            <div className="create-form-col">
                <FormSection title="Thông tin cơ bản">
                    <FormField label="Tên sản phẩm" htmlFor="title" required hint="3–100 ký tự" error={errors.title}>
                        <input id="title" type="text" className={cls('form-input', 'title')} minLength={3} maxLength={100} placeholder="VD: Essence Mascara Lash Princess" value={form.title} onChange={handleChange} {...errAria('title')} />
                    </FormField>
                    <FormField label="Mô tả" htmlFor="description" required error={errors.description}>
                        <textarea id="description" className={cls('form-textarea', 'description')} placeholder="Mô tả ngắn về sản phẩm…" value={form.description} onChange={handleChange} required {...errAria('description')} />
                    </FormField>

                    <div className="form-row cols-2">
                        <FormField label="Danh mục" htmlFor="category" required error={errors.category}>
                            <div className="form-control-wrap">
                                <select id="category" className={cls('form-select', 'category')} value={form.category} onChange={handleChange} required {...errAria('category')}>
                                    <option value="" disabled>Chọn danh mục</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <Chevron />
                            </div>
                        </FormField>
                        <FormField label="Thương hiệu" htmlFor="brand">
                            <input id="brand" type="text" className={cls('form-input', 'brand')} placeholder="VD: Essence" value={form.brand} onChange={handleChange} />
                        </FormField>
                    </div>

                    <FormField label="Tags" htmlFor="tags" hint="dùng cho search phía client">
                        <div className={cls('tag-input-box', 'tags')}>
                            {tags.map(tag => (
                                <span key={tag} className="tag-chip">
                                    {tag}
                                    <button type="button" aria-label={`Xoá tag ${tag}`}
                                        onClick={() => removeTag(tag)}>×</button>
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
                        <FormField label="Giá" htmlFor="price" required error={errors.price}>
                            <div className="form-control-wrap">
                                <input id="price" type="number" min="0" step="0.01" className={cls('form-input has-suffix', 'price')} placeholder="0.00" value={form.price} onChange={handleChange} required {...errAria('price')} />
                                <span className="form-control-icon">$</span>
                            </div>
                        </FormField>
                        <FormField label="Giảm giá" htmlFor="discountPercentage">
                            <input id="discountPercentage" type="number" min="0" step="0.01" max="100" className={cls('form-input', 'discountPercentage')} placeholder="0" value={form.discountPercentage} onChange={handleChange} />
                        </FormField>
                        <FormField label="Tồn kho" htmlFor="stock" required error={errors.stock}>
                            <input id="stock" type="number" min="0" className={cls('form-input', 'stock')} placeholder="0" value={form.stock} onChange={handleChange} required {...errAria('stock')} />
                        </FormField>
                        <FormField label="Đặt tối thiểu" htmlFor="minimumOrderQuantity">
                            <input id="minimumOrderQuantity" type="number" min="1" className={cls('form-input', 'minimumOrderQuantity')} placeholder="1" value={form.minimumOrderQuantity} onChange={handleChange} />
                        </FormField>
                    </div>

                    <div className="form-row cols-2">
                        <FormField label="Tình trạng" htmlFor="availabilityStatus">
                            <div className="form-control-wrap">
                                <select id="availabilityStatus" className={cls('form-select', 'availabilityStatus')} value={form.availabilityStatus} onChange={handleChange}>
                                    <option value="" disabled>Chọn tình trạng</option>
                                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <Chevron />
                            </div>
                        </FormField>
                        <FormField label="SKU" htmlFor="sku">
                            <input id="sku" type="text" className={cls('form-input', 'sku')} placeholder="BEA-ESS-ESS-001" value={form.sku} onChange={handleChange} />
                        </FormField>
                    </div>
                </FormSection>

                <FormSection title="Quy cách & vận chuyển">
                    <div className="form-row cols-4">
                        <FormField label="Khối lượng" htmlFor="weight">
                            <input id="weight" type="number" min="0" step="0.01" className={cls('form-input', 'weight')} placeholder="0" value={form.weight} onChange={handleChange} />
                        </FormField>
                        <FormField label="Rộng" htmlFor="width">
                            <input id="width" type="number" min="0" step="0.01" className={cls('form-input', 'width')} placeholder="0" value={form.width} onChange={handleChange} />
                        </FormField>
                        <FormField label="Cao" htmlFor="height">
                            <input id="height" type="number" min="0" step="0.01" className={cls('form-input', 'height')} placeholder="0" value={form.height} onChange={handleChange} />
                        </FormField>
                        <FormField label="Sâu" htmlFor="depth">
                            <input id="depth" type="number" min="0" step="0.01" className={cls('form-input', 'depth')} placeholder="0" value={form.depth} onChange={handleChange} />
                        </FormField>
                    </div>

                    <div className="form-row cols-2">
                        <FormField label="Bảo hành" htmlFor="warrantyInformation">
                            <input id="warrantyInformation" type="text" className={cls('form-input', 'warrantyInformation')} placeholder="VD: 1 year warranty" value={form.warrantyInformation} onChange={handleChange} />
                        </FormField>
                        <FormField label="Giao hàng" htmlFor="shippingInformation">
                            <input id="shippingInformation" type="text" className={cls('form-input', 'shippingInformation')} placeholder="VD: Ships in 1 week" value={form.shippingInformation} onChange={handleChange} />
                        </FormField>
                    </div>

                    <FormField label="Chính sách đổi trả" htmlFor="returnPolicy">
                        <input id="returnPolicy" type="text" className={cls('form-input', 'returnPolicy')} placeholder="VD: 7 days return policy" value={form.returnPolicy} onChange={handleChange} />
                    </FormField>
                </FormSection>
                {children}
            </div>

            {/* ---- cột phải ---- */}
            <div className="create-form-col">
                <FormSection title="Ảnh sản phẩm" meta={`${imageCount}/5`}>
                    <ImageDropzone />
                </FormSection>
                <FormSection title="Xem trước">
                    <PreviewCard title={form.title} category={form.category} price={form.price} discountPercentage={form.discountPercentage} />
                </FormSection>
            </div>
        </form>
    );
}

export default ProductFormFields;
