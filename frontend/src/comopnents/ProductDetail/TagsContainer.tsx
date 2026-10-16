interface TagsContainerProps {
    tags: string[];
}

export default function TagsContainer({ tags }: TagsContainerProps) {
    return (
        <>
            <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Tags</span>
                {tags.map((tag, index) => (
                    <span key={index} className="rounded-badge bg-chip px-2.5 py-1 text-body font-semibold text-ink">
                        {tag}
                    </span>
                ))}
            </div>
        </>
    )
}