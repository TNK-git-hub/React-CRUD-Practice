import defaultProductImg from "../../assets/website-7-kh-2026-08-12t163109-795.jpg";
import { Link } from "react-router-dom";
import getPreviousPrice from "../../utils/getPreviousPrice";
import CardMenu from "./CardMenu";
import type { Review, ProductSummary } from "../../types/product";

// dummyjson (khi chưa đặt VITE_API_URL) trả reviews thay vì reviewCount
type CardProduct = ProductSummary & { reviews?: Review[] };

interface ProductCardProps {
    product: CardProduct;
    onDelete: (product: ProductSummary) => void;
}

// category / brand: chữ nhỏ in hoa (desktop hiện "category - brand", mobile chỉ category)
const overline = "font-sans text-overline font-bold tracking-[0.09em] text-muted uppercase";

// onDelete: fucntion to handle xoá product
function ProductCard({ product, onDelete }: ProductCardProps) {
    const title = product.title;
    const category = product.category;
    const brand = product.brand;
    const rating = product.rating;
    const price = product.price;
    const discountPercentage = product.discountPercentage;
    const thumbnail = product.thumbnail;
    const ratingCount = product.reviewCount ?? product.reviews?.length ?? 0;

    // Tính toán các giá trị hiển thị
    const discount = Math.round(discountPercentage);
    const previousPrice = getPreviousPrice(price, discountPercentage); // dịch chuyển sang hàm tại utils, để tái sử dụng

    console.log("procard re-redered");
    return (
        <article className="relative flex h-full flex-col rounded-card border border-line bg-surface transition-shadow duration-200 ease-[ease] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            <Link to={`/products/${product.id}`} className="flex grow flex-col text-inherit no-underline">
                <div className="relative flex h-[164px] items-center justify-center overflow-hidden rounded-t-[13px] bg-chip max-xs:h-24">
                    <span className="absolute top-2.5 left-2.5 rounded-pill bg-accent px-2 py-[3px] text-[10.5px] font-bold tracking-[0.02em] text-surface">-{discount}%</span>
                    <img className="size-full object-cover" alt="product pic" src={thumbnail ?? undefined} />
                </div>
                <div className="flex grow flex-col gap-[7px] px-3.5 pt-[13px] pb-[15px] max-xs:gap-[5px] max-xs:px-[11px] max-xs:pt-2.5 max-xs:pb-3">
                    <div className={`${overline} max-xs:hidden`}>{`${category} - ${brand}`}</div>
                    <div className={`${overline} hidden max-xs:block`}>{`${category}`}</div>
                    <h3 className="font-sans text-body leading-[1.35] font-semibold text-ink capitalize max-xs:leading-[1.3]">{title}</h3>
                    <div className="flex items-center gap-[5px] max-xs:hidden">
                        <svg width="12" height="12" viewBox="0 0 24 24" className="fill-accent" aria-hidden="true"><path d="M12 2.4l2.86 6.02 6.44.86-4.7 4.6 1.16 6.55L12 17.32 6.24 20.43 7.4 13.88l-4.7-4.6 6.44-.86z"></path></svg>
                        <span className="font-sans text-[11.5px] font-semibold text-ink">{rating}</span>
                        <span className="text-[11.5px]">{`(${ratingCount})`}</span>
                    </div>
                    <div className="mt-auto flex items-baseline gap-2 pt-1 max-xs:gap-1.5">
                        <span className="font-sans text-price font-bold text-ink">${price}</span>
                        <span className="font-sans text-[11.5px] line-through">${previousPrice}</span>    {/*Tự tính tự discount và price*/}
                    </div>
                    <span className=""></span>
                </div>
            </Link >
            <CardMenu product={product} onDelete={onDelete} />
        </article>

    )
}

export default ProductCard;
