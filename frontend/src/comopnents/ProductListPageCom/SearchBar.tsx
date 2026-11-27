interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    isError?: boolean;
}

function SearchBar({ value, onChange, isError = false }: SearchBarProps) {
    // focus-within: input bên trong đang focus -> glow nâu, ko cần useState + onFocus/onBlur nữa
    const border = isError ? "border-danger" : "border-line focus-within:border-accent";
    return (
        <div className={`flex h-10 w-[380px] items-center gap-[9px] rounded-control border bg-surface px-3.5 focus-within:ring-3 focus-within:ring-focus-ring ${border}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 stroke-muted" fill="none" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.8-3.8"></path></svg>
            <input
                type="text" placeholder="Tìm sản phẩm theo tên..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    )
}

export default SearchBar;
