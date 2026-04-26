import { useState } from "react";
import { useTheme } from "@/lib/theme";

/* ── UI Components ──────────────────────────────────────────── */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/* ── Brand Components ───────────────────────────────────────── */
import { Logo } from "@/components/brand/Logo";
import { MeshGradient } from "@/components/brand/MeshGradient";
import { NoiseTexture } from "@/components/brand/NoiseTexture";

/* ── Icons ──────────────────────────────────────────────────── */
import { Moon, Sun, Monitor, ChevronDown, Plus, Search, ArrowUpRight } from "lucide-react";

const colorSwatchClasses: Record<string, string> = {
  "--color-primary": "bg-[var(--color-primary)]",
  "--color-primary-foreground": "bg-[var(--color-primary-foreground)]",
  "--color-background": "bg-[var(--color-background)]",
  "--color-foreground": "bg-[var(--color-foreground)]",
  "--color-surface": "bg-[var(--color-surface)]",
  "--color-subtle": "bg-[var(--color-subtle)]",
  "--color-muted-foreground": "bg-[var(--color-muted-foreground)]",
  "--color-border": "bg-[var(--color-border)]",
  "--color-accent-wash": "bg-[var(--color-accent-wash)]",
  "--color-destructive": "bg-[var(--color-destructive)]",
  "--color-success": "bg-[var(--color-success)]",
  "--color-warning": "bg-[var(--color-warning)]",
  "--color-info": "bg-[var(--color-info)]",
  "--color-oj-ac": "bg-[var(--color-oj-ac)]",
  "--color-oj-wa": "bg-[var(--color-oj-wa)]",
  "--color-oj-tle": "bg-[var(--color-oj-tle)]",
  "--color-oj-mle": "bg-[var(--color-oj-mle)]",
  "--color-oj-re": "bg-[var(--color-oj-re)]",
  "--color-oj-ce": "bg-[var(--color-oj-ce)]",
};

const spacingSwatchClasses: Record<number, string> = {
  4: "h-1 w-1",
  8: "h-2 w-2",
  12: "h-3 w-3",
  16: "h-4 w-4",
  24: "h-6 w-6",
  32: "h-8 w-8",
  48: "h-12 w-12",
  64: "h-16 w-16",
};

const radiusSwatchClasses: Record<string, string> = {
  sm: "rounded-[--radius-sm]",
  md: "rounded-[--radius-md]",
  lg: "rounded-[--radius-lg]",
  xl: "rounded-[--radius-xl]",
  full: "rounded-full",
};

const shadowSwatchClasses: Record<string, string> = {
  "--shadow-sm": "shadow-[var(--shadow-sm)]",
  "--shadow-md": "shadow-[var(--shadow-md)]",
  "--shadow-lg": "shadow-[var(--shadow-lg)]",
};

/* ════════════════════════════════════════════════════════════════
   Editorial primitives — 专为样本册风格服务的排版部件
   ════════════════════════════════════════════════════════════════ */

/** 编号大号字 + 小标题的 Plate 版式 */
function Plate({
  no,
  eyebrow,
  title,
  lede,
  children,
}: {
  no: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`plate-${no}`}
      className="relative grid scroll-mt-8 gap-8 border-t border-border/70 pt-10 md:grid-cols-[minmax(0,220px)_1fr] md:gap-12 md:pt-14"
    >
      {/* Left rail: number + eyebrow + lede */}
      <header className="md:sticky md:top-6 md:self-start">
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
            aria-hidden
          >
            Plate
          </span>
          <span
            className="font-mono text-4xl font-light tabular-nums text-primary md:text-5xl"
          >
            {no}
          </span>
        </div>
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {eyebrow}
        </div>
        <h2
          className="font-display font-ss01-ss02 mt-2 text-[28px] font-light leading-[1.05] tracking-tight text-foreground md:text-[34px]"
        >
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 max-w-[22ch] text-sm leading-relaxed text-muted-foreground">
            {lede}
          </p>
        ) : null}
      </header>

      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** 展台底座：给任意组件加上「展品」标签 + 编号 */
