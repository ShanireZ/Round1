import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchAdminSettings,
  stringifyJson,
  type AdminSettingItem,
  type AdminSettingUpdateResult,
  updateAdminSetting,
} from "@/lib/admin-content";

const EMPTY_SETTINGS: AdminSettingItem[] = [];
const CATEGORY_ORDER = ["exam", "paper", "import", "custom"] as const;

const CATEGORY_COPY: Record<string, { label: string; description: string }> = {
  exam: {
    label: "考试与频控",
    description: "答题保存、草稿保留和请求频控。",
  },
  paper: {
    label: "选卷",
    description: "预制卷选择与最近试卷排除策略。",
  },
  import: {
    label: "导入",
    description: "题库导入与 bundle 校验限制。",
  },
  custom: {
    label: "自定义",
    description: "数据库中保留的兼容配置。",
  },
};

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseJsonValue(raw: string) {
  if (raw.trim().length === 0) {
    throw new Error("配置值不能为空");
  }

  return JSON.parse(raw) as unknown;
}

function getCategoryMeta(category: string) {
  return (
    CATEGORY_COPY[category] ?? {
      label: category,
      description: "运行时配置分组。",
    }
  );
}

function getSettingCategories(settings: AdminSettingItem[]) {
  const available = new Set(settings.map((setting) => setting.category));
  const ordered = CATEGORY_ORDER.filter((category) => available.has(category));
  const remaining = [...available]
    .filter((category) => !CATEGORY_ORDER.includes(category as (typeof CATEGORY_ORDER)[number]))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));

  return [...ordered, ...remaining];
}

function getValueTypeLabel(valueType: AdminSettingItem["valueType"]) {
  if (valueType === "number") return "数字";
  if (valueType === "boolean") return "布尔";
  if (valueType === "string") return "文本";
  return "JSON";
}

