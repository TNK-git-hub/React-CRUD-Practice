import "../../styles/PageButton.css";
function PageButton({ text, disabled, onClick }) {
    return (
        <button className="page-button-container-default"
            disabled={disabled}
            onClick={onClick}>
            {text}
        </button>
    )
}

export default PageButton;