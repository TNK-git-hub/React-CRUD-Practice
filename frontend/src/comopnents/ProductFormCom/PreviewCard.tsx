import getPreviousPrice from "../../utils/getPreviousPrice";

// giá trị lấy thẳng từ form -> string
interface PreviewCardProps {
    title: string;
    category: string;
    price: string;
    discountPercentage: string;
    thumbnail?: string;
}

// shows the product card live while the user fills in the form
function PreviewCard({ title, category, price, discountPercentage, thumbnail }: PreviewCardProps) { //IMG_Han: thumbnail = blob: URL of the first image
    const priceNum = Number(price) || 0;               // '' -> 0
    const discount = Number(discountPercentage) || 0;
    const hasDiscount = discount > 0 && discount < 100;

    return (
        <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex h-28 items-center justify-center bg-media font-display text-[38px] text-muted">
                {thumbnail // IMG_Han
                    ? <img className="size-full object-cover" src={thumbnail} alt="" /> // IMG_Han
                    : (title.trim().charAt(0).toUpperCase() || '?')} {/* IMG_Han: no image -> first letter */}
            </div>
            <div className="flex flex-col gap-[5px] px-3 pt-[11px] pb-[13px]">
                <div className="text-[9.5px] font-bold tracking-[0.08em] text-muted uppercase">{category || 'Danh mục'}</div>
                <span className="text-[13px] leading-[1.3] font-semibold text-ink">{title.trim() || 'Tên sản phẩm'}</span>
                <div className="flex items-baseline gap-[7px] pt-0.5">
                    <span className="text-[16px] font-bold text-ink">${priceNum.toFixed(2)}</span>
                    {hasDiscount && (
                        <span className="text-[11px] line-through">${getPreviousPrice(priceNum, discount)}</span>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PreviewCard;
