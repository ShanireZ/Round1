import { desc } from "drizzle-orm";
import { db } from "../db.js";
import { appSettings } from "../db/schema/appSettings.js";
import { logger } from "../logger.js";
import { redisClient } from "../redis.js";
import { RUNTIME_SETTING_DEFINITIONS } from "./runtimeSettingDefinitions.js";
export const CONFIG_CHANGE_CHANNEL = "config:change";
function buildDefaultSettingsMap() {
    return new Map(RUNTIME_SETTING_DEFINITIONS.map((definition) => [
        definition.key,
        definition.defaultValue,
    ]));
}
let runtimeSettings = buildDefaultSettingsMap();
let runtimeConfigRevision = 0;
let runtimeConfigLoadedAt = null;
let runtimeConfigSubscriber = null;
let runtimeConfigSubscriberStart = null;
export function getRuntimeConfigSnapshot() {
    return {
        revision: runtimeConfigRevision,
        loadedAt: runtimeConfigLoadedAt?.toISOString() ?? null,
        settings: Object.fromEntries(runtimeSettings.entries()),
    };
}
export function getRuntimeSetting(key, fallback) {
    return (runtimeSettings.has(key) ? runtimeSettings.get(key) : fallback);
}
export function getRuntimeNumberSetting(key, fallback) {
    const value = getRuntimeSetting(key, fallback);
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    logger.warn({ key, value, fallback }, "Runtime setting is not a finite number; using fallback");
    return fallback;
}
export async function listRuntimeSettingsForAdmin() {
    const rows = await db
        .select({
        key: appSettings.key,
        valueJson: appSettings.valueJson,
        updatedBy: appSettings.updatedBy,
        createdAt: appSettings.createdAt,
        updatedAt: appSettings.updatedAt,
    })
        .from(appSettings)
        .orderBy(appSettings.key);
    const storedByKey = new Map(rows.map((row) => [row.key, row]));
    const knownKeys = new Set(RUNTIME_SETTING_DEFINITIONS.map((definition) => definition.key));
    const knownItems = RUNTIME_SETTING_DEFINITIONS.map((definition) => {
        const stored = storedByKey.get(definition.key);
        return {
            ...definition,
            valueJson: stored?.valueJson ?? definition.defaultValue,
            isDefault: !stored,
            updatedBy: stored?.updatedBy ?? null,
            createdAt: stored?.createdAt ?? null,
            updatedAt: stored?.updatedAt ?? null,
        };
    });
    const extraItems = rows
        .filter((row) => !knownKeys.has(row.key))
        .map((row) => ({
        key: row.key,
        category: "custom",
        label: row.key,
        description: "数据库中的自定义运行时配置。",
        defaultValue: null,
        valueType: "json",
        valueJson: row.valueJson,
        isDefault: false,
        updatedBy: row.updatedBy ?? null,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
    }));
    return [...knownItems, ...extraItems];
}
export async function reloadRuntimeConfig(context = { reason: "manual" }) {
    const rows = await db
        .select({
        key: appSettings.key,
        valueJson: appSettings.valueJson,
    })
        .from(appSettings)
        .orderBy(desc(appSettings.updatedAt));
    const nextSettings = buildDefaultSettingsMap();
    for (const row of rows) {
        nextSettings.set(row.key, row.valueJson);
    }
    runtimeSettings = nextSettings;
    runtimeConfigRevision += 1;
    runtimeConfigLoadedAt = new Date();
    const snapshot = getRuntimeConfigSnapshot();
    logger.info({
        reason: context.reason,
        key: context.key,
        revision: snapshot.revision,
        settingCount: runtimeSettings.size,
    }, "Runtime config reloaded");
    return snapshot;
}
export async function publishRuntimeConfigChange(params) {
    if (!redisClient.isOpen) {
        logger.warn({ channel: CONFIG_CHANGE_CHANNEL, key: params.key }, "Redis client is not open; runtime config change was not published");
        return { channel: CONFIG_CHANGE_CHANNEL, published: false, subscriberCount: 0 };
    }
    const message = {
        key: params.key,
        updatedBy: params.updatedBy,
        changedAt: new Date().toISOString(),
        source: "admin-settings",
        pid: process.pid,
    };
    const subscriberCount = Number(await redisClient.publish(CONFIG_CHANGE_CHANNEL, JSON.stringify(message)));
    logger.info({ channel: CONFIG_CHANGE_CHANNEL, key: params.key, subscriberCount }, "Runtime config change published");
    return { channel: CONFIG_CHANGE_CHANNEL, published: true, subscriberCount };
}
export async function startRuntimeConfigSubscriber(processName) {
    if (runtimeConfigSubscriberStart) {
        return runtimeConfigSubscriberStart;
    }
    runtimeConfigSubscriberStart = (async () => {
        runtimeConfigSubscriber = redisClient.duplicate();
        runtimeConfigSubscriber.on("error", (err) => {
            logger.error({ err, processName }, "Runtime config Redis subscriber error");
        });
        await runtimeConfigSubscriber.connect();
        await runtimeConfigSubscriber.subscribe(CONFIG_CHANGE_CHANNEL, (rawMessage) => {
            void (async () => {
                let message = null;
                try {
                    message = JSON.parse(rawMessage);
                }
                catch (err) {
                    logger.warn({ err, rawMessage, processName }, "Ignoring malformed runtime config message");
                    return;
                }
                try {
                    await reloadRuntimeConfig({
                        reason: "redis-config-change",
                        key: message.key,
                    });
                }
                catch (err) {
                    logger.error({ err, channel: CONFIG_CHANGE_CHANNEL, key: message.key, processName }, "Failed to reload runtime config after Redis notification");
                }
            })();
        });
        logger.info({ channel: CONFIG_CHANGE_CHANNEL, processName }, "Runtime config subscriber started");
    })();
    return runtimeConfigSubscriberStart;
}
export async function initializeRuntimeConfigRuntime(processName) {
    const snapshot = await reloadRuntimeConfig({ reason: "startup" });
    await startRuntimeConfigSubscriber(processName);
    return snapshot;
}
export async function stopRuntimeConfigSubscriber() {
    const subscriber = runtimeConfigSubscriber;
    runtimeConfigSubscriber = null;
    runtimeConfigSubscriberStart = null;
    if (!subscriber) {
        return;
    }
    try {
        await subscriber.unsubscribe(CONFIG_CHANGE_CHANNEL);
    }
    finally {
        await subscriber.quit();
    }
}
