import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { Moon, Sun, Monitor } from "lucide-react";

export function TopBar() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const next = { light: "dark", dark: "system", system: "light" } as const;
    setTheme(next[theme]);
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="flex h-[--topbar-height] shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-8">
      <Logo size="sm" />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={cycleTheme} aria-label="切换主题">
          <ThemeIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
