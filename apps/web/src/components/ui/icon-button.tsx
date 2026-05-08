import * as React from "react";

import { cn } from "@/lib/utils";
import { action } from "@/lib/ui/recipes";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "surface"
  | "danger"
  | "primaryOutline"
  | "dangerOutline";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export const IconButton = React.forwardRef<HTMLButtonElement, Props>(
  ({ variant = "surface", className, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(action({ variant, size: "icon" }), className)}
      {...rest}
    />
  ),
);
IconButton.displayName = "IconButton";
