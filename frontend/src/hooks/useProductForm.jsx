import { useState } from 'react';

export function useProductForm(initialForm, initialTags = []) {
    const [form, setForm] = useState(initialForm);
    const [tags, setTags] = useState(initialTags);
    const [tagInput, setTagInput] = useState('');
    const [errors, setErrors] = useState({});   // { fieldId: 'message' }

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

    return { form, tags, tagInput, setTagInput, handleChange, handleTagKeyDown, removeTag, withPendingTag, errors, setErrors };
}
