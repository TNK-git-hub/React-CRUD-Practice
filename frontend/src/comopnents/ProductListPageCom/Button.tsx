import { btn } from "../../utils/buttonStyles";

interface ButtonProps {
    text: string;
    type?: "button" | "submit" | "reset";
    onClick?: () => void;
    className?: string;
}

function Button({ text, type = "button", onClick, className }: ButtonProps) {
    return (
        <button type={type} className={className ? `${btn.primary} ${className}` : btn.primary} onClick={onClick}>
            {text}
        </button>
    )
}

export default Button;
