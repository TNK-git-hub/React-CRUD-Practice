import '../styles/pages/ProductList.css'

function ProductList() {
    return (
        <main className="product-list-main">
            <div className='pro-intro'>
                <div className='pro-intro-first-div'>
                    <h1>Products</h1>
                    <p>Dữ liệu từ <code>GET /products?limit=10&skip=0</code></p>
                </div>
                <div><span>/PRODUCTS</span></div>
            </div>
            <div className='search-filter-container'>
                <form action="">
                    <div className='search-div'>
                        <svg data-dc-tpl="27" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E5C52" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle data-dc-tpl="28" cx="11" cy="11" r="7"></circle><path data-dc-tpl="29" d="M20 20l-3.8-3.8"></path></svg>
                        <input type="text" placeholder="Tìm sản phẩm theo tên..." />
                    </div>
                </form>
            </div>


        </main>
    )
}

export default ProductList; 