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
                    Previous
                </PageButton>

                {/*  map các nút còn lại */}

                {
                    pageArray.map((item, index) =>
                        item === '...' ? (
                            <span key={`dots-${index}`} className="page-dots">...</span>
                        ) : (
                            <PageButton
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
                    Next
                    <svg className='next-arrow-svg' viewBox="0 0 24 24">
                        <path className='next-arrow-path'></path>
                    </svg>
                </PageButton>
            </>
        </div>
    )
}
