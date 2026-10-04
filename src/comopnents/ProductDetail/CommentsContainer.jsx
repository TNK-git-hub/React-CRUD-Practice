import "../../styles/ProductDetailElementStyle/CommentsContainer.css"

import ReviewCard from "./ReviewCard";

export default function CommentsContainer({ reviews }) {
    return (
        <div className="comments-container">
            {reviews.map(review => (
                <ReviewCard key={review.id} review={review} />
            ))}
        </div>
    )
}