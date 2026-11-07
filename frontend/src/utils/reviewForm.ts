export interface ReviewFormValues {
    rating: number | null;
    reviewerName: string;
    reviewerEmail: string;
    comment: string;
}

export type ReviewFormErrors = Partial<Record<keyof ReviewFormValues, string>>;

export const NAME_MAX = 100;
export const COMMENT_MAX = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateReview(values: ReviewFormValues): ReviewFormErrors {
    const errors: ReviewFormErrors = {};
    const name = values.reviewerName.trim();

    if (values.rating === null) errors.rating = 'Vui lòng chọn số sao';
    if (!name) errors.reviewerName = 'Vui lòng nhập tên';
    else if (name.length > NAME_MAX) errors.reviewerName = `Tên tối đa ${NAME_MAX} ký tự`;
    if (!EMAIL_RE.test(values.reviewerEmail.trim())) errors.reviewerEmail = 'Email không hợp lệ';
    if (values.comment.trim().length > COMMENT_MAX) errors.comment = `Nhận xét tối đa ${COMMENT_MAX} ký tự`;
    return errors;
}
