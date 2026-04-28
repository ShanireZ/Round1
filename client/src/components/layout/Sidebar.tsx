import { NavLink } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminNavItems, coachNavItems, primaryNavItems, type NavItem } from "@/lib/navigation";

const devItems: NavItem[] = [
  { to: "/dev/ui-gallery", label: "UI Gallery", icon: Palette },
];

function SidebarSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      <span className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {items.map((item) => (
        <SidebarNavItem key={item.to} item={item} />
      ))}
    </nav>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-[--radius-md] border-l-2 px-3 py-2 text-sm font-medium transition-colors duration-[--duration-fast]",
          isActive
            ? "border-primary bg-accent-wash text-primary"
            : "border-transparent text-muted-foreground hover:bg-subtle hover:text-foreground",
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[--sidebar-width] shrink-0 border-r border-border bg-surface md:block">
      <ScrollArea className="h-full py-4">
        <div className="space-y-6">
          <SidebarSection title="主导航" items={primaryNavItems} />
          <SidebarSection title="教练" items={coachNavItems} />
          <SidebarSection title="Admin" items={adminNavItems} />
        </div>
        {import.meta.env.DEV && (
          <nav className="mt-6 flex flex-col gap-1 border-t border-border px-3 pt-4">
            <span className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dev
            </span>
            {devItems.map((item) => (
              <SidebarNavItem key={item.to} item={item} />
            ))}
          </nav>
        )}
      </ScrollArea>
    </aside>
  );
}
