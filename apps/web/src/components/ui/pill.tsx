import * as React from "react";

import { cn } from "@/lib/utils";
import { pill } from "@/lib/ui/recipes";

type Props = React.HTMLAttributes<HTMLSpanElement> & { active?: boolean };

export const Pill = React.forwardRef<HTMLSpanElement, Props>(
  ({ active, className, ...rest }, ref) => (
    <span ref={ref} className={cn(pill({ active }), className)} {...rest} />
  ),
);
Pill.displayName = "Pill";
