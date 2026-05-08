import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { action } from "@/lib/ui/recipes";

// Maps legacy shadcn variant names → recipe variant names.
const VARIANT_MAP = {
  default: "primary",
  destructive: "danger",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  link: "link",
} as const;

// Maps legacy shadcn size names → recipe size names.
const SIZE_MAP = {
  default: "md",
  sm: "sm",
  lg: "lg",
  icon: "icon",
} as const;

type LegacyVariant = keyof typeof VARIANT_MAP;
type LegacySize = keyof typeof SIZE_MAP;

// buttonVariants shim: maintains the same call interface as the old shadcn cva export.
// alert-dialog.tsx calls buttonVariants() and buttonVariants({ variant: "outline" })
// to get real class strings for composition — so we forward to action() here.
export function buttonVariants(opts?: {
  variant?: LegacyVariant | null;
  size?: LegacySize | null;
  className?: string | null;
}): string {
  const recipeVariant = VARIANT_MAP[(opts?.variant ?? "default") as LegacyVariant] ?? "primary";
  const recipeSize = SIZE_MAP[(opts?.size ?? "default") as LegacySize] ?? "md";
  return cn(action({ variant: recipeVariant, size: recipeSize }), opts?.className ?? undefined);
}

// VariantProps shim — kept so callers that spread VariantProps<typeof buttonVariants>
// still compile. The function type satisfies the interface with explicit types below.
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LegacyVariant | null;
  size?: LegacySize | null;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const recipeVariant = VARIANT_MAP[(variant ?? "default") as LegacyVariant] ?? "primary";
    const recipeSize = SIZE_MAP[(size ?? "default") as LegacySize] ?? "md";
    return (
      <Comp
        className={cn(action({ variant: recipeVariant, size: recipeSize }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
