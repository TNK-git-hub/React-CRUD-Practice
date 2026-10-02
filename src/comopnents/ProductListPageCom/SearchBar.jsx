import { useState } from "react";
import "../../styles/SearchBar.css";

function SearchBar({ value, onChange }) {
    const [isFocus, setIsFocus] = useState(false);
    return (
        <div className={isFocus ? "search-div-focus" : "search-div"}>
            <svg data-dc-tpl="27" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E5C52" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle data-dc-tpl="28" cx="11" cy="11" r="7"></circle><path data-dc-tpl="29" d="M20 20l-3.8-3.8"></path></svg>
            <input
                type="text" placeholder="Tìm sản phẩm theo tên..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setIsFocus(true)}
                onBlur={() => setIsFocus(false)}
            />
        </div>
    )
}

export default SearchBar;