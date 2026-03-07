import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavItem = {
  href: string;
  label: string;
};

type MobileNavSheetProps = {
  items: NavItem[];
  isAdminViewer: boolean;
};

export default function MobileNavSheet({
  items,
  isAdminViewer,
}: MobileNavSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button aria-label="Open navigation" size="icon" variant="outline">
          <MenuIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px]">
        <SheetHeader>
          <SheetTitle>Navigate</SheetTitle>
          <SheetDescription>Move across the public site.</SheetDescription>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-2" aria-label="Mobile navigation">
          {items.map((item) => (
            <a
              key={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
          {isAdminViewer ? (
            <form action="/internal-api/auth/logout?next=/" className="pt-3" method="POST">
              <Button className="w-full justify-center" type="submit" variant="outline">
                Logout
              </Button>
            </form>
          ) : null}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
