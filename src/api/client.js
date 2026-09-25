// chỗ lưu code call api
const BASE_URL = 'https://dummyjson.com';

// call, trả về json
export default async function apiFetch(path) {
    const res = await fetch(`${BASE_URL}/${path}`);
    if (!res.ok) {
        throw new Error(`Call api error: ${res.status}`);
    }
    return res.json();
}
