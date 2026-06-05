import type { ReactNode } from "react";

interface BannerProps {
	children: ReactNode;
}

export function Banner({ children }: BannerProps): JSX.Element {
	return (
		<div style={{ color: "#3b82f6", padding: 17 }}>
			<strong>{children}</strong>
		</div>
	);
}
