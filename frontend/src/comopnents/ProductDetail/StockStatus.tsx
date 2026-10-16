interface StockStatusProps {
    status: string | null;
    stock: number;
    minimum: number;
}

export default function StockStatus({ status, stock, minimum }: StockStatusProps) {
    return (
        <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-ok-soft px-[11px] py-[5px] text-[12.5px] font-semibold text-ok">
                <span className="size-[7px] rounded-pill bg-ok"></span>
                In Stock
            </span>

            <span>
                còn <strong>{stock}</strong> sản phẩm · đặt tối thiểu <strong>{minimum}</strong>
            </span>

        </div>
    )
}