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

export function buildPayload(form, tags) {
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
