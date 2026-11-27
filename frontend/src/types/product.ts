// types theo response của backend (products.service.ts), không phải entity
// JSON không có Date -> các field ngày tháng là string (ISO)

export type SortField = 'title' | 'price' | 'rating' | 'stock'; // = SORTABLE_FIELDS ở backend
export type SortOrder = 'asc' | 'desc';

export interface Dimensions {
    width: number | null;
    height: number | null;
    depth: number | null;
}

export interface Review {
    id: number;
    rating: number;
    comment: string | null;
    date: string;
    reviewerName: string;
    reviewerEmail: string;
}

// các field chung của list và detail
interface ProductBase {
    id: number;
    title: string;
    description: string | null;
    category: string | null;
    brand: string | null;
    sku: string | null;
    price: number;
    discountPercentage: number;
    rating: number;
    stock: number;
    minimumOrderQuantity: number;
    availabilityStatus: string | null;
    weight: number | null;
    dimensions: Dimensions;
    warrantyInformation: string | null;
    shippingInformation: string | null;
    returnPolicy: string | null;
    thumbnail: string | null;
    reviewCount: number;
}

// GET /products: 1 dòng trong list (entity, không JOIN images/tags/reviews)
export interface ProductSummary extends ProductBase {
    barcode: string | null;
    qrCode: string | null;
    createdAt: string;
    updatedAt: string;
}

// GET /products/:id (cũng là response của create / update)
export interface Product extends ProductBase {
    tags: string[];
    images: string[];
    reviews: Review[];
    meta: { barcode: string | null; qrCode: string | null; createdAt: string; updatedAt: string };
}

export interface ProductListResponse {
    products: ProductSummary[];
    total: number;
    skip: number;
    limit: number;
}

// DELETE /products/:id
export interface DeletedProduct extends Product {
    isDeleted: true;
    deletedOn: string;
}

// body cho POST /products/add (giống CreateProductDto), PATCH dùng Partial<>
export interface ProductPayload {
    title: string;
    description: string;
    category: string;
    brand?: string;
    tags?: string[];
    price?: number;
    discountPercentage?: number;
    stock?: number;
    minimumOrderQuantity?: number;
    availabilityStatus?: string;
    sku?: string;
    weight?: number;
    dimensions?: { width?: number; height?: number; depth?: number };
    warrantyInformation?: string;
    shippingInformation?: string;
    returnPolicy?: string;
    images?: string[];
    thumbnail?: string;
}
