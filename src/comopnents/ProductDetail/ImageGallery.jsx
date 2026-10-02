import { useState } from "react";
import "../../styles/ProductDetailElementStyle/ImageGallery.css";

export default function ImageGallery({ images = [], title }) {
    const [selectedIndex, setSelectedIndex] = useState(0); // track xem bấm image nào

    return (
        <div className="product-images-display">
            <div className="product-main-img">
                {images.length > 0 && (
                    <img className="main-img" src={images[selectedIndex]} alt={title} />
                )}
            </div>
            {/* ảnh trong images[]  */}
            <div className="product-sub-imgs-containter">
                {images.map((src, index) => (
                    <button
                        key={src}
                        type="button" //thói quen cho việc tránh mặc định type = "submit" khi button nằm trong form
                        aria-label={`Ảnh ${index + 1}`}
                        className={index === selectedIndex ? "sub-img active" : "sub-img"}
                        onClick={() => setSelectedIndex(index)}
                    >
                        <img src={src} alt="" />
                    </button>
                ))}
            </div>
        </div>
    )
}