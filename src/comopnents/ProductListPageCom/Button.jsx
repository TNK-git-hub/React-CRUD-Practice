import "../../styles/Button.css";
import { useState } from "react";

function Button({ text, type = "button", onClick }) {
    return (
        <button type={type} className="button-container" onClick={onClick}>
            {text}
        </button>
    )
}

export default Button;
