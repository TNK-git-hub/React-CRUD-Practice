import type { ReactNode } from "react";

interface FormFieldProps {
    label: string;
    htmlFor: string;
    required?: boolean;
    hint?: string;
    error?: string;
    children: ReactNode;
}

function FormField({ label, htmlFor, required = false, hint, error, children }: FormFieldProps) {
    return (
        <div>
            <label htmlFor={htmlFor} className="mb-1.5 block font-sans text-[11.5px] font-semibold text-ink">
                {label}
                {required && <span className="text-danger"> *</span>}
                {hint && <span className="font-normal"> · {hint}</span>}
            </label>
            {children}
            {error && <p className="mt-[5px] text-[11.5px] font-medium text-danger" id={`${htmlFor}-error`}>{error}</p>}
        </div>
    )
}

export default FormField;
