import type { FormEvent, ReactNode } from 'react';
import { CATEGORIES, STATUSES } from '../../utils/productForm';
import type { useProductForm } from '../../hooks/useProductForm';
import FormSection from './FormSection';
import FormField from './FormField';
import ImageDropzone from './ImageDropzone';
import PreviewCard from './PreviewCard';

// icon / chữ nằm bên phải ô (mũi tên select, ký hiệu $); pointer-events-none: click xuyên qua vào ô
const suffix = "pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 text-[13px] text-muted";

// mũi tên cho <select>
const Chevron = () => (
    <span className={suffix}>
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </span>
);

// input / select / textarea dùng chung khung, mỗi loại thêm 1 ít
const control = "h-[38px] w-full rounded-[9px] border bg-surface px-3 font-sans text-[13.5px] text-ink outline-none";
const CONTROL = {
    input: control,
    price: `${control} pr-7`,                                        // chừa chỗ cho "$"
    select: `${control} appearance-none pr-[34px]`,                  // bỏ mũi tên mặc định của trình duyệt
    textarea: `${control} h-[81px] resize-none py-[9px] leading-normal`,
};

const NO_CHANGES = new Set<string>();   // default for Create: nothing is ever "changed"

// formState: object returned by useProductForm
// changedFields: Set of field ids to highlight (Edit only)
// children: extra sections at the bottom of the left column (Edit: danger zone)
interface ProductFormFieldsProps {
    formId: string;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    formState: ReturnType<typeof useProductForm>;
    changedFields?: Set<string>;
    children?: ReactNode;
}

