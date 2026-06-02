import clsx from "clsx";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  className?: string;
}

/**
 * The shared surface primitive: the `.panel` border + radius + soft shadow.
 * Compose it with a layout class rather than re-typing the surface at each call.
 */
export function Card({ className, ...props }: CardProps) {
  return <section className={clsx("panel", className)} {...props} />;
}
