import type { ReactNode } from "react";
import "../../styles/ProductFormStyle/FormField.css";

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
        <div className="form-field">
            <label htmlFor={htmlFor} className="form-label">
                {label}
                {required && <span className="form-required"> *</span>}
                {hint && <span className="form-hint"> · {hint}</span>}
            </label>
            {children}
            {error && <p className="form-error" id={`${htmlFor}-error`}>{error}</p>}
        </div>
    )
}

export default FormField;
