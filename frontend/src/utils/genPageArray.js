

export default function genPageArray(totalPage, currentPage) {
    const MaxDisplay = 6; // hiện hết 6 trang trong trường hợp <= 6
    const HeadCount = 5;  // số trang đầu hiện liền nhau

    // TH1: tổng số trang <= 6: hiện thị hết button luôn
    if (totalPage <= MaxDisplay) {
        return Array.from({ length: totalPage }, (_, i) => i + 1);
    }

    // TH2: tổng số trang >6: hiển thị kềm dấu ...
    // TH2.1: currentPage nằm trong 5 trang đầu 
    if (currentPage <= HeadCount) {
        const head = Array.from({ length: HeadCount }, (_, i) => i + 1); // mảng [1,2,3,4,5]
        return [...head, '...', totalPage]; // mảng [1,2,3,4,5, '...', trang cuối]
    }

    // TH2.2: currentPage từ trang 6 trở đi vd 1, ..., 6, ..., 20, chưa chạm trang cuối
    const pages = [1, '...', currentPage]; // VD: 1, ..., 6
    if (currentPage < totalPage - 1) pages.push('...');   // VD concat: 1, ..., 6, ...; Trương hợp chạm trang gần cuói (VD: 19) thì bỏ qua 
    if (currentPage < totalPage) pages.push(totalPage);   // VD concat: 1, ..., 6, ..., 20 ; Trương hợp chạm trang gần cuói (VD: 19): 1, ...,19, 20
    return pages;

}