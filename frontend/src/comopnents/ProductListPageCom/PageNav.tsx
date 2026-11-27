import PageButton from './PageButton';
import genPageArray from '../../utils/genPageArray'

interface PageNavProps {
    totalPage: number;
    currentPage: number;
    setPage: (page: number) => void;
}

export default function PageNav({ totalPage, currentPage, setPage }: PageNavProps) {
    const pageArray = genPageArray(totalPage, currentPage);

    return (
        <div className="flex items-center gap-1.5">
            <>
                <PageButton

                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                >
                    <svg viewBox="0 0 24 24" className="size-3.5 stroke-ink" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M 15 5 l -6 7 l 6 7" />
                    </svg>
                    <span className="max-xs:hidden">Previous</span>
                </PageButton>

                {/*  map các nút còn lại */}

                {
                    pageArray.map((item, index) =>
                        item === '...' ? (
                            <span key={`dots-${index}`} className="select-none px-1">...</span>
                        ) : (
                            <PageButton
                                key={item}
                                onClick={() => setPage(item)}
                                active={item === currentPage}
                            >{item}</PageButton>
                        )
                    )
                }

                <PageButton
                    disabled={currentPage === totalPage}
                    onClick={() => setPage(currentPage + 1)}
                >
                    {/* className chủ yếu để hiển thị mobile */}
                    <span className="max-xs:hidden">Next</span>

                    <svg viewBox="0 0 24 24" className="size-3.5 stroke-ink" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M 9 5 l 6 7 l -6 7" />
                    </svg>
                </PageButton>
            </>
        </div>
    )
}
