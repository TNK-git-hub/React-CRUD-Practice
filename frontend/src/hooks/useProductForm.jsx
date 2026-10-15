import { useEffect, useRef, useState } from 'react';

export const MAX_IMAGES = 5; //IMG_Han
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']; //IMG_Han
const MAX_SIZE = 2 * 1024 * 1024; //IMG_Han: 2 MB, same as the backend

// initialImageUrls: image urls already in the db (Edit only), e.g. dummyjson cdn or /uploads/...
export function useProductForm(initialForm, initialTags = [], initialImageUrls = []) {
    const [form, setForm] = useState(initialForm);
    const [tags, setTags] = useState(initialTags);
    const [tagInput, setTagInput] = useState('');
    const [errors, setErrors] = useState({});   // { fieldId: 'message' }
    // new image: { id, file, previewUrl: blob: } | old image: { id, url, previewUrl: url } (no file -> nothing to upload)
    const [images, setImages] = useState(() => initialImageUrls.map(url => ({ //IMG_Edit: runs on the first render only
        id: crypto.randomUUID(), //IMG_Edit: not the url -> the same url twice still gets 2 keys
        url, //IMG_Edit
        previewUrl: url, //IMG_Edit: a normal http url works in <img src> too
    })));

    const handleChange = (e) => {
        const { id, value } = e.target;
        setForm(prev => ({ ...prev, [id]: value }));
        // the user is fixing this field -> remove its error
        setErrors(prev => {
            if (!prev[id]) return prev;              // no error -> same object, no re-render
            const { [id]: _, ...rest } = prev;
            return rest;
        });
    };

    // returns the tags list with tagInput added (if it's new)
    const withPendingTag = () => {
        const tag = tagInput.trim().toLowerCase();
        return tag && !tags.includes(tag) ? [...tags, tag] : tags;
    };

    const handleTagKeyDown = (e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return; // skip Enter while Telex/IME is composing
        e.preventDefault();               // ⚠️ otherwise Enter submits the whole form
        setTags(withPendingTag());
        setTagInput('');
    };

    const removeTag = (tag) => setTags(prev => prev.filter(t => t !== tag));

    // checks the files, adds the valid ones, returns a list of error messages
    const addImages = (fileList) => { //IMG_Han
        const errs = []; //IMG_Han
        const valid = []; //IMG_Han
        for (const file of fileList) { //IMG_Han: FileList isn't an array -> no .map
            if (!ALLOWED_TYPES.includes(file.type)) errs.push(`${file.name}: chỉ nhận PNG, JPG, WEBP`); //IMG_Han
            else if (file.size > MAX_SIZE) errs.push(`${file.name}: lớn hơn 2 MB`); //IMG_Han
            else valid.push(file); //IMG_Han
        } //IMG_Han
        const room = MAX_IMAGES - images.length; //IMG_Han: free slots left (old + new images)
        if (valid.length > room) errs.push(`Tối đa ${MAX_IMAGES} ảnh`); //IMG_Han

        const added = valid.slice(0, room).map(file => ({ //IMG_Han: keep only as many as fit
            id: crypto.randomUUID(), //IMG_Han: stable key for React lists
            file, //IMG_Han: kept for the upload (Phase B)
            previewUrl: URL.createObjectURL(file), //IMG_Han: blob: URL for <img src>
        })); //IMG_Han
        setImages(prev => [...prev, ...added]); //IMG_Han
        return errs; //IMG_Han
    }; //IMG_Han

    const removeImage = (id) => { //IMG_Han
        const img = images.find(i => i.id === id); //IMG_Han
        if (img?.file) URL.revokeObjectURL(img.previewUrl); //IMG_Han: free the memory (only blob: urls, old images have none)
        setImages(prev => prev.filter(i => i.id !== id)); //IMG_Han
    }; //IMG_Han

    // free every preview URL when the page closes (ref = always the latest list)
    const imagesRef = useRef(images); //IMG_Han
    useEffect(() => { imagesRef.current = images; }, [images]); //IMG_Han
    useEffect(() => () => imagesRef.current.filter(i => i.file).forEach(i => URL.revokeObjectURL(i.previewUrl)), []); //IMG_Han: skip old images (http url)

    return { form, tags, tagInput, setTagInput, handleChange, handleTagKeyDown, removeTag, withPendingTag, errors, setErrors, images, addImages, removeImage };
}
