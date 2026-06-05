import type { ReactNode } from "react";
import styles from "./card.module.css";

interface CleanProps {
	children: ReactNode;
}

export function Clean({ children }: CleanProps): JSX.Element {
	return <section className={styles.card}>{children}</section>;
}
