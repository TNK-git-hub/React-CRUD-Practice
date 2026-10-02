import '../../styles/PageNav.css';
import PageButton from './PageButton';
import genPageArray from '../../utils/genPageArray'

export default function PageNav({ totalPage, currentPage, setPage }) {
    const pageArray = genPageArray(totalPage, currentPage);

    return (
        <div className="page-nav-div">
            <>
                <PageButton
                    text="Previous"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}

                />

                {/*  map các nút còn lại */}

                {
                    pageArray.map((item, index) =>
                        item === '...' ? (
                            <span key={`dots-${index}`} className="page-dots">...</span>
                        ) : (
                            <PageButton
                                text={item}
                                onClick={() => setPage(item)}
                                className={item === currentPage ? 'active' : ''}
                            />
                        )
                    )
                }

                <PageButton
                    text="Next"
                    disabled={currentPage === totalPage}
                    onClick={() => setPage(currentPage + 1)}
                />
            </>
        </div>
    )
}
