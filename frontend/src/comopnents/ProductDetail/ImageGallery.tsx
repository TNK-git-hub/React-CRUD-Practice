import { useState } from "react";

interface ImageGalleryProps {
    images?: string[];
    title: string;
}

export default function ImageGallery({ images = [], title }: ImageGalleryProps) {
    const [selectedIndex, setSelectedIndex] = useState(0); // track xem bấm image nào

    return (
        <div className="flex flex-col gap-3.5">
            <div className="flex h-96 items-center justify-center overflow-hidden rounded-panel border border-line bg-media">
                {images.length > 0 && (
                    <img className="size-full object-contain" src={images[selectedIndex]} alt={title} />
                )}
            </div>
            {/* ảnh trong images[]  */}
            <div className="flex flex-wrap gap-2.5">
                {images.map((src, index) => (
                    <button
                        key={src}
                        type="button" //thói quen cho việc tránh mặc định type = "submit" khi button nằm trong form
                        aria-label={`Ảnh ${index + 1}`}
                        className={`size-[76px] cursor-pointer overflow-hidden rounded-control border-2 bg-media p-0 ${index === selectedIndex ? "border-accent" : "border-line"}`}
                        onClick={() => setSelectedIndex(index)}
                    >
                        <img className="size-full object-cover" src={src} alt="" />
                    </button>
                ))}
            </div>
        </div>
    )
}