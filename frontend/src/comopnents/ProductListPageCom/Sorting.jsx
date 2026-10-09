import "../../styles/Sorting.css";

const SORT_FIELDS = ['title', 'price', 'rating', 'stock'];

function Sorting({ sortBy, order, onChange }) {
    return (
        <div className='sorting-container'>
            <span>Sắp xếp</span>
            <select value={sortBy} onChange={e => onChange({ sortBy: e.target.value, order })} name="title" id="title-select">
                <option value="">none</option>
                {SORT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={order} onChange={e => onChange({ sortBy, order: e.target.value })} name="order" id="order-select">
                <option value="asc">asc</option>
                <option value="desc">desc</option>
            </select>

        </div>
    )
}

export default Sorting;
