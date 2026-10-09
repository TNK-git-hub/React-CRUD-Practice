import { useState } from "react";
import SearchBar from "./SearchBar";
import Button from "./Button";
import Sorting from "./Sorting";

// searchInput nằm ở đây thay vì ProductList → gõ phím chỉ re-render SearchForm
function SearchForm({ initialValue = "", onSearch, sortBy, order, handleSort, isError = false }) {
    const [searchInput, setSearchInput] = useState(initialValue); // Track Search input hiện tại

    const handleSubmit = (e) => {
        e.preventDefault();
        onSearch(searchInput.trim()); // chỉ báo lên cha khi submit
    }

    console.log("searchForm rendered");
    return (
        <form onSubmit={handleSubmit}>
            <SearchBar value={searchInput} onChange={setSearchInput} isError={isError} />
            <Button text="Search" type="submit" />
            <div style={{ flexGrow: 1 }}></div>
            <Sorting sortBy={sortBy} order={order} onChange={handleSort} />
        </form>
    )
}

export default SearchForm;
