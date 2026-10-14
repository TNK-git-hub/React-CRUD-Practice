import "../../styles/ProductFormStyle/ImageDropzone.css";

function ImageDropzone() {
    return (
        <div className="image-dropzone">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V4.5M7.5 9L12 4.5 16.5 9" />
                <path d="M4 16v2.5a1.5 1.5 0 001.5 1.5h13a1.5 1.5 0 001.5-1.5V16" />
            </svg>
            <span className="dropzone-title">Kéo ảnh vào đây</span>
            <span className="dropzone-hint">PNG, JPG, WEBP · tối đa 2 MB</span>
            <button type="button" className="dropzone-button">Chọn tệp</button>
        </div>
    )
}

export default ImageDropzone;
