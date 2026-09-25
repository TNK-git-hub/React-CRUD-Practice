import "../styles/Header.css"

function Header({ theme, toggleTheme }) {

    return (
        <header className="header-container">
            <h2>ReactDummy</h2>

            <div className="theme-pill">
                <button className={`theme-toggle-button ${theme === "light" ? "cur-act" : ""}`} onClick={toggleTheme} >
                    <svg data-dc-tpl="10" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#17160F" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle data-dc-tpl="11" cx="12" cy="12" r="4.2"></circle><path data-dc-tpl="12" d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3L4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5"></path></svg>
                    Light
                </button>
                <button className={`theme-toggle-button ${theme === "dark" ? "cur-act" : ""}`} onClick={toggleTheme}>
                    <svg data-dc-tpl="14" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5E5C52" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path data-dc-tpl="15" d="M20 14.2A8.4 8.4 0 019.8 4 8.4 8.4 0 1020 14.2z"></path></svg>
                    Dark
                </button>
            </div>
        </header >
    )
}

export default Header;