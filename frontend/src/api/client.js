// chỗ lưu code call api
// VITE_API_URL đặt lúc build (vd: /api khi deploy), chưa đặt thì dùng dummyjson
const BASE_URL = import.meta.env.VITE_API_URL || 'https://dummyjson.com';

// call, trả về json
/*

- options để cho lựa chọn method POST, PUT, DELETE
*/
export default async function apiFetch(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) {
        const body = await res.json().catch(() => ({})); // nếu ko parse dc json thì trả empty object
        const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        const err = new Error(body.message ?? `Call api error: ${res.status}`); // nếu ko có message thì trả lỗi default
        err.status = res.status;
        err.path = path;
        throw err;
    }
    return res.json();
}
