// class Tailwind cho nút, dùng chung cho <button> và <Link> (vì là string, ko phải component)
// v4: button mặc định cursor: default -> phải tự thêm cursor-pointer
const base =
    'inline-flex h-10 cursor-pointer items-center justify-center rounded-control font-sans text-body font-semibold no-underline ' +
    'disabled:cursor-not-allowed disabled:opacity-42';

export const btn = {
    primary: `${base} px-5 bg-accent text-surface hover:bg-accent-hover`,
    secondary: `${base} px-[17px] border border-line bg-surface text-ink hover:bg-chip`,
    danger: `${base} px-5 bg-danger text-surface`, // nút xoá / rời trang trong dialog, hover giữ nguyên màu đỏ
};
