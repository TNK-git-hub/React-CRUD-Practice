import { Link, useParams, useNavigate } from "react-router-dom";
import { useProduct } from "../hooks/useProduct";
import ImageGallery from "../comopnents/ProductDetail/ImageGallery";
import StarRating from "../comopnents/ProductDetail/StarRating";
import PriceBlock from "../comopnents/ProductDetail/PriceBlock";
import StockStatus from "../comopnents/ProductDetail/StockStatus";
import SpecGrid from "../comopnents/ProductDetail/SpecGrid";
import TagsContainer from "../comopnents/ProductDetail/TagsContainer";
import CommentsContainer from "../comopnents/ProductDetail/CommentsContainer";
import StatusMessage from "../comopnents/ProductListPageCom/StatusMessage";

const main = "flex grow flex-col gap-[22px] bg-bg px-12 pt-[26px] pb-9";

function ProductDetail() {
    const { id } = useParams();
    const { product, status, error, retry } = useProduct(id!) // route /products/:id -> luôn có id
    const navigate = useNavigate(); // hook của react router dom, trả về một hàm navigate chuyển trang theo tham số đường dẫn 

    const returnToProductPage = () => navigate("/");

    if (status === "loading") return <main className={main}></main>;// tạm
    if (status === "error") return <StatusMessage // TH: lỗi API
        icon="exclamation"
        title="Không tải dược danh sách sản phẩm"
        description="Yêu cầu tới DummyJSON thất bại. Kiểm tra kết nối mạng rồi thử lại."
        code={`HTTP ${error?.status} · /${error?.path}`}
        action={retry} />;
    if (status === "notfound") return <StatusMessage // TH: ko tìm thấy sp
        icon="404"
        title="Sản phẩm không tồn tại"
        description={<>DummyJSON trả về <code className="font-mono text-[11px]">404</code> cho id này. Hiển thị màn hình trống kèm lối quay lại danh sách</>}
        action={returnToProductPage} />;
    if (!product) return null; // status === 'success' -> luôn có product
    return (
        // <h1>Product {id}</h1>;
        <main className={main}>
            <div className="flex items-center justify-between">
                <nav className="flex items-center gap-2 text-[12.5px] text-muted">
                    <Link to="/" className="font-sans font-semibold text-accent no-underline">Products</Link>
                    <span>/</span>
                    <span>{product.category}</span>
                    <span>/</span>
                    <span><strong>{product.title}</strong></span>
                </nav>
                <span className="text-meta font-semibold tracking-[0.06em] text-muted uppercase">{`/products/${product.id}`}</span>
            </div>
            <div className="grid grid-cols-[460px_minmax(0,1fr)] gap-11"> {/* phần thông tin phía trên */}
                <ImageGallery key={product.id} images={product.images} title={product.title} />
                <div className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-2">
                        <span className="rounded-pill px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] uppercase bg-accent-soft text-accent">{product.category}</span>
                        <span className="rounded-pill px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] uppercase bg-chip text-muted">{product.brand}</span>
                        <span className="font-mono text-[11px] text-muted">{product.sku}</span>
                    </div>
                    <h1 className="font-display text-h1 leading-[1.1] font-normal text-ink">{product.title}</h1>
                    <StarRating rating={product.rating} ratingCount={product.reviewCount ?? product.reviews?.length ?? 0} />
                    <PriceBlock price={product.price} discountPercentage={product.discountPercentage} />
                    <StockStatus status={product.availabilityStatus} stock={product.stock} minimum={product.minimumOrderQuantity} />
                    <p className="font-sans text-body font-normal text-ink">{product.description}</p>
                    <SpecGrid
                        weight={product.weight}
                        dimensions={product.dimensions}
                        warrantyInformation={product.warrantyInformation}
                        shippingInformation={product.shippingInformation}
                        returnPolicy={product.returnPolicy}
                        barcode={product.meta.barcode}
                    />
                    <TagsContainer tags={product.tags} />
                </div>
            </div>
            <section className="mt-0.5 flex flex-col gap-3">
                <h2>Đánh giá
                    <span className="[font-family:inherit] [font-size:inherit] text-muted">
                        {` (${product.reviews.length})`}
                    </span>
                </h2>
                <CommentsContainer reviews={product.reviews} />
            </section>
        </main>
    )
}

export default ProductDetail;