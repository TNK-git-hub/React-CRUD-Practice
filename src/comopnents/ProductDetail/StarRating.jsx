import "../../styles/ProductDetailElementStyle/StarRating.css"

const SVG_STAR_PATH = "M 12 2.4 l 2.86 6.02 l 6.44 0.86 l -4.7 4.6 l 1.16 6.55 L 12 17.32 L 6.24 20.43 L 7.4 13.88 l -4.7 -4.6 l 6.44 -0.86 Z"

export default function StarRating({ rating, ratingCount }) {
    const starNum = Math.round(rating);

    return (
        <div className="star-rating-container">
            <span className="stars-number">
                {Array.from({ length: 5 }, (_, index) => (
                    <svg
                        key={index} viewBox="0 0 24 24"
                        className={index < starNum ? "star filled" : "star empty"}>
                        <path d={SVG_STAR_PATH} />
                    </svg>
                ))}
            </span>
            <span className="rating-num">{rating}</span>
            <span className="rating-count">{`· ${ratingCount} đánh giá`}</span>
        </div>
    )
}

