import "../../styles/CreateProductElementStyle/FormField.css";

function FormField({ label, htmlFor, required = false, hint, children }) {
    return (
        <div className="form-field">
            <label htmlFor={htmlFor} className="form-label">
                {label}
                {required && <span className="form-required"> *</span>}
                {hint && <span className="form-hint"> · {hint}</span>}
            </label>
            {children}
        </div>
    )
}

export default FormField;