function ProductFormFields({ formId, onSubmit, formState, changedFields = NO_CHANGES, children }: ProductFormFieldsProps) {
    const { form, tags, tagInput, setTagInput, handleChange, handleTagKeyDown, removeTag, errors, images, addImages, removeImage } = formState;

    // màu viền theo trạng thái: lỗi (đỏ + glow) > đã sửa (Edit, viền accent) > bình thường (focus -> accent)
    // chỉ 1 nhánh có focus: -> focus ko ghi đè được màu lỗi / đã sửa
    const cls = (kind: keyof typeof CONTROL, id: string) => {
        const state = errors[id] ? 'border-danger ring-3 ring-danger-soft'
            : changedFields.has(id) ? 'border-accent'
                : 'border-line focus:border-accent';
        return `${CONTROL[kind]} ${state}`;
    };

    // screen reader: mark the control invalid + link it to its <p id="<id>-error"> message
    const errAria = (id: string) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined });

    return (
        <form id={formId} className="grid grid-cols-[minmax(0,1fr)_348px] items-start gap-8 max-[901px]:grid-cols-1" onSubmit={onSubmit} noValidate>
            {/* ---- cột trái ---- */}
            <div className="flex flex-col gap-[18px]">
                <FormSection title="Thông tin cơ bản">
                    <FormField label="Tên sản phẩm" htmlFor="title" required hint="3–100 ký tự" error={errors.title}>
                        <input id="title" type="text" className={cls('input', 'title')} minLength={3} maxLength={100} placeholder="VD: Essence Mascara Lash Princess" value={form.title} onChange={handleChange} {...errAria('title')} />
                    </FormField>
                    <FormField label="Mô tả" htmlFor="description" required error={errors.description}>
                        <textarea id="description" className={cls('textarea', 'description')} placeholder="Mô tả ngắn về sản phẩm…" value={form.description} onChange={handleChange} required {...errAria('description')} />
                    </FormField>

                    <div className="grid grid-cols-2 gap-3.5">
                        <FormField label="Danh mục" htmlFor="category" required error={errors.category}>
                            <div className="relative">
                                <select id="category" className={cls('select', 'category')} value={form.category} onChange={handleChange} required {...errAria('category')}>
                                    <option value="" disabled>Chọn danh mục</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <Chevron />
                            </div>
                        </FormField>
                        <FormField label="Thương hiệu" htmlFor="brand">
                            <input id="brand" type="text" className={cls('input', 'brand')} placeholder="VD: Essence" value={form.brand} onChange={handleChange} />
                        </FormField>
                    </div>

                    <FormField label="Tags" htmlFor="tags" hint="dùng cho search phía client">
                        <div className={`flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-[9px] border bg-surface px-2 py-1 ${changedFields.has('tags') ? 'border-accent' : 'border-line'}`}>
                            {tags.map(tag => (
                                <span key={tag} className="inline-flex items-center gap-1 rounded-pill bg-chip px-2 py-[3px] text-ink">
                                    {tag}
                                    <button type="button" aria-label={`Xoá tag ${tag}`} className="cursor-pointer text-[14px] leading-none text-muted"
                                        onClick={() => removeTag(tag)}>×</button>
                                </span>
                            ))}
                            <input id="tags" type="text" placeholder="Thêm tag rồi Enter…" className="min-w-[120px] flex-1 text-[13.5px] text-ink"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown} />
                        </div>
                    </FormField>
                </FormSection>
                <FormSection title="Giá & kho">
                    <div className="grid grid-cols-4 gap-3.5 max-[901px]:grid-cols-2">
                        <FormField label="Giá" htmlFor="price" required error={errors.price}>
                            <div className="relative">
                                <input id="price" type="number" min="0" step="0.01" className={cls('price', 'price')} placeholder="0.00" value={form.price} onChange={handleChange} required {...errAria('price')} />
                                <span className={suffix}>$</span>
                            </div>
                        </FormField>
                        <FormField label="Giảm giá" htmlFor="discountPercentage">
                            <input id="discountPercentage" type="number" min="0" step="0.01" max="100" className={cls('input', 'discountPercentage')} placeholder="0" value={form.discountPercentage} onChange={handleChange} />
                        </FormField>
                        <FormField label="Tồn kho" htmlFor="stock" required error={errors.stock}>
                            <input id="stock" type="number" min="0" className={cls('input', 'stock')} placeholder="0" value={form.stock} onChange={handleChange} required {...errAria('stock')} />
                        </FormField>
                        <FormField label="Đặt tối thiểu" htmlFor="minimumOrderQuantity">
                            <input id="minimumOrderQuantity" type="number" min="1" className={cls('input', 'minimumOrderQuantity')} placeholder="1" value={form.minimumOrderQuantity} onChange={handleChange} />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                        <FormField label="Tình trạng" htmlFor="availabilityStatus">
                            <div className="relative">
                                <select id="availabilityStatus" className={cls('select', 'availabilityStatus')} value={form.availabilityStatus} onChange={handleChange}>
                                    <option value="" disabled>Chọn tình trạng</option>
                                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <Chevron />
                            </div>
                        </FormField>
                        <FormField label="SKU" htmlFor="sku">
                            <input id="sku" type="text" className={cls('input', 'sku')} placeholder="BEA-ESS-ESS-001" value={form.sku} onChange={handleChange} />
                        </FormField>
                    </div>
                </FormSection>

                <FormSection title="Quy cách & vận chuyển">
                    <div className="grid grid-cols-4 gap-3.5 max-[901px]:grid-cols-2">
                        <FormField label="Khối lượng" htmlFor="weight">
                            <input id="weight" type="number" min="0" step="0.01" className={cls('input', 'weight')} placeholder="0" value={form.weight} onChange={handleChange} />
                        </FormField>
                        <FormField label="Rộng" htmlFor="width">
                            <input id="width" type="number" min="0" step="0.01" className={cls('input', 'width')} placeholder="0" value={form.width} onChange={handleChange} />
                        </FormField>
                        <FormField label="Cao" htmlFor="height">
                            <input id="height" type="number" min="0" step="0.01" className={cls('input', 'height')} placeholder="0" value={form.height} onChange={handleChange} />
                        </FormField>
                        <FormField label="Sâu" htmlFor="depth">
                            <input id="depth" type="number" min="0" step="0.01" className={cls('input', 'depth')} placeholder="0" value={form.depth} onChange={handleChange} />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                        <FormField label="Bảo hành" htmlFor="warrantyInformation">
                            <input id="warrantyInformation" type="text" className={cls('input', 'warrantyInformation')} placeholder="VD: 1 year warranty" value={form.warrantyInformation} onChange={handleChange} />
                        </FormField>
                        <FormField label="Giao hàng" htmlFor="shippingInformation">
                            <input id="shippingInformation" type="text" className={cls('input', 'shippingInformation')} placeholder="VD: Ships in 1 week" value={form.shippingInformation} onChange={handleChange} />
                        </FormField>
                    </div>

                    <FormField label="Chính sách đổi trả" htmlFor="returnPolicy">
                        <input id="returnPolicy" type="text" className={cls('input', 'returnPolicy')} placeholder="VD: 7 days return policy" value={form.returnPolicy} onChange={handleChange} />
                    </FormField>
                </FormSection>
                {children}
            </div>

            {/* ---- cột phải ---- */}
            <div className="flex flex-col gap-[18px]">
                <FormSection title="Ảnh sản phẩm" meta={`${images.length}/5`}> {/* IMG_Edit: images = old (Edit, from the db) + dropped */}
                    <ImageDropzone images={images} onAdd={addImages} onRemove={removeImage} /> {/* IMG_Han */}
                </FormSection>
                <FormSection title="Xem trước">
                    <PreviewCard title={form.title} category={form.category} price={form.price} discountPercentage={form.discountPercentage}
                        thumbnail={images[0]?.previewUrl} /> {/* IMG_Han: first image -> preview card */}
                </FormSection>
            </div>
        </form>
    );
}

export default ProductFormFields;
