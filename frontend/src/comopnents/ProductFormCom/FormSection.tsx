import type { ReactNode } from "react";

interface FormSectionProps {
    title: string;
    meta?: string;
    variant?: string; // vd "danger"
    children: ReactNode;
}

function FormSection({ title, meta, variant, children }: FormSectionProps) {
    return (
        <section className={`flex flex-col gap-[13px] rounded-card border bg-surface px-5 py-[18px] ${variant === 'danger' ? 'border-danger' : 'border-line'}`}>
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[19px]">{title}</h2> {/* h2 global là 24px, design dùng 19px */}
                {meta && <span className="text-[11px]">{meta}</span>}
            </div>
            {children}
        </section>
    )
}

export default FormSection;
