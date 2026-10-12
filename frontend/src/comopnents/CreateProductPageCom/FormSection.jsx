import "../../styles/CreateProductElementStyle/FormSection.css";

function FormSection({ title, meta, children }) {
    return (
        <section className="form-section">
            <div className="form-section-head">
                <h2>{title}</h2>
                {meta && <span className="form-section-meta">{meta}</span>}
            </div>
            {children}
        </section>
    )
}

export default FormSection;
