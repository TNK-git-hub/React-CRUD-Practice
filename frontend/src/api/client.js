// chỗ lưu code call api
const BASE_URL = 'https://dummyjson.com';

// call, trả về json
export default async function apiFetch(path) {
    const res = await fetch(`${BASE_URL}/${path}`);
    if (!res.ok) {
        const err = new Error(`Call api error: ${res.status}`);
        err.status = res.status;
        err.path = path;
        throw err;
    }
    return res.json();
}
