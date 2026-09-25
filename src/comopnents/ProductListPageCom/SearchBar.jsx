import "../../styles/SearchBar.css";

function SearchBar() {
    return (
        <div className='search-div'>
            <svg data-dc-tpl="27" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E5C52" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle data-dc-tpl="28" cx="11" cy="11" r="7"></circle><path data-dc-tpl="29" d="M20 20l-3.8-3.8"></path></svg>
            <input type="text" placeholder="Tìm sản phẩm theo tên..." />
        </div>
    )
}

export default SearchBar;