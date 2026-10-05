import '../../styles/PageNav.css';
import PageButton from './PageButton';
import genPageArray from '../../utils/genPageArray'

export default function PageNav({ totalPage, currentPage, setPage }) {
    const pageArray = genPageArray(totalPage, currentPage);

    return (
        <div className="page-nav-div">
            <>
                <PageButton

                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                >
                    <svg className='previous-arrow-svg' viewBox="0 0 24 24">
                        <path className='previous-arrow-path'></path>
                    </svg>
                    <span className='page-nav-label'>Previous</span>
                </PageButton>

                {/*  map các nút còn lại */}

                {
                    pageArray.map((item, index) =>
                        item === '...' ? (
                            <span key={`dots-${index}`} className="page-dots">...</span>
                        ) : (
                            <PageButton
                                key={item}
                                children={item}
                                onClick={() => setPage(item)}
                                className={item === currentPage ? 'active' : ''}
                            />
                        )
                    )
                }

                <PageButton
                    disabled={currentPage === totalPage}
                    onClick={() => setPage(currentPage + 1)}
                >
                    {/* className chủ yếu để hiển thị mobile */}
                    <span className='page-nav-label'>Next</span>

                    <svg className='next-arrow-svg' viewBox="0 0 24 24">
                        <path className='next-arrow-path'></path>
                    </svg>
                </PageButton>
            </>
        </div>
    )
}
