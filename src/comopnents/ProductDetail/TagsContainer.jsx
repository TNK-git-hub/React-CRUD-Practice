import "../../styles/ProductDetailElementStyle/TagsContainer.css"

export default function TagsContainer({ tags }) {
    return (
        <>
            <div className="tags-div-container">
                <span className="tags-label">Tags</span>
                {tags.map((tag, index) => (
                    <span key={index} className="tag-span">
                        {tag}
                    </span>
                ))}
            </div>
        </>
    )
}