import type { Review } from "../../types/product";

const SVG_STAR_PATH = "M 12 2 l 3.09 6.26 L 22 9.27 l -5 4.87 l 1.18 6.88 L 12 17.77 l -6.18 3.25 L 7 14.14 l -5 -4.87 l 6.91 -1.01 L 12 2 Z";

function formatDate(iso: string) { // chuẩn iso
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

interface ReviewCardProps {
    review: Review;
}

export default function ReviewCard({ review }: ReviewCardProps) {
    return (
        <article className="flex grow basis-0 flex-col gap-[9px] rounded-[13px] border border-line bg-surface px-[18px] py-4">
            <div className="flex items-center justify-between">
                <span className="font-sans text-body font-semibold text-ink">
                    {review.reviewerName}
                </span>
                <span className="flex gap-[1.5px]">
                    {Array.from({ length: 5 }, (_, index) => (
                        <svg
                            key={index} viewBox="0 0 24 24"
                            className={`size-3 ${index < review.rating ? "fill-accent stroke-accent" : "fill-star-empty stroke-star-empty"}`}>
                            <path d={SVG_STAR_PATH} />
                        </svg>
                    ))}
                </span>
            </div>
            <p className="font-sans text-body leading-normal font-normal text-ink">{`"${review.comment}"`}</p>
            <span className="mt-auto text-[11.5px]">
                {formatDate(review.date)}
            </span>

        </article>
    )
}