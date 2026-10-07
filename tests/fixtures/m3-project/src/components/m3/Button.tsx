import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "filled" | "tonal" | "outlined";
	icon?: ReactNode;
}

export function Button({ variant = "filled", icon, children, ...rest }: ButtonProps) {
	return (
		<button className={`m3-button m3-button--${variant}`} {...rest}>
			{icon}
			{children}
		</button>
	);
}
