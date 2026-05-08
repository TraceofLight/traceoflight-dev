import * as React from "react";

import { cn } from "@/lib/utils";
import { surface } from "@/lib/ui/recipes";
import type { SurfaceProps as RecipeProps } from "@/lib/ui/recipes";

type Props = React.HTMLAttributes<HTMLDivElement> & RecipeProps;

export const Surface = React.forwardRef<HTMLDivElement, Props>(
  ({ kind, tone, interactive, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(surface({ kind, tone, interactive }), className)}
      {...rest}
    />
  ),
);
Surface.displayName = "Surface";
