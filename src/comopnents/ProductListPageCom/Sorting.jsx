import "../../styles/Sorting.css";

function Sorting() {
    return (
        <div className='sorting-container'>
            <span>Sắp xếp</span>
            <select name="title" id="title-select">
                <option value="title">title</option>
            </select>
            <select name="order" id="order-select">
                <option value="asc">asc</option>
                <option value="desc">dsc</option>
            </select>

        </div>
    )
}

export default Sorting;
