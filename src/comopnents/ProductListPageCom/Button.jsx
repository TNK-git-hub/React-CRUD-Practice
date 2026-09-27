import "../../styles/Button.css";
import { useState } from "react";

function Button({ text }) {
    return (
        <button className="button-container" >
            {text}
        </button>
    )
}

export default Button;
