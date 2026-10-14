import "../../styles/ProductFormStyle/FormField.css";

function FormField({ label, htmlFor, required = false, hint, error, children }) {
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
