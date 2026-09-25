import SearchBar from '../comopnents/SearchBar';
import Button from '../comopnents/Button';
import Sorting from '../comopnents/Sorting';
import '../styles/pages/ProductList.css'

function ProductList() {
    return (
        <main className="product-list-main">
            <div className='pro-intro'>
                <div className='pro-intro-first-div'>
                    <h1>Products</h1>
                    <p>Dữ liệu từ <code>GET /products?limit=10&skip=0</code></p>
                </div>
                <div><span className='product-route-badge'>/PRODUCTS</span></div>
            </div>
            <div className='search-sorting-container'>
                <form action="">
                    <SearchBar />
                    <Button />
                    <div style={{ flexGrow: 1 }}></div>
                    <Sorting />


                </form>
            </div>


        </main>
    )
}

export default ProductList;