// chỗ lưu code call api
// NEXT_PUBLIC_API_URL đặt lúc build (vd: /api khi deploy), chưa đặt thì dùng dummyjson
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://dummyjson.com';

// lỗi khi call api: Error bình thường + status, path
export class ApiError extends Error {
    status: number;
    path: string;
    errors?: Record<string, string>; // per-field messages of a 400 body

    constructor(message: string, status: number, path: string, errors?: Record<string, string>) {
        super(message);
        if (errors) this.errors = errors;
        this.name = 'ApiError';
        this.status = status;
        this.path = path;
    }
}

// catch (err) có type unknown -> đổi về Error để lưu vào state / lấy .message
export function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

// call, trả về json
/*

- options để cho lựa chọn method POST, PUT, DELETE
- T = kiểu của json trả về, vd apiFetch<Product>(...)
*/
export default async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) {
        const body: { message?: string | string[]; errors?: Record<string, string> } = await res.json().catch(() => ({})); // nếu ko parse dc json thì trả empty object
        const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        const errors = res.status === 400 && body.errors && typeof body.errors === 'object' ? body.errors : undefined;
        throw new ApiError(message ?? `Call api error: ${res.status}`, res.status, path, errors);
    }
    return res.json();
}
