import * as React from "react";

import { PUBLIC_FIELD_SURFACE_CLASS } from "@/lib/ui-effects";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          `${PUBLIC_FIELD_SURFACE_CLASS} text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm`,
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
