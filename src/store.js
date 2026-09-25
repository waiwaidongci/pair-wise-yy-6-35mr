// 数据保存层：负责 ink-stick-testing.json 的读写、首建种子与旧数据迁移。
// 业务判定全部调用 rules.js，本层不做流程规则判断。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  STATUS,
  applyReading,
  startInitial,
  startRegrind,
} from "./rules.js";

export const SCHEMA_VERSION = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadDb(dbPath) {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    const db = { schemaVersion: SCHEMA_VERSION, items: seed() };
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    return db;
  }
  const raw = JSON.parse(await readFile(dbPath, "utf8"));
  if (!raw.schemaVersion || raw.schemaVersion < SCHEMA_VERSION) {
    const db = migrate(raw);
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    return db;
  }
  return raw;
}

export async function saveDb(dbPath, db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

// ---------- 种子数据：覆盖五个阶段 ----------

function cureSpec({
  requiredDays,
  tempMin = 18,
  tempMax = 25,
  humMin = 55,
  humMax = 70,
  accumulatedMs = 0,
  inRange = true,
  lastReadingAt = null,
  pausedAt = null,
  pauseReason = null,
}) {
  return {
    requiredMs: requiredDays * DAY_MS,
    accumulatedMs,
    tempMin,
    tempMax,
    humMin,
    humMax,
    inRange,
    lastReadingAt,
    pausedAt,
    pauseReason,
  };
}

function seed() {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const items = [];

  // 批次 A「黄山松烟」——全流程各阶段
  const batchA = "2026春-黄山松烟";

  // A1 养护中：还剩约 20 小时，当前合规
  {
    const enteredAt = now - 52 * hour;
    const item = base({
      id: "IS-101",
      code: "IS-101",
      batch: batchA,
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 3 }),
      status: STATUS.CURING,
    });
    seedReadings(item, [
      { h: -52, temp: 21, humidity: 60 },
      { h: -30, temp: 22, humidity: 62 },
      { h: -10, temp: 20, humidity: 59 },
      { h: -1, temp: 22, humidity: 61 },
    ], now);
    items.push(item);
  }

  // A2 养护中：因湿度超标暂停，回到范围才会续算
  {
    const enteredAt = now - 40 * hour;
    const item = base({
      id: "IS-102",
      code: "IS-102",
      batch: batchA,
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 3 }),
      status: STATUS.CURING,
    });
    seedReadings(item, [
      { h: -40, temp: 21, humidity: 60 },
      { h: -34, temp: 22, humidity: 63 },
      { h: -6, temp: 23, humidity: 78 },
    ], now);
    items.push(item);
  }

  // A3 待初评：72 小时养护已到期
  {
    const enteredAt = now - 76 * hour;
    const item = base({
      id: "IS-103",
      code: "IS-103",
      batch: batchA,
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 3 }),
      status: STATUS.PENDING_INITIAL,
    });
    seedReadings(item, [
      { h: -76, temp: 20, humidity: 60 },
      { h: -50, temp: 21, humidity: 61 },
      { h: -24, temp: 22, humidity: 60 },
      { h: -2, temp: 21, humidity: 62 },
    ], now);
    item.logs.push({ at: new Date(now - 2 * hour).toISOString(), step: "养护", note: "有效养护时长已满3天，进入待初评" });
    items.push(item);
  }

  // A4 待复磨：初评 88，复磨窗口 6 小时后开启
  {
    const enteredAt = now - 100 * hour;
    let item = base({
      id: "IS-104",
      code: "IS-104",
      batch: batchA,
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 3 }),
      status: STATUS.PENDING_INITIAL,
    });
    seedReadings(item, [{ h: -100, temp: 21, humidity: 60 }, { h: -60, temp: 22, humidity: 62 }, { h: -30, temp: 21, humidity: 60 }], now);
    const initialAt = now - 18 * hour;
    const r1 = startInitial(item, { paper: "宣纸", water: "20滴", speed: "快", colorLayer: "乌黑发亮", sediment: "无沉淀", score: 88 }, initialAt);
    item = r1.item;
    item.logs.push(...r1.events);
    items.push(item);
  }

  // A5 已定级：初评 90，26 小时后复磨 92
  {
    const enteredAt = now - 130 * hour;
    let item = base({
      id: "IS-105",
      code: "IS-105",
      batch: batchA,
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜A",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 3 }),
      status: STATUS.PENDING_INITIAL,
    });
    seedReadings(item, [{ h: -130, temp: 21, humidity: 60 }, { h: -90, temp: 22, humidity: 61 }, { h: -50, temp: 20, humidity: 60 }], now);
    const initialAt = now - 50 * hour;
    const r1 = startInitial(item, { paper: "宣纸", water: "20滴", speed: "快", colorLayer: "沉敛", sediment: "无沉淀", score: 90 }, initialAt);
    item = r1.item;
    item.logs.push(...r1.events);
    const regrindAt = now - 26 * hour;
    const r2 = startRegrind(item, { paper: "宣纸", water: "20滴", speed: "快", colorLayer: "乌黑有光", sediment: "无沉淀", score: 92 }, regrindAt);
    item = r2.item;
    item.logs.push(...r2.events);
    items.push(item);
  }

  // A6 重点观察：初评 87，复磨 81（低 6 分）
  {
    const enteredAt = now - 130 * hour;
    let item = base({
      id: "IS-106",
      code: "IS-106",
      batch: batchA,
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "试样盒C",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 3 }),
      status: STATUS.PENDING_INITIAL,
    });
    seedReadings(item, [{ h: -130, temp: 21, humidity: 60 }, { h: -90, temp: 22, humidity: 62 }, { h: -50, temp: 21, humidity: 60 }], now);
    const initialAt = now - 50 * hour;
    const r1 = startInitial(item, { paper: "宣纸", water: "20滴", speed: "中", colorLayer: "偏暖", sediment: "无沉淀", score: 87 }, initialAt);
    item = r1.item;
    item.logs.push(...r1.events);
    const regrindAt = now - 26 * hour;
    const r2 = startRegrind(item, { paper: "宣纸", water: "22滴", speed: "慢", colorLayer: "发灰", sediment: "无沉淀", score: 81 }, regrindAt);
    item = r2.item;
    item.logs.push(...r2.events);
    items.push(item);
  }

  // 批次 B「桐油烟」——新入室，养护刚开始
  {
    const enteredAt = now - 2 * hour;
    const item = base({
      id: "IS-201",
      code: "IS-201",
      batch: "2026春-桐油烟",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "试样盒C",
      enteredAt: new Date(enteredAt).toISOString(),
      cure: cureSpec({ requiredDays: 2 }),
      status: STATUS.CURING,
    });
    seedReadings(item, [{ h: -2, temp: 23, humidity: 64 }, { h: -1, temp: 23, humidity: 65 }], now);
    items.push(item);
  }

  return items;
}

