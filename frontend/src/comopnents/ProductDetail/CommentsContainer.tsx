import ReviewCard from "./ReviewCard";
import type { Review } from "../../types/product";

interface CommentsContainerProps {
    reviews: Review[];
}

export default function CommentsContainer({ reviews }: CommentsContainerProps) {
    return (
        <div className="flex gap-8">
            {reviews.map(review => (
                <ReviewCard key={review.id} review={review} />
            ))}
        </div>
    )
}