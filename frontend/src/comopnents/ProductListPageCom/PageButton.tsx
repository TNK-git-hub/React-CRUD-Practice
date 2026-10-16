import type { ReactNode } from "react";
import "../../styles/PageButton.css";

interface PageButtonProps {
    children: ReactNode;
    disabled?: boolean;
    onClick: () => void;
    className?: string;
}

function PageButton({ children, disabled, onClick, className }: PageButtonProps) {
    return (
        <button className={"page-button-container-default" + " " + className}
            disabled={disabled}
            onClick={onClick}>
            {children}
        </button>
    )
}

export default PageButton;