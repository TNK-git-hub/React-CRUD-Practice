import "../../styles/ProList.css";
import ProductCard from "./ProductCard";
import ProductCardSkeleton from "./ProductCardSkeleton";
import type { ProductSummary } from "../../types/product";

// 2 trường hợp: đang loading (chỉ có isLoading) | đã có data (products + onDelete)
// -> trong nhánh else, TS biết chắc products và onDelete có giá trị
type ProListProps =
    | { isLoading: true; products?: undefined; onDelete?: undefined }
    | { isLoading?: false; products: ProductSummary[]; onDelete: (product: ProductSummary) => void };

// onDelete
function ProList({ products, isLoading, onDelete}: ProListProps) {
    console.log("prolist rendered");
    return (
        <div className='pro-list-container'>
            {/* map từng product vào mỗi card */}
            {isLoading
                ? Array.from({ length: 10 }, (_, i) => <ProductCardSkeleton key={i} />)
                : products.map(product => <ProductCard key={product.id} product={product} onDelete={onDelete}/>)}
            {/* <ProductCardSkeleton /> testing */}

        </div>
    )
}

export default ProList;