import { btn } from "../../utils/buttonStyles";

interface ButtonProps {
    text: string;
    type?: "button" | "submit" | "reset";
    onClick?: () => void;
}

function Button({ text, type = "button", onClick }: ButtonProps) {
    return (
        <button type={type} className={btn.primary} onClick={onClick}>
            {text}
        </button>
    )
}

export default Button;