function Exhibit({
  idx,
  label,
  caption,
  tone = "default",
  className,
  children,
}: {
  idx: string;
  label: string;
  caption?: string;
  tone?: "default" | "dim" | "quiet";
  className?: string;
  children: React.ReactNode;
}) {
  const toneBg =
    tone === "dim"
      ? "bg-subtle"
      : tone === "quiet"
      ? "bg-transparent"
      : "bg-card";
  return (
    <figure
      className={`group relative flex flex-col overflow-hidden rounded-[--radius-lg] border border-border/70 ${toneBg} ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/80">
          · {idx}
        </span>
      </div>
      <div className="flex flex-1 flex-col items-start justify-start p-5">{children}</div>
      {caption ? (
        <figcaption className="border-t border-border/60 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** 色票 —— 样本册风格：大号色块 + 名称 + HEX/token */
function Chip({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="group flex flex-col">
      <div
        className={`relative h-20 w-full overflow-hidden rounded-[--radius-md] border border-border/70 transition-transform duration-[--duration-normal] ease-[--ease-standard] group-hover:-translate-y-0.5 ${colorSwatchClasses[cssVar] ?? "bg-transparent"}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-black/5 mix-blend-overlay" />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{name}</span>
        <code className="font-mono truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {cssVar.replace("--color-", "")}
        </code>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Gallery
   ════════════════════════════════════════════════════════════════ */

export default function UIGallery() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [progress, setProgress] = useState(65);
  const [switchOn, setSwitchOn] = useState(true);
  const [checkboxOn, setCheckboxOn] = useState(true);

  const issueDate = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <TooltipProvider>
      {/* 负向 gutter — 让页面在 AppShell 内仍具备全幅仪式感 */}
      <div className="-mx-6 -my-6 md:-mx-10">
        {/* ═══ Atmospheric backdrop ═══════════════════════════════ */}
        <div
          aria-hidden
          className="ui-gallery-grid-backdrop pointer-events-none fixed inset-0 -z-10 opacity-[0.35]"
        />

        {/* ═══════════════════════════════════════════════════════
             COVER —— 封面
             ═══════════════════════════════════════════════════════ */}
        <section className="relative isolate overflow-hidden border-b border-border">
          <MeshGradient variant="hero" />
          <NoiseTexture />

          {/* running rule */}
          <div className="relative z-10 flex items-center justify-between px-6 md:px-10 pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            <span>Round·One · Specimen Sheet</span>
            <span className="hidden sm:inline">Vol. 01 / Issue 001</span>
            <span>{issueDate}</span>
          </div>

          <div className="relative z-10 grid gap-10 px-6 md:px-10 pb-16 pt-10 md:grid-cols-12 md:gap-6 md:pb-24 md:pt-16">
            {/* Left meta column */}
            <div className="md:col-span-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Edition
              </div>
              <div
                className="font-display mt-2 text-2xl font-light text-foreground"
              >
                No.<span className="tabular-nums"> 001</span>
              </div>

              <dl className="mt-8 space-y-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt>Theme</dt>
                  <dd className="text-foreground">{resolvedTheme}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt>Grid</dt>
                  <dd className="text-foreground">8pt</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt>Accent</dt>
                  <dd className="text-foreground">#E63946</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt>Serif</dt>
                  <dd className="text-foreground">Fraunces</dd>
                </div>
              </dl>
            </div>

            {/* Title column */}
            <div className="md:col-span-9">
              <div
                className="font-display flex flex-col items-start gap-2 text-foreground"
              >
                <h1 className="relative text-[clamp(64px,13vw,188px)] font-light leading-[0.82] tracking-[-0.04em]">
                  <span className="font-ss01 italic text-primary">
                    Specimen
                  </span>
                </h1>
                <h1 className="text-[clamp(56px,11vw,168px)] font-light leading-[0.82] tracking-[-0.04em]">
                  &amp; <span className="underline decoration-[0.04em] underline-offset-[0.12em] decoration-primary/80">Système</span>
                </h1>
              </div>

              <div className="mt-8 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
                <p
                  className="font-display text-base leading-relaxed text-foreground-secondary sm:text-lg"
                >
                  Round 1 设计系统视觉样本册 —— 一份关于色彩、字形、节奏与零件的完整陈列。
                  所有展品可被调用于产品实现，所有展品须经得起放大检验。
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant={theme === "light" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setTheme("light")}
                  >
                    <Sun className="mr-1 h-3.5 w-3.5" /> Light
                  </Button>
                  <Button
                    variant={theme === "dark" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setTheme("dark")}
                  >
                    <Moon className="mr-1 h-3.5 w-3.5" /> Dark
                  </Button>
                  <Button
                    variant={theme === "system" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setTheme("system")}
                  >
                    <Monitor className="mr-1 h-3.5 w-3.5" /> Sys
                  </Button>
                </div>
              </div>

              {/* Index */}
              <nav className="mt-12 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border/70 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ["01", "Palette"],
                  ["02", "Typography"],
                  ["03", "Brand"],
                  ["04", "Controls"],
                  ["05", "Form"],
                  ["06", "Signals"],
                  ["07", "Surfaces"],
                  ["08", "Overlay"],
                  ["09", "Data"],
                  ["10", "Rhythm"],
                ].map(([no, name]) => (
                  <a
                    key={no}
                    href={`#plate-${no}`}
                    className="group flex items-center justify-between gap-3 border-b border-transparent py-1 transition-colors hover:border-primary"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {no}
                      </span>
                      <span
                        className="font-display text-foreground"
                      >
                        {name}
                      </span>
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-primary" />
                  </a>
                ))}
              </nav>
            </div>
          </div>

          {/* Bottom rule */}
          <div className="relative z-10 flex items-center justify-between border-t border-border/70 px-6 md:px-10 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <span>↓ Continue · 向下翻阅</span>
            <span>Printed in 8pt Grid</span>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
             BODY —— 展品
             ═══════════════════════════════════════════════════════ */}
        <div className="mx-auto max-w-[1280px] space-y-4 px-6 md:px-10 pb-24 pt-4">
          {/* ── 01 Palette ───────────────────────────────────── */}
          <Plate
            no="01"
            eyebrow="Pigments · 颜料"
            title="Palette"
            lede="语义色令牌，承载产品所有信号与情绪层级。"
          >
            <div className="space-y-10">
              <div>
                <div className="mb-4 flex items-baseline justify-between border-b border-border/60 pb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Core tokens
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    13 entries
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  <Chip name="Primary" cssVar="--color-primary" />
                  <Chip name="Primary FG" cssVar="--color-primary-foreground" />
                  <Chip name="Background" cssVar="--color-background" />
                  <Chip name="Foreground" cssVar="--color-foreground" />
                  <Chip name="Surface" cssVar="--color-surface" />
                  <Chip name="Subtle" cssVar="--color-subtle" />
                  <Chip name="Muted FG" cssVar="--color-muted-foreground" />
                  <Chip name="Border" cssVar="--color-border" />
                  <Chip name="Accent Wash" cssVar="--color-accent-wash" />
                  <Chip name="Destructive" cssVar="--color-destructive" />
                  <Chip name="Success" cssVar="--color-success" />
                  <Chip name="Warning" cssVar="--color-warning" />
                  <Chip name="Info" cssVar="--color-info" />
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-baseline justify-between border-b border-border/60 pb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    OJ verdicts
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    6 entries
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-6">
                  <Chip name="AC" cssVar="--color-oj-ac" />
                  <Chip name="WA" cssVar="--color-oj-wa" />
                  <Chip name="TLE" cssVar="--color-oj-tle" />
                  <Chip name="MLE" cssVar="--color-oj-mle" />
                  <Chip name="RE" cssVar="--color-oj-re" />
                  <Chip name="CE" cssVar="--color-oj-ce" />
                </div>
              </div>
            </div>
          </Plate>

          {/* ── 02 Typography ────────────────────────────────── */}
          <Plate
            no="02"
            eyebrow="Letterforms · 字形"
            title="Typography"
            lede="衬线显示体与无衬线正文的对位，兼顾中英双轨。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit
                idx="A"
                label="Display · Fraunces"
                caption="var(--font-serif) · 用于海报级标题、仪式页、大号数字"
                className="md:col-span-12"
              >
                <div
                  className="font-display w-full leading-[0.9] tracking-[-0.02em] text-foreground"
                >
                  <div className="text-[clamp(56px,9vw,128px)] font-light">
                    Aa — <span className="italic text-primary">编程</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Abcdefghijklmnopqrstuvwxyz &middot; 0123456789
                  </div>
                </div>
              </Exhibit>

              <Exhibit
                idx="B"
                label="Body · Geist / HarmonyOS"
                caption="var(--font-sans)"
                className="md:col-span-8"
              >
                <p
                  className="font-sans text-xl leading-relaxed text-foreground"
                >
                  快速的棕色狐狸跳过了懒狗 —— The quick brown fox jumps over the
                  lazy dog. 这段落用于验证中英排印的视觉密度与基线对齐。
                </p>
              </Exhibit>

              <Exhibit
                idx="C"
                label="Mono · Geist Mono"
                caption="var(--font-mono)"
                className="md:col-span-4"
              >
                <pre
                  className="font-mono w-full whitespace-pre-wrap text-[13px] leading-relaxed text-foreground"
                >
{`const x = 42;
const π = 3.14159;
if (x > 0) ac();`}
                </pre>
              </Exhibit>

              <Exhibit
                idx="D"
                label="Serif CN · Source Han Serif"
                caption="var(--font-serif) · 中文衬线加重"
                className="md:col-span-12"
              >
                <p
                  className="font-display text-3xl font-black leading-snug tracking-normal text-foreground md:text-4xl"
                >
                  算法竞赛测试平台
                </p>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 03 Brand ─────────────────────────────────────── */}
          <Plate
            no="03"
            eyebrow="Identity · 标识"
            title="Brand Marks"
            lede="Logo 尺寸、组合变体，以及品牌氛围背景。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="Logo scale" className="md:col-span-6">
                <div className="flex w-full flex-wrap items-end gap-8">
                  <Logo size="sm" />
                  <Logo size="md" />
                  <Logo size="lg" />
                </div>
              </Exhibit>
              <Exhibit idx="B" label="Logo mark" className="md:col-span-6" tone="dim">
                <div className="flex w-full items-center justify-center py-6">
                  <Logo size="lg" variant="mark" />
                </div>
              </Exhibit>
              <Exhibit
                idx="C"
                label="Atmosphere · mesh + noise"
                caption="MeshGradient variant='hero' + NoiseTexture"
                className="md:col-span-12"
                tone="quiet"
              >
                <div className="relative h-56 w-full overflow-hidden rounded-[--radius-lg] border border-border/60">
                  <MeshGradient variant="hero" />
                  <NoiseTexture />
                  <div className="relative z-10 flex h-full flex-col justify-between p-6">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Backdrop
                    </span>
                    <span
                      className="font-display text-3xl font-light italic text-foreground md:text-4xl"
                    >
                      Ambient, never loud.
                    </span>
                  </div>
                </div>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 04 Controls ──────────────────────────────────── */}
          <Plate
            no="04"
            eyebrow="Actuators · 按键"
            title="Controls"
            lede="触发操作的五种声调 —— 主、副、鬼、毁、链。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="Variants" className="md:col-span-7">
                <div className="flex flex-wrap items-center gap-3">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="link">Link</Button>
                </div>
              </Exhibit>
              <Exhibit idx="B" label="Sizes" className="md:col-span-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Small</Button>
                  <Button size="md">Default</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon"><Plus className="h-4 w-4" /></Button>
                </div>
              </Exhibit>
              <Exhibit idx="C" label="States" className="md:col-span-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Button loading>Loading…</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </Exhibit>
              <Exhibit idx="D" label="Dropdown" className="md:col-span-6">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary">
                      更多操作 <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>操作</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Search className="mr-2 h-4 w-4" /> 搜索
                    </DropdownMenuItem>
                    <DropdownMenuItem>编辑</DropdownMenuItem>
                    <DropdownMenuItem>复制</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">删除</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 05 Form ──────────────────────────────────────── */}
          <Plate
            no="05"
            eyebrow="Intake · 表单"
            title="Form Inputs"
            lede="接收意图、口令与选择的一切字段部件。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="Text" className="md:col-span-6">
                <div className="w-full space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="demo-input">用户名</Label>
                    <Input id="demo-input" placeholder="请输入用户名" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-input-err" error>邮箱（错误态）</Label>
                    <Input id="demo-input-err" placeholder="email@example.com" error />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-textarea">备注</Label>
                    <Textarea id="demo-textarea" placeholder="请输入备注信息..." />
                  </div>
                </div>
              </Exhibit>
              <Exhibit idx="B" label="Pickers" className="md:col-span-6">
                <div className="w-full space-y-4">
                  <div className="space-y-2">
                    <Label>下拉选择</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="选择考试类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csp-j">CSP-J</SelectItem>
                        <SelectItem value="csp-s">CSP-S</SelectItem>
                        <SelectItem value="noip">NOIP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
                      <Label>开关 {switchOn ? "ON" : "OFF"}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={checkboxOn}
                        onCheckedChange={(v) => setCheckboxOn(v === true)}
                      />
                      <Label>复选框</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>语言</Label>
                    <RadioGroup defaultValue="cpp">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="cpp" id="r-cpp" />
                        <Label htmlFor="r-cpp">C++</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="python" id="r-python" />
                        <Label htmlFor="r-python">Python</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 06 Signals ───────────────────────────────────── */}
          <Plate
            no="06"
            eyebrow="Signals · 标签"
            title="Badges"
            lede="状态徽章 —— 用极小面积传递结构化信号。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="Core" className="md:col-span-6">
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                </div>
              </Exhibit>
              <Exhibit idx="B" label="OJ verdicts" className="md:col-span-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="ac">AC</Badge>
                  <Badge variant="wa">WA</Badge>
                  <Badge variant="tle">TLE</Badge>
                  <Badge variant="mle">MLE</Badge>
                  <Badge variant="re">RE</Badge>
                  <Badge variant="unanswered">未作答</Badge>
                  <Badge variant="saved">已保存</Badge>
                </div>
              </Exhibit>
              <Exhibit idx="C" label="Exam type" className="md:col-span-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="csp-j">CSP-J</Badge>
                  <Badge variant="csp-s">CSP-S</Badge>
                  <Badge variant="gesp-low">GESP 低段</Badge>
                  <Badge variant="gesp-high">GESP 高段</Badge>
                </div>
              </Exhibit>
              <Exhibit idx="D" label="Difficulty" className="md:col-span-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="diff-easy">入门</Badge>
                  <Badge variant="diff-normal">提高</Badge>
                  <Badge variant="diff-hard">困难</Badge>
                </div>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 07 Surfaces ──────────────────────────────────── */}
          <Plate
            no="07"
            eyebrow="Surfaces · 卡面"
            title="Cards"
            lede="不同层级与目的的卡片样式 —— 信息的容器。"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>默认卡片</CardTitle>
                  <CardDescription>基础卡片样式</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">卡片内容区域</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm">操作</Button>
                </CardFooter>
              </Card>
              <Card variant="flat">
                <CardHeader>
                  <CardTitle>Flat 卡片</CardTitle>
                  <CardDescription>无阴影、微边框</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">适用于嵌套场景</p>
                </CardContent>
              </Card>
              <Card variant="interactive">
                <CardHeader>
                  <CardTitle>Interactive</CardTitle>
                  <CardDescription>hover 抬升 + 阴影</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">试试 hover 效果</p>
                </CardContent>
              </Card>
              <Card variant="stat">
                <CardHeader>
                  <CardTitle
                    className="font-display text-4xl font-light tabular-nums"
                  >
                    92.5<span className="text-primary">%</span>
                  </CardTitle>
                  <CardDescription>正确率</CardDescription>
                </CardHeader>
              </Card>
              <Card variant="hero" className="sm:col-span-2">
                <CardHeader>
                  <CardTitle className="text-xl">Hero 卡片</CardTitle>
                  <CardDescription>accent-wash 背景 + primary border</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    适用于高优先级信息展示和 CTA 区域
                  </p>
                </CardContent>
              </Card>
            </div>
          </Plate>

          {/* ── 08 Overlay ───────────────────────────────────── */}
          <Plate
            no="08"
            eyebrow="Layers · 叠层"
            title="Overlay & Tabs"
            lede="对话框、提示气泡与切换条 —— 临时浮起的界面层。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="Dialog" className="md:col-span-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>打开对话框</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>确认操作</DialogTitle>
                      <DialogDescription>
                        此操作无法撤销，确定要继续吗？
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="secondary">取消</Button>
                      <Button>确认</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </Exhibit>

              <Exhibit idx="B" label="Tooltip" className="md:col-span-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary">Hover me</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>这是一个提示信息</p>
                  </TooltipContent>
                </Tooltip>
              </Exhibit>

              <Exhibit idx="C" label="Avatar" className="md:col-span-4">
                <div className="flex items-end gap-3">
                  <Avatar size="sm"><AvatarFallback>张</AvatarFallback></Avatar>
                  <Avatar size="md"><AvatarFallback>李</AvatarFallback></Avatar>
                  <Avatar size="lg"><AvatarFallback>王</AvatarFallback></Avatar>
                  <Avatar size="xl"><AvatarFallback>教</AvatarFallback></Avatar>
                </div>
              </Exhibit>

              <Exhibit idx="D" label="Tabs" className="md:col-span-12">
                <Tabs defaultValue="tab1" className="w-full">
                  <TabsList>
                    <TabsTrigger value="tab1">题目详情</TabsTrigger>
                    <TabsTrigger value="tab2">提交记录</TabsTrigger>
                    <TabsTrigger value="tab3">题解</TabsTrigger>
                  </TabsList>
                  <TabsContent value="tab1" className="mt-3 rounded-[--radius-md] border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">题目描述内容区域</p>
                  </TabsContent>
                  <TabsContent value="tab2" className="mt-3 rounded-[--radius-md] border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">提交历史列表</p>
                  </TabsContent>
                  <TabsContent value="tab3" className="mt-3 rounded-[--radius-md] border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">官方题解与讨论</p>
                  </TabsContent>
                </Tabs>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 09 Data ──────────────────────────────────────── */}
          <Plate
            no="09"
            eyebrow="Data · 数据"
            title="Progress · Table · List"
            lede="进度、表格、骨架与滚动区 —— 量化世界的呈现方式。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="Progress" className="md:col-span-6">
                <div className="w-full space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">默认</span>
                      <span className="tabular-nums text-foreground">{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Thin</span>
                      <span className="tabular-nums text-foreground">{progress}%</span>
                    </div>
                    <Progress value={progress} variant="thin" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">考试计时</span>
                      <span className="tabular-nums text-foreground">{progress}%</span>
                    </div>
                    <Progress value={progress} variant="exam" />
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setProgress((p) => (p >= 100 ? 0 : p + 10))}>
                    +10%
                  </Button>
                </div>
              </Exhibit>

              <Exhibit idx="B" label="Skeleton" className="md:col-span-6">
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-24 w-full" />
                </div>
              </Exhibit>

              <Exhibit idx="C" label="Table" className="md:col-span-8">
                <div className="w-full overflow-hidden rounded-[--radius-md] border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>题目名称</TableHead>
                        <TableHead>难度</TableHead>
                        <TableHead className="text-right">通过率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { id: 1001, name: "A+B Problem", diff: "入门", rate: "98.2%" },
                        { id: 1002, name: "背包问题", diff: "提高", rate: "67.5%" },
                        { id: 1003, name: "线段树模板", diff: "困难", rate: "34.1%" },
                      ].map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="tabular-nums">{q.id}</TableCell>
                          <TableCell className="font-medium">{q.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                q.diff === "入门" ? "diff-easy" : q.diff === "提高" ? "diff-normal" : "diff-hard"
                              }
                            >
                              {q.diff}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{q.rate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Exhibit>

              <Exhibit idx="D" label="Scroll area" className="md:col-span-4">
                <ScrollArea className="h-56 w-full rounded-[--radius-md] border border-border/70">
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 20 }, (_, i) => (
                      <div key={i} className="rounded-[--radius-sm] bg-subtle p-2.5 text-sm">
                        条目 #{String(i + 1).padStart(2, "0")}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </Exhibit>
            </div>
          </Plate>

          {/* ── 10 Rhythm ────────────────────────────────────── */}
          <Plate
            no="10"
            eyebrow="Rhythm · 节奏"
            title="Spacing · Radius · Shadow"
            lede="支撑所有布局的几何根基。"
          >
            <div className="grid gap-4 md:grid-cols-12">
              <Exhibit idx="A" label="8pt spacing grid" className="md:col-span-6">
                <div className="flex w-full items-end gap-3">
                  {[4, 8, 12, 16, 24, 32, 48, 64].map((px) => (
                    <div key={px} className="flex flex-col items-center gap-1.5">
                      <div
                        className={`bg-primary ${spacingSwatchClasses[px] ?? "h-4 w-4"}`}
                      />
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {px}
                      </span>
                    </div>
                  ))}
                </div>
              </Exhibit>

              <Exhibit idx="B" label="Border radius" className="md:col-span-6">
                <div className="flex w-full items-center gap-4">
                  {[
                    { name: "sm", cssVar: "--radius-sm" },
                    { name: "md", cssVar: "--radius-md" },
                    { name: "lg", cssVar: "--radius-lg" },
                    { name: "xl", cssVar: "--radius-xl" },
                    { name: "full", cssVar: "--radius-full" },
                  ].map((r) => (
                    <div key={r.name} className="flex flex-col items-center gap-1.5">
                      <div
                        className={`h-14 w-14 border-2 border-primary bg-accent-wash ${radiusSwatchClasses[r.name] ?? "rounded-[--radius-md]"}`}
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.name}
                      </span>
                    </div>
                  ))}
                </div>
              </Exhibit>

              <Exhibit idx="C" label="Shadow elevation" className="md:col-span-12" tone="dim">
                <div className="flex w-full items-center justify-around gap-6 py-6">
                  {["--shadow-sm", "--shadow-md", "--shadow-lg"].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-3">
                      <div
                        className={`h-24 w-24 rounded-[--radius-lg] bg-surface ${shadowSwatchClasses[s] ?? ""}`}
                      />
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {s.replace("--shadow-", "")}
                      </span>
                    </div>
                  ))}
                </div>
              </Exhibit>
            </div>
          </Plate>

          {/* ═══ Colophon · 版权尾页 ═══════════════════════════ */}
          <footer className="mt-16 border-t border-border/70 pt-8">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Colophon
                </div>
                <p
                  className="font-display mt-3 text-xl font-light leading-snug text-foreground"
                >
                  Set in Fraunces &amp; Geist, printed on an 8pt grid.
                </p>
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <div className="border-b border-border/60 pb-2">—— End of specimen</div>
                <div className="pt-2">© Round 1 · {new Date().getFullYear()}</div>
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground md:text-right">
                <div>Crafted with care</div>
                <div className="mt-1 text-primary">#E63946</div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
