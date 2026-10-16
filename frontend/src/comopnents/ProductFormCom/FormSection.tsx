import type { ReactNode } from "react";
import "../../styles/ProductFormStyle/FormSection.css";

interface FormSectionProps {
    title: string;
    meta?: string;
    variant?: string; // vd "danger"
    children: ReactNode;
}

function FormSection({ title, meta, variant, children }: FormSectionProps) {
    return (
        <section className={variant ? `form-section ${variant}` : 'form-section'}>
            <div className="form-section-head">
                <h2>{title}</h2>
                {meta && <span className="form-section-meta">{meta}</span>}
            </div>
            {children}
        </section>
    )
}

export default FormSection;
