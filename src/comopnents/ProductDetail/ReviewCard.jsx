import "../../styles/ProductDetailElementStyle/ReviewCard.css"

const SVG_STAR_PATH = "M 12 2 l 3.09 6.26 L 22 9.27 l -5 4.87 l 1.18 6.88 L 12 17.77 l -6.18 3.25 L 7 14.14 l -5 -4.87 l 6.91 -1.01 L 12 2 Z";

function formatDate(iso) { // chuẩn iso
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default function ReviewCard({ review }) {
    return (
        <article className="review-card-container">
            <div className="name-and-rating-container">
                <span className="reviewer-name">
                    {review.reviewerName}
                </span>
                <span className="rating-stars-container">
                    {Array.from({ length: 5 }, (_, index) => (
                        <svg
                            key={index} viewBox="0 0 24 24"
                            className={index < review.rating ? "star filled" : "star empty"}>
                            <path d={SVG_STAR_PATH} />
                        </svg>
                    ))}
                </span>
            </div>
            <p className="comment typo-body">{`"${review.comment}"`}</p>
            <span className="date">
                {formatDate(review.date)}
            </span>

        </article>
    )
}