// chỗ lưu code call api
// VITE_API_URL đặt lúc build (vd: /api khi deploy), chưa đặt thì dùng dummyjson
const BASE_URL = import.meta.env.VITE_API_URL || 'https://dummyjson.com';

// lỗi khi call api: Error bình thường + status, path
export class ApiError extends Error {
    status: number;
    path: string;

    constructor(message: string, status: number, path: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.path = path;
    }
}

// call, trả về json
/*

- options để cho lựa chọn method POST, PUT, DELETE
- T = kiểu của json trả về, vd apiFetch<Product>(...)
*/
export default async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) {
        const body: { message?: string | string[] } = await res.json().catch(() => ({})); // nếu ko parse dc json thì trả empty object
        const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        throw new ApiError(message ?? `Call api error: ${res.status}`, res.status, path);
    }
    return res.json();
}
