import { Link, useParams } from "react-router-dom";

function EditProduct() {
    const { id } = useParams();   // "/products/5/edit" → id = "5" (always a string)

    return (
        <main>
            <h1>Sửa sản phẩm #{id}</h1>
            <Link to={`/products/${id}`}>← Quay lại</Link>
        </main>
    );
}

export default EditProduct;
