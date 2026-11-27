import type { Product, ProductPayload } from '../types/product';

export const CATEGORIES = ['beauty', 'fragrances', 'furniture', 'groceries', 'home-decoration', 'kitchen-accessories'];
export const STATUSES = ['In Stock', 'Low Stock', 'Out of Stock'];

export const EMPTY_FORM = {
    title: '', description: '', category: '', brand: '',
    price: '', discountPercentage: '', stock: '', minimumOrderQuantity: '',
    availabilityStatus: '', sku: '',
    weight: '', width: '', height: '', depth: '',
    warrantyInformation: '', shippingInformation: '', returnPolicy: '',
};

// giá trị của form: input luôn giữ string
export type ProductFormValues = typeof EMPTY_FORM;
export type FormField = keyof ProductFormValues;
export type FormErrors = Partial<Record<string, string>>; // { fieldId: 'message' }

// ảnh trong form: ảnh mới (có file, previewUrl là blob:) | ảnh cũ từ db (có url, không có file)
export type FormImage =
    | { id: string; previewUrl: string; file: File; url?: undefined }
    | { id: string; previewUrl: string; url: string; file?: undefined };

// '' -> undefined (JSON.stringify drops it), otherwise string -> number
const toNum = (v: string) => (v === '' ? undefined : Number(v));
const toStr = (v: string) => (v.trim() === '' ? undefined : v.trim());

export function buildPayload(form: ProductFormValues, tags: string[], images: string[] = []): ProductPayload { //IMG_FeToBe: images = uploaded URLs, default [] keeps EditProduct working
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
        images, //IMG_FeToBe
        // no barcode: the backend generates it
    };
}

// NEW: product from the API -> form values (inputs always hold strings)
const toInput = (v: unknown) => (v === null || v === undefined ? '' : String(v));   // null -> '', 11.49 -> "11.49"

export function productToForm(p: Product): ProductFormValues {
    return {
        title: toInput(p.title),
        description: toInput(p.description),
        category: toInput(p.category),
        brand: toInput(p.brand),
        price: toInput(p.price),
        discountPercentage: toInput(p.discountPercentage),
        stock: toInput(p.stock),
        minimumOrderQuantity: toInput(p.minimumOrderQuantity),
        availabilityStatus: toInput(p.availabilityStatus),
        sku: toInput(p.sku),
        weight: toInput(p.weight),
        width: toInput(p.dimensions?.width),      // flatten: dimensions.width -> width
        height: toInput(p.dimensions?.height),
        depth: toInput(p.dimensions?.depth),
        warrantyInformation: toInput(p.warrantyInformation),
        shippingInformation: toInput(p.shippingInformation),
        returnPolicy: toInput(p.returnPolicy),
    };
}

// NEW: which fields differ from the starting values -> Set of ids, e.g. {"title", "price"}
// images: items from useProductForm, initialImageUrls: urls from the db (Edit only)
export function getChangedFields(
    form: ProductFormValues, initialForm: ProductFormValues, tags: string[], initialTags: string[],
    images: FormImage[] = [], initialImageUrls: string[] = [],
): Set<string> {
    const changed: string[] = (Object.keys(initialForm) as FormField[]).filter(key => form[key] !== initialForm[key]);
    if (tags.join() !== initialTags.join()) changed.push('tags');   // arrays: compare as text
    // IMG_Edit: removed / added / reordered -> changed (a new image has no url yet, so it never matches)
    if (images.length !== initialImageUrls.length
        || images.some((img, i) => img.url !== initialImageUrls[i])) changed.push('images');
    return new Set(changed);
}

const filled = (v: string) => v.trim() !== '';

// required fields only -> { fieldId: 'message' }, empty object = valid
export function validateProduct(form: ProductFormValues): FormErrors {
    const errors: FormErrors = {};

    const title = form.title.trim();
    if (!title) errors.title = 'Tên sản phẩm là bắt buộc.';
    else if (title.length < 3 || title.length > 100) errors.title = 'Tên phải từ 3–100 ký tự.';

    if (!filled(form.description)) errors.description = 'Mô tả là bắt buộc.';

    if (!CATEGORIES.includes(form.category)) errors.category = 'Hãy chọn danh mục.';

    if (!filled(form.price)) errors.price = 'Giá là bắt buộc.';
    else if (!(Number(form.price) > 0)) errors.price = 'Giá phải lớn hơn 0.';

    const stock = Number(form.stock);
    if (!filled(form.stock)) errors.stock = 'Tồn kho là bắt buộc.';
    else if (!Number.isInteger(stock) || stock < 0) errors.stock = 'Tồn kho phải là số nguyên ≥ 0.';

    return errors;
}
