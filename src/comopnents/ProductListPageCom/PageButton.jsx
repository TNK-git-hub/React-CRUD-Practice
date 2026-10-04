import "../../styles/PageButton.css";
function PageButton({ children, disabled, onClick, className }) {
    return (
        <button className={"page-button-container-default" + " " + className}
            disabled={disabled}
            onClick={onClick}>
            {children}
        </button>
    )
}

export default PageButton;