export const CATEGORIES = ['beauty', 'fragrances', 'furniture', 'groceries', 'home-decoration', 'kitchen-accessories'];
export const STATUSES = ['In Stock', 'Low Stock', 'Out of Stock'];

export const EMPTY_FORM = {
    title: '', description: '', category: '', brand: '',
    price: '', discountPercentage: '', stock: '', minimumOrderQuantity: '',
    availabilityStatus: '', sku: '',
    weight: '', width: '', height: '', depth: '',
    warrantyInformation: '', shippingInformation: '', returnPolicy: '',
};

// '' -> undefined (JSON.stringify drops it), otherwise string -> number
const toNum = (v) => (v === '' ? undefined : Number(v));
const toStr = (v) => (v.trim() === '' ? undefined : v.trim());

export function buildPayload(form, tags, images = []) { //IMG_FeToBe: images = uploaded URLs, default [] keeps EditProduct working
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
const toInput = (v) => (v === null || v === undefined ? '' : String(v));   // null -> '', 11.49 -> "11.49"

export function productToForm(p) {
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
export function getChangedFields(form, initialForm, tags, initialTags) {
    const changed = Object.keys(initialForm).filter(key => form[key] !== initialForm[key]);
    if (tags.join() !== initialTags.join()) changed.push('tags');   // arrays: compare as text
    return new Set(changed);
}

const filled = (v) => v.trim() !== '';

// required fields only -> { fieldId: 'message' }, empty object = valid
export function validateProduct(form) {
    const errors = {};

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
