export type Theme = "light" | "dark";

interface HeaderProps {
    theme: Theme;
    toggleTheme: () => void;
}

// nút đang chọn: nền trắng + viền, ko bấm được; nút còn lại: chữ muted
const toggle = "inline-flex cursor-pointer items-center justify-center rounded-pill py-1.5 font-semibold";
const toggleActive = `${toggle} pointer-events-none gap-1 border border-line bg-surface px-3 text-ink`;
const toggleIdle = `${toggle} gap-2 bg-chip px-[13px] text-muted`;
const icon = "size-[15px]";

function Header({ theme, toggleTheme }: HeaderProps) {

    return (
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-line bg-surface px-12 max-xs:h-[58px] max-xs:px-[18px]">
            <h2>ReactDummy</h2>

            <div className="flex items-center gap-1.5 rounded-pill border border-line bg-chip p-1">
                <button className={theme === "light" ? toggleActive : toggleIdle} onClick={toggleTheme}>
                    <svg className={`${icon} ${theme === "light" ? "stroke-ink" : "stroke-muted"}`} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="4.2"></circle>
                        <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3L4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5"></path></svg>
                    Light
                </button>
                <button className={theme === "dark" ? toggleActive : toggleIdle} onClick={toggleTheme}>
                    <svg className={`${icon} ${theme === "dark" ? "stroke-ink" : "stroke-muted"}`} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 14.2A8.4 8.4 0 019.8 4 8.4 8.4 0 1020 14.2z"></path>
                    </svg>
                    Dark
                </button>
            </div>
        </header>
    )
}

export default Header;