import "../../styles/ProductDetailElementStyle/TagsContainer.css"

interface TagsContainerProps {
    tags: string[];
}

export default function TagsContainer({ tags }: TagsContainerProps) {
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