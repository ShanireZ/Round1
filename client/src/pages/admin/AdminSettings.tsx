import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminSettings, stringifyJson, updateAdminSetting } from "@/lib/admin-content";

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
    throw new Error("valueJson 不能为空");
  }

  return JSON.parse(raw) as unknown;
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [valueDraft, setValueDraft] = useState("null");

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"] as const,
    queryFn: fetchAdminSettings,
  });

  const selectedSetting = useMemo(
    () => settingsQuery.data?.items.find((item) => item.key === selectedKey) ?? null,
    [settingsQuery.data?.items, selectedKey],
  );

  useEffect(() => {
    const firstKey = settingsQuery.data?.items[0]?.key;
    if (!selectedKey && firstKey) {
      setSelectedKey(firstKey);
    }
  }, [settingsQuery.data?.items, selectedKey]);

  useEffect(() => {
    if (selectedSetting) {
      setCustomKey(selectedSetting.key);
      setValueDraft(stringifyJson(selectedSetting.valueJson));
    }
  }, [selectedSetting]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const key = customKey.trim();
      if (!key) {
        throw new Error("请填写设置 key");
      }

      const parsed = parseJsonValue(valueDraft);
      return updateAdminSetting(key, parsed);
    },
    onSuccess: (updated) => {
      setSelectedKey(updated.key);
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("系统设置已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "系统设置保存失败");
    },
  });

  const countLabel = `${settingsQuery.data?.items.length ?? 0}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">系统设置</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            维护 app_settings 中的运行时配置。变更会记录审计，并通过 Redis config:change 通知 API 与作业进程热更新。
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
                <RefreshCcw className="h-4 w-4 text-primary" />
                Runtime Settings
              </CardTitle>
              <CardDescription>默认配置与数据库覆盖值合并展示。</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void settingsQuery.refetch()}>
              刷新
            </Button>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <div className="rounded-[--radius-md] border border-border p-4 text-sm text-muted-foreground">
                正在加载系统设置...
              </div>
            ) : settingsQuery.isError ? (
              <div className="rounded-[--radius-md] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {settingsQuery.error instanceof Error ? settingsQuery.error.message : "系统设置加载失败"}
              </div>
            ) : settingsQuery.data && settingsQuery.data.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settingsQuery.data.items.map((setting) => (
                    <TableRow
                      key={setting.key}
                      className={selectedKey === setting.key ? "bg-subtle/30" : "cursor-pointer"}
                      onClick={() => setSelectedKey(setting.key)}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">{setting.label}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{setting.key}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{setting.category}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                        {stringifyJson(setting.valueJson)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {setting.isDefault ? "default" : formatTimestamp(setting.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-[--radius-md] border border-dashed border-border p-4 text-sm text-muted-foreground">
                暂无系统设置。
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="flat" className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">编辑设置</CardTitle>
            <CardDescription>保存时使用 PATCH /api/v1/admin/settings/:key。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSetting ? (
              <div className="rounded-[--radius-md] border border-border bg-subtle/20 p-3 text-sm">
                <div className="font-semibold text-foreground">{selectedSetting.label}</div>
                <div className="mt-1 text-muted-foreground">{selectedSetting.description}</div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="setting-key">Key</Label>
              <Input
                id="setting-key"
                value={customKey}
                onChange={(event) => setCustomKey(event.target.value)}
                placeholder="exam.autosaveIntervalSeconds"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setting-value">valueJson</Label>
              <Textarea
                id="setting-value"
                className="min-h-64 font-mono text-xs"
                value={valueDraft}
                onChange={(event) => setValueDraft(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                <Save className="h-4 w-4" />
                保存
              </Button>
              {selectedSetting ? (
                <Badge variant={selectedSetting.isDefault ? "outline" : "default"}>
                  {selectedSetting.isDefault ? "Default" : "DB Override"}
                </Badge>
              ) : null}
            </div>

            <ScrollArea className="h-40 rounded-[--radius-md] border border-border bg-subtle/10 p-3">
              <pre className="text-xs text-muted-foreground">
                {stringifyJson({
                  selectedKey,
                  updatedBy: selectedSetting?.updatedBy ?? null,
                  createdAt: selectedSetting?.createdAt ?? null,
                  updatedAt: selectedSetting?.updatedAt ?? null,
                })}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
