import "../../styles/PageButton.css";
function PageButton({ text, disabled }) {
    return (
        <button className="page-button-container-default"
            disabled={disabled}>
            {text}
        </button>
    )
}

export default PageButton;