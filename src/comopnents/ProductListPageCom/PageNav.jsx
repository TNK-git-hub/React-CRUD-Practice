import '../../styles/PageNav.css';
import PageButton from './PageButton';

function genPageArray() {
    const MaxDisplay = 6;

}

export default function PageNav({ totalPage, currentPage, setPage }) {

    return (
        <div className="page-nav-div">
            <>
                <PageButton
                    text="Previous"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)} />

                {/*  map các nút còn lại */}
                {

                }


                <PageButton
                    text="Next"
                    disabled={currentPage === totalPage}
                    onClick={() => setPage(currentPage + 1)} />
            </>
        </div>
    )
}
