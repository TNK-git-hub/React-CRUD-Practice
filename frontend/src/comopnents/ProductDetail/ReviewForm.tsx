'use client';
import { useState } from "react";
import type { FormEvent } from "react";
import { useAddReview } from "../../hooks/useProductMutations";
import { validateReview } from "../../utils/reviewForm";
import type { ReviewFormErrors } from "../../utils/reviewForm";
import { btn } from "../../utils/buttonStyles";
import type { ReviewPayload } from "../../types/product";

const SVG_STAR_PATH = "M 12 2 l 3.09 6.26 L 22 9.27 l -5 4.87 l 1.18 6.88 L 12 17.77 l -6.18 3.25 L 7 14.14 l -5 -4.87 l 6.91 -1.01 L 12 2 Z";

const inputClass = "rounded-control border border-line bg-surface px-3 py-2 font-sans text-body text-ink";
const labelClass = "flex flex-col gap-1 font-sans text-body font-semibold text-ink";
const errorClass = "font-sans text-[12px] font-normal text-danger";

interface ReviewFormProps {
    productId: number;
}

export default function ReviewForm({ productId }: ReviewFormProps) {
    const [rating, setRating] = useState<number | null>(null);
    const [reviewerName, setReviewerName] = useState("");
    const [reviewerEmail, setReviewerEmail] = useState("");
    const [comment, setComment] = useState("");
    const [errors, setErrors] = useState<ReviewFormErrors>({});
    const [submitted, setSubmitted] = useState(false);
    const { mutate, isPending, error, reset } = useAddReview(productId);

    const clearError = (field: keyof ReviewFormErrors) => {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
        setSubmitted(false);
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const found = validateReview({ rating, reviewerName, reviewerEmail, comment });
        setErrors(found);
        if (Object.keys(found).length > 0 || rating === null) return;

        const payload: ReviewPayload = {
            rating,
            reviewerName: reviewerName.trim(),
            reviewerEmail: reviewerEmail.trim(),
        };
        const trimmedComment = comment.trim();
        if (trimmedComment) payload.comment = trimmedComment;

        setSubmitted(false);
        reset();
        mutate(payload, {
            onSuccess: () => {
                setRating(null);
                setReviewerName("");
                setReviewerEmail("");
                setComment("");
                setErrors({});
                setSubmitted(true);
            },
        });
    };

    return (
        <form noValidate onSubmit={handleSubmit}
            className="flex flex-col gap-3 rounded-[13px] border border-line bg-surface px-[18px] py-4">
            <h3 className="font-sans text-body font-semibold text-ink">Viết đánh giá</h3>

            <div className="flex flex-col gap-1">
                <div className="flex gap-1">
                    {Array.from({ length: 5 }, (_, index) => (
                        <button key={index} type="button" aria-label={`${index + 1} sao`}
                            aria-pressed={rating === index + 1}
                            className="cursor-pointer border-0 bg-transparent p-0"
                            onClick={() => { setRating(index + 1); clearError("rating"); }}>
                            <svg viewBox="0 0 24 24"
                                className={`size-6 ${rating !== null && index < rating ? "fill-accent stroke-accent" : "fill-star-empty stroke-star-empty"}`}>
                                <path d={SVG_STAR_PATH} />
                            </svg>
                        </button>
                    ))}
                </div>
                {errors.rating && <p role="alert" className={errorClass}>{errors.rating}</p>}
            </div>

            <label className={labelClass}>
                Tên
                <input name="reviewerName" type="text" value={reviewerName} className={inputClass}
                    onChange={(e) => { setReviewerName(e.target.value); clearError("reviewerName"); }} />
                {errors.reviewerName && <span role="alert" className={errorClass}>{errors.reviewerName}</span>}
            </label>

            <label className={labelClass}>
                Email
                <input name="reviewerEmail" type="email" value={reviewerEmail} className={inputClass}
                    onChange={(e) => { setReviewerEmail(e.target.value); clearError("reviewerEmail"); }} />
                {errors.reviewerEmail && <span role="alert" className={errorClass}>{errors.reviewerEmail}</span>}
            </label>

            <label className={labelClass}>
                Nhận xét
                <textarea name="comment" rows={3} value={comment} className={inputClass}
                    onChange={(e) => { setComment(e.target.value); clearError("comment"); }} />
                {errors.comment && <span role="alert" className={errorClass}>{errors.comment}</span>}
            </label>

            {error && <p role="alert" className={errorClass}>{error.message}</p>}
            {submitted && <p role="status" className="font-sans text-body text-ink">Cảm ơn! Đánh giá của bạn đã được gửi.</p>}

            <button type="submit" disabled={isPending} className={`${btn.primary} self-start`}>
                {isPending ? "Đang gửi…" : "Gửi đánh giá"}
            </button>
        </form>
    );
}
