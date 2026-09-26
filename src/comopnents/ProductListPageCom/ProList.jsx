import "../../styles/ProList.css";
import ProductCard from "./ProductCard";

function ProList({ products }) {
    return (
        <div className='pro-list-container'>
            {/* map từng product vào mỗi card */}
            {products.map(product => <ProductCard key={product.id} product={product} />)}

        </div>
    )
}

export default ProList;