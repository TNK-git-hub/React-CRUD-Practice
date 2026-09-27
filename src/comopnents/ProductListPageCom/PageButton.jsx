import "../../styles/PageButton.css";
function PageButton({ text, disabled, onClick, className }) {
    return (
        <button className={"page-button-container-default" + " " + className}
            disabled={disabled}
            onClick={onClick}>
            {text}
        </button>
    )
}

export default PageButton;