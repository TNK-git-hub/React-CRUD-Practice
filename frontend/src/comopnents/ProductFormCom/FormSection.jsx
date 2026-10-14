import "../../styles/ProductFormStyle/FormSection.css";

function FormSection({ title, meta, variant, children }) {
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
