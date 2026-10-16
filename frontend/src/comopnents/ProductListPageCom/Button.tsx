import "../../styles/Button.css";
import { useState } from "react";

interface ButtonProps {
    text: string;
    type?: "button" | "submit" | "reset";
    onClick?: () => void;
}

function Button({ text, type = "button", onClick }: ButtonProps) {
    return (
        <button type={type} className="button-container" onClick={onClick}>
            {text}
        </button>
    )
}

export default Button;
