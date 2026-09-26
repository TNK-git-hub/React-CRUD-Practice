import "../styles/Button.css"
function Button({ text }) {
    return (
        <button className="button-container">
            {text}
        </button>
    )
}

export default Button;