function getHotUpdateLabel(update: AdminSettingUpdateResult | null) {
  if (!update) {
    return null;
  }

  if (update.configChange?.published) {
    return "通知已发布";
  }

  if (update.configChange) {
    return "需刷新进程";
  }

  return "已保存";
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [valueDraft, setValueDraft] = useState("null");
  const [lastUpdate, setLastUpdate] = useState<AdminSettingUpdateResult | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"] as const,
    queryFn: fetchAdminSettings,
  });

  const settings = settingsQuery.data?.items ?? EMPTY_SETTINGS;
  const categories = useMemo(() => getSettingCategories(settings), [settings]);
  const activeItems = useMemo(
    () => settings.filter((setting) => setting.category === activeCategory),
    [activeCategory, settings],
  );
  const selectedSetting = useMemo(
    () => settings.find((item) => item.key === selectedKey) ?? null,
    [settings, selectedKey],
  );

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }

    const firstCategory = categories[0];
    if (firstCategory && (!activeCategory || !categories.includes(activeCategory))) {
      setActiveCategory(firstCategory);
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    if (activeItems.length === 0) {
      if (selectedKey) {
        setSelectedKey(null);
      }
      return;
    }

    const firstSetting = activeItems[0];
    if (firstSetting && (!selectedKey || !activeItems.some((item) => item.key === selectedKey))) {
      setSelectedKey(firstSetting.key);
    }
  }, [activeItems, selectedKey]);

  useEffect(() => {
    if (selectedSetting) {
      setValueDraft(stringifyJson(selectedSetting.valueJson));
    }
  }, [selectedSetting]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSetting) {
        throw new Error("请选择要保存的设置项");
      }

      const parsed = parseJsonValue(valueDraft);
      return updateAdminSetting(selectedSetting.key, parsed);
    },
    onSuccess: (updated) => {
      setLastUpdate(updated);
      setSelectedKey(updated.key);
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });

      const published = updated.configChange?.published === true;
      toast.success(published ? "系统设置已保存，热更新通知已发出" : "系统设置已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "系统设置保存失败");
    },
  });

  const countLabel = `${settings.length}`;
  const activeMeta = getCategoryMeta(activeCategory);
  const hotUpdateLabel = getHotUpdateLabel(lastUpdate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">系统设置</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            维护可热更新的运行时配置。变更会进入最近强认证、审计记录和配置通知流程。
          </p>
        </div>
        <Card variant="stat" className="min-w-36">
          <CardHeader className="pb-2">
            <CardDescription>设置项</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{countLabel}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card variant="flat" className="min-w-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCcw className="text-primary h-4 w-4" />
                系统设置项
              </CardTitle>
              <CardDescription>按运行影响分组展示默认配置与数据库覆盖值。</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void settingsQuery.refetch()}>
              刷新
            </Button>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
                正在加载系统设置...
              </div>
            ) : settingsQuery.isError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "系统设置加载失败"}
              </div>
            ) : settings.length > 0 ? (
              <Tabs
                value={activeCategory}
                onValueChange={(value) => {
                  setActiveCategory(value);
                  setSelectedKey(
                    settings.find((setting) => setting.category === value)?.key ?? null,
                  );
                }}
              >
                <TabsList className="w-full overflow-x-auto">
                  {categories.map((category) => {
                    const meta = getCategoryMeta(category);
                    const count = settings.filter(
                      (setting) => setting.category === category,
                    ).length;
                    return (
                      <TabsTrigger key={category} value={category} className="gap-2">
                        {meta.label}
                        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {categories.map((category) => {
                  const meta = getCategoryMeta(category);
                  const rows = settings.filter((setting) => setting.category === category);

                  return (
                    <TabsContent key={category} value={category} className="space-y-3">
                      <div className="border-border bg-subtle/10 rounded-[var(--radius-md)] border p-3">
                        <div className="text-foreground text-sm font-semibold">{meta.label}</div>
                        <div className="text-muted-foreground mt-1 text-sm">{meta.description}</div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>设置项</TableHead>
                            <TableHead>类型</TableHead>
                            <TableHead>当前值</TableHead>
                            <TableHead>更新时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((setting) => (
                            <TableRow
                              key={setting.key}
                              tabIndex={0}
                              className={
                                selectedKey === setting.key
                                  ? "bg-subtle/30"
                                  : "focus-visible:bg-subtle/20 cursor-pointer"
                              }
                              onClick={() => setSelectedKey(setting.key)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedKey(setting.key);
                                }
                              }}
                            >
                              <TableCell>
                                <div className="text-foreground font-medium">{setting.label}</div>
                                <div className="text-muted-foreground mt-1 font-mono text-xs">
                                  {setting.key}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {getValueTypeLabel(setting.valueType)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground max-w-[260px] truncate font-mono text-xs">
                                {stringifyJson(setting.valueJson)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {setting.isDefault
                                  ? "代码默认值"
                                  : formatTimestamp(setting.updatedAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TabsContent>
                  );
                })}
              </Tabs>
            ) : (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                暂无系统设置。
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="flat" className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">编辑设置</CardTitle>
            <CardDescription>{activeMeta.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSetting ? (
              <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3 text-sm">
                <div className="text-foreground font-semibold">{selectedSetting.label}</div>
                <div className="text-muted-foreground mt-1">{selectedSetting.description}</div>
              </div>
            ) : (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-3 text-sm">
                请选择一个设置项。
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <div className="space-y-2">
                <Label htmlFor="setting-key">设置键</Label>
                <Input
                  id="setting-key"
                  value={selectedSetting?.key ?? ""}
                  readOnly
                  placeholder="exam.autosaveIntervalSeconds"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setting-type">类型</Label>
                <Input
                  id="setting-type"
                  value={selectedSetting ? getValueTypeLabel(selectedSetting.valueType) : ""}
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setting-value">配置值 JSON</Label>
              <Textarea
                id="setting-value"
                className="min-h-64 font-mono text-xs"
                value={valueDraft}
                onChange={(event) => setValueDraft(event.target.value)}
                disabled={!selectedSetting}
              />
            </div>

            {selectedSetting ? (
              <div className="border-border bg-subtle/10 grid gap-3 rounded-[var(--radius-md)] border p-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground text-xs">来源</div>
                  <div className="text-foreground mt-1 font-medium">
                    {selectedSetting.isDefault ? "代码默认值" : "数据库覆盖"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">更新时间</div>
                  <div className="text-foreground mt-1 font-medium">
                    {selectedSetting.isDefault ? "-" : formatTimestamp(selectedSetting.updatedAt)}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                loading={updateMutation.isPending}
                disabled={!selectedSetting}
                onClick={() => updateMutation.mutate()}
              >
                <Save className="h-4 w-4" />
                保存
              </Button>
              {selectedSetting ? (
                <Badge variant={selectedSetting.isDefault ? "outline" : "default"}>
                  {selectedSetting.isDefault ? "默认值" : "数据库覆盖"}
                </Badge>
              ) : null}
              {hotUpdateLabel ? (
                <Badge variant={lastUpdate?.configChange?.published ? "saved" : "tle"}>
                  {hotUpdateLabel}
                </Badge>
              ) : null}
            </div>

            {lastUpdate ? (
              <div className="border-border bg-subtle/10 rounded-[var(--radius-md)] border p-3 text-sm">
                <div className="text-foreground font-medium">最近一次保存</div>
                <div className="text-muted-foreground mt-2 grid gap-2 sm:grid-cols-2">
                  <span className="font-mono text-xs">{lastUpdate.key}</span>
                  <span>配置修订：{lastUpdate.runtimeConfig?.revision ?? "-"}</span>
                  <span>加载时间：{formatTimestamp(lastUpdate.runtimeConfig?.loadedAt)}</span>
                  <span>通知订阅：{lastUpdate.configChange?.subscriberCount ?? 0} 个进程</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
