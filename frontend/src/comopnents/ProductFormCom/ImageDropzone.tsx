import { useRef, useState } from 'react'; //IMG_Han
import type { DragEvent } from 'react';
import type { FormImage } from '../../utils/productForm';
import "../../styles/ProductFormStyle/ImageDropzone.css";

// images: [{ id, previewUrl }], onAdd(fileList) -> error messages, onRemove(id)
interface ImageDropzoneProps {
    images: FormImage[];
    onAdd: (fileList: FileList) => string[];
    onRemove: (id: string) => void;
}

function ImageDropzone({ images, onAdd, onRemove }: ImageDropzoneProps) { //IMG_Han
    const inputRef = useRef<HTMLInputElement>(null); //IMG_Han: the hidden <input type="file">
    const [isDragging, setIsDragging] = useState(false); //IMG_Han
    const [errors, setErrors] = useState<string[]>([]); //IMG_Han

    const handleFiles = (fileList: FileList) => setErrors(onAdd(fileList)); //IMG_Han: drop + "Chọn tệp" share the same checks

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); }; //IMG_Han
    const handleDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault(); //IMG_Han: ⚠️ without it, drop never fires
    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { //IMG_Han
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; //IMG_Han: moved onto a child (svg, span), not out
        setIsDragging(false); //IMG_Han
    }; //IMG_Han
    const handleDrop = (e: DragEvent<HTMLDivElement>) => { //IMG_Han
        e.preventDefault(); //IMG_Han: ⚠️ otherwise the browser opens the image
        setIsDragging(false); //IMG_Han
        handleFiles(e.dataTransfer.files); //IMG_Han
    }; //IMG_Han

    return (
        <>
            {images.length > 0 && ( // IMG_Han
                <ul className="dropzone-thumbs"> {/* IMG_Han */}
                    {images.map((img, i) => ( // IMG_Han
                        <li key={img.id}> {/* IMG_Han */}
                            <img src={img.previewUrl} alt="" /> {/* IMG_Han */}
                            {i === 0 && <span className="thumb-badge">Ảnh bìa</span>} {/* IMG_Han: first image = thumbnail */}
                            <button type="button" aria-label="Xoá ảnh" onClick={() => onRemove(img.id)}>×</button> {/* IMG_Han */}
                        </li>
                    ))}
                </ul>
            )}
            <div className={isDragging ? 'image-dropzone is-dragging' : 'image-dropzone'} //IMG_Han
                onDragEnter={handleDragEnter} onDragOver={handleDragOver} //IMG_Han
                onDragLeave={handleDragLeave} onDrop={handleDrop}> {/* IMG_Han */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 16V4.5M7.5 9L12 4.5 16.5 9" />
                    <path d="M4 16v2.5a1.5 1.5 0 001.5 1.5h13a1.5 1.5 0 001.5-1.5V16" />
                </svg>
                <span className="dropzone-title">Kéo ảnh vào đây</span>
                <span className="dropzone-hint">PNG, JPG, WEBP · tối đa 2 MB</span>
                <button type="button" className="dropzone-button"
                    onClick={() => inputRef.current?.click()}>Chọn tệp</button> {/* IMG_Han: opens the file dialog */}
                <input ref={inputRef} type="file" hidden multiple //IMG_Han
                    accept="image/png,image/jpeg,image/webp" //IMG_Han
                    onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} /> {/* IMG_Han: reset -> same file can be picked again */}
            </div>

            {errors.length > 0 && ( // IMG_Han
                <ul className="dropzone-errors">{errors.map(err => <li key={err}>{err}</li>)}</ul> // IMG_Han
            )}

        </>
    )
}

export default ImageDropzone;
