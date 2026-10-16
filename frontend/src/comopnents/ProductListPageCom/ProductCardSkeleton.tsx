// cùng khung với ProductCard (ảnh cao 164px) -> data về ko bị nhảy layout
const bar = "rounded-pill bg-skeleton";

export default function ProductCardSkeleton() {
    return (
        <article className="relative flex h-full animate-skeleton flex-col rounded-card border border-line bg-surface transition-shadow duration-200 ease-[ease] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            <div className="h-[164px] bg-skeleton"></div>
            <div className="flex flex-col gap-2 p-3">
                <div className={`${bar} h-2 w-[46%]`}></div>
                <div className={`${bar} h-[11px] w-[88%]`}></div>
                <div className={`${bar} h-[11px] w-[60%]`}></div>
                <div className={`${bar} h-3.5 w-[38%]`}></div>
            </div>
        </article >
    )
}