function base({
  id,
  code,
  batch,
  smokeSource,
  glueRatio,
  ageYears,
  storage,
  enteredAt,
  cure,
  status,
}) {
  return {
    id,
    code,
    batch,
    smokeSource,
    glueRatio,
    ageYears,
    storage,
    enteredAt,
    cure,
    status,
    watchReason: null,
    initial: null,
    regrind: null,
    gradeScore: null,
    env: [],
    tests: [],
    logs: [
      { at: enteredAt, step: "建档", note: `墨锭入室，批次 ${batch}，养护时长 ${cure.requiredMs / DAY_MS} 天，环境范围 ${cure.tempMin}-${cure.tempMax}℃ / ${cure.humMin}-${cure.humMax}%` },
    ],
  };
}

function seedReadings(item, readings, now) {
  const hour = 60 * 60 * 1000;
  for (const r of readings) {
    const result = applyReading(item, {
      at: now + r.h * hour,
      temp: r.temp,
      humidity: r.humidity,
    });
    item.cure = result.item.cure;
    item.env = result.item.env;
    item.logs.push(...result.events);
  }
}

// ---------- 旧版数据迁移（一次评分定结论的老档案） ----------

function migrate(raw) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    items: items.map((old, index) => migrateItem(old, index, now)),
  };
}

function migrateItem(old, index, now) {
  // 旧版的一次评分不再作为结论：统一视为养护已到期、待重新初评；
  // 历史记录原样保留在 logs 中可追溯。
  const oldScore =
    (old.tests && old.tests[0] && old.tests[0].score != null && old.tests[0].score) ||
    ((old.logs || []).find((l) => l.score != null) || {}).score;

  const item = {
    id: old.id || old.code || `IS-OLD-${Date.now()}-${index}`,
    code: old.code || old.id || `IS-OLD-${index + 1}`,
    batch: old.batch || "未登记批次（旧档案）",
    smokeSource: old.smokeSource || "",
    glueRatio: old.glueRatio || "",
    ageYears: old.ageYears ?? null,
    storage: old.storage || "",
    enteredAt: (old.logs && old.logs[0] && old.logs[0].at) || new Date(now).toISOString(),
    cure: cureSpec({ requiredDays: 7, accumulatedMs: 7 * DAY_MS, lastReadingAt: new Date(now).toISOString() }),
    status: STATUS.PENDING_INITIAL,
    watchReason: null,
    initial: null,
    regrind: null,
    gradeScore: null,
    env: [],
    tests: [],
    logs: [
      ...(old.logs || []).map((l) => ({
        at: l.at || new Date(now).toISOString(),
        step: l.step === "试磨" ? "旧版试磨" : l.step,
        note: l.note || "",
        ...(l.score != null ? { score: l.score } : {}),
      })),
      { at: new Date(now).toISOString(), step: "迁移", note: "旧档案迁移：按养护7天已到期处理，历史评分仅作记录，需重新走初评与复磨流程" },
    ],
  };
  if (oldScore != null) {
    item.logs.push({
      at: new Date(now).toISOString(),
      step: "迁移",
      note: `旧评分 ${oldScore} 分不再作为定级结论，请重新初评`,
    });
  }
  return item;
}
