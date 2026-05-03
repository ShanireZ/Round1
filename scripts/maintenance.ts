import { pathToFileURL } from "node:url";

import {
  renderStableScriptHelp,
  resolveCommand,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const maintenanceCommands: StableScriptCommand[] = [
  {
    name: "bootstrap-knowledge-points",
    scriptPath: "commands/maintenance/bootstrapKnowledgePoints.ts",
    summary: "初始化知识点树",
  },
  {
    name: "build-target4-dedupe-replacement-plan-2026",
    scriptPath: "commands/maintenance/buildTarget4DedupeReplacementPlan2026.cjs",
    summary: "生成 target4 去重替换计划",
  },
  {
    name: "build-target4-final-fill-inventory-2026",
    scriptPath: "commands/maintenance/buildTarget4FinalFillInventory2026.cjs",
    summary: "生成 target4 最终补齐 inventory",
  },
  {
    name: "clean-build-output",
    scriptPath: "commands/maintenance/clean-build-output.ts",
    summary: "清理构建输出",
  },
  {
    name: "db-stats",
    scriptPath: "commands/maintenance/db-stats.cjs",
    summary: "查看数据库统计",
  },
  {
    name: "dev-setup",
    scriptPath: "commands/maintenance/dev-setup.ts",
    summary: "初始化本地 HTTPS 开发环境",
  },
  {
    name: "finalize-target4-import-manifest-2026",
    scriptPath: "commands/maintenance/finalizeTarget4ImportManifest2026.cjs",
    summary: "收口 target4 导入清单",
  },
  {
    name: "healthcheck",
    scriptPath: "commands/maintenance/healthcheck.ts",
    summary: "执行统一健康检查",
  },
  {
    name: "init-admin",
    scriptPath: "commands/maintenance/initAdmin.ts",
    summary: "引导首个管理员账号",
  },
  {
    name: "init-env",
    scriptPath: "commands/maintenance/initEnv.ts",
    summary: "生成最小 .env 骨架",
  },
  {
    name: "migrate",
    scriptPath: "commands/maintenance/migrate.ts",
    summary: "执行数据库迁移 up/down/status",
  },
  {
    name: "reconcile-offline-content-2026",
    scriptPath: "commands/maintenance/reconcileOfflineContent2026.cjs",
    summary: "对账 2026 离线内容资产",
  },
  {
    name: "rehearse-paper-slot-points-migration-failure",
    scriptPath: "commands/maintenance/rehearsePaperSlotPointsMigrationFailure.ts",
    summary: "演练 paper slot points 迁移失败",
  },
  {
    name: "repair-auxiliary-kp-tags-2026",
    scriptPath: "commands/maintenance/repairAuxiliaryKpTags2026.cjs",
    summary: "修复 2026 辅助知识点标签",
  },
  {
    name: "seed-blueprint",
    scriptPath: "commands/maintenance/seedBlueprint.ts",
    summary: "写入蓝图配置",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "maintenance.ts",
      summary: "Stable entrypoint for environment setup, migrations, and maintenance utilities.",
      commands: maintenanceCommands,
    }),
  );
}

export async function runMaintenanceCli(argv: readonly string[]) {
  const [commandName, ...args] = argv;

  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  if (commandName === "help") {
    const targetCommand = args[0];
    if (!targetCommand) {
      printHelp();
      return;
    }

    const command = resolveCommand(maintenanceCommands, targetCommand);
    console.log(
      renderStableScriptHelp({
        entryName: "maintenance.ts",
        summary: `Stable help for ${command.name}. Implementation: scripts/${command.scriptPath}`,
        commands: [command],
      }),
    );
    return;
  }

  await runStableScriptCommand({ commands: maintenanceCommands, commandName, args });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runMaintenanceCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
