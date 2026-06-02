"use client";

import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", icon, className, children, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx("btn", variant === "primary" ? "btn-primary" : "btn-ghost", className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});
