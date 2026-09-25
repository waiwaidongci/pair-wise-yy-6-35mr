// HTTP 编排层：解析请求 -> 调用 rules.js 判定 -> 交给 store.js 保存。
// 判定规则不在本层实现。
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDb, saveDb } from "./src/store.js";
import {
  STATUS,
  STATUSES,
  applyReading,
  advance,
  startInitial,
  startRegrind,
  cureProgress,
  nextStep,
  regrindAvailableAt,
  validateCureSpec,
  formatDuration,
} from "./src/rules.js";
import { renderPage } from "./src/page.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "ink-stick-testing.json");
const port = Number(process.env.PORT || 3037);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

function num(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label}必须是数字`);
  return n;
}
function parseAt(value, fallbackMs) {
  if (value == null || value === "") return fallbackMs;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("时间格式无效");
  return ms;
}
function findItem(db, id) {
  return db.items.find((x) => x.id === id || x.code === id);
}

// 时间流逝带来的流转（养护到期 -> 待初评），每次请求惰性推进，原地更新。
function advanceAll(db, nowMs) {
  let changed = false;
  for (const item of db.items) {
    const { item: next, events } = advance(item, nowMs);
    if (events.length) {
      changed = true;
      Object.assign(item, next);
      item.logs = [...(item.logs || []), ...events];
    }
  }
  return changed;
}

function summarize(item, nowMs) {
  const progress = cureProgress(item, nowMs);
  const c = item.cure;
  return {
    ...item,
    progress: {
      ...progress,
      remainingText: progress.done ? "已到期" : formatDuration(progress.remainingMs),
    },
    cureText: `${c.requiredMs / (24 * 60 * 60 * 1000)}天`,
    envText: `${c.tempMin}-${c.tempMax}℃ / ${c.humMin}-${c.humMax}%RH`,
    nextStep: nextStep(item, nowMs),
    regrindReady:
      item.status === STATUS.PENDING_REGRIND &&
      item.initial &&
      nowMs >= regrindAvailableAt(item),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const nowMs = Date.now();
    const db = await loadDb(dbPath);
    const advanced = advanceAll(db, nowMs);

    if (req.method === "GET" && url.pathname === "/") return html(res, renderPage());

    if (req.method === "GET" && url.pathname === "/api/items") {
      if (advanced) await saveDb(dbPath, db);
      return send(res, 200, db.items.map((i) => summarize(i, nowMs)));
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      if (advanced) await saveDb(dbPath, db);
      const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      for (const item of db.items) stats[item.status] = (stats[item.status] || 0) + 1;
      return send(res, 200, stats);
    }

    // 入室建档：绑定生产批次、养护时长与环境范围
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const code = String(input.code || "").trim();
      const batch = String(input.batch || "").trim();
      if (!code) throw new Error("墨锭编号必填");
      if (!batch) throw new Error("生产批次必填");
      if (db.items.some((x) => x.code === code)) throw new Error(`编号 ${code} 已存在`);

      const cure = {
        requiredMs: num(input.cureDays, "养护时长") * 24 * 60 * 60 * 1000,
        accumulatedMs: 0,
        tempMin: num(input.tempMin, "温度下限"),
        tempMax: num(input.tempMax, "温度上限"),
        humMin: num(input.humMin, "湿度下限"),
        humMax: num(input.humMax, "湿度上限"),
        inRange: true,
        lastReadingAt: null,
        pausedAt: null,
        pauseReason: null,
      };
      const specError = validateCureSpec({
        cureDays: cure.requiredMs / (24 * 60 * 60 * 1000),
        tempMin: cure.tempMin,
        tempMax: cure.tempMax,
        humMin: cure.humMin,
        humMax: cure.humMax,
      });
      if (specError) throw new Error(specError);

      let item = {
        id: "IS-" + nowMs,
        code,
        batch,
        smokeSource: String(input.smokeSource || "").trim(),
        glueRatio: String(input.glueRatio || "").trim(),
        ageYears: input.ageYears === "" || input.ageYears == null ? null : num(input.ageYears, "存放年限"),
        storage: String(input.storage || "").trim(),
        enteredAt: new Date(nowMs).toISOString(),
        cure,
        status: STATUS.CURING,
        watchReason: null,
        initial: null,
        regrind: null,
        gradeScore: null,
        env: [],
        tests: [],
        logs: [
          {
            at: new Date(nowMs).toISOString(),
            step: "建档",
            note: `墨锭入室，批次 ${batch}，养护时长 ${input.cureDays} 天，环境范围 ${cure.tempMin}-${cure.tempMax}℃ / ${cure.humMin}-${cure.humMax}%`,
          },
        ],
      };

      // 入室即时温湿度：作为计时起点；超标则从暂停开始
      if (input.temp !== "" && input.temp != null && input.humidity !== "" && input.humidity != null) {
        const result = applyReading(item, {
          at: nowMs,
          temp: num(input.temp, "温度"),
          humidity: num(input.humidity, "湿度"),
        });
        item = result.item;
        item.logs.push(...result.events);
      }

      db.items.unshift(item);
      await saveDb(dbPath, db);
      return send(res, 201, summarize(item, nowMs));
    }

    // 单锭温湿度登记
    const reading = url.pathname.match(/^\/api\/items\/([^/]+)\/readings$/);
    if (reading && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(reading[1]));
      if (!item) return send(res, 404, { error: "墨锭不存在" });
      if (item.status !== STATUS.CURING) {
        return send(res, 400, { error: `当前状态为「${item.status}」，养护计时已结束，无需登记温湿度` });
      }
      const input = await body(req);
      const result = applyReading(item, {
        at: parseAt(input.at, nowMs),
        temp: num(input.temp, "温度"),
        humidity: num(input.humidity, "湿度"),
      });
      Object.assign(item, result.item);
      item.logs = [...(item.logs || []), ...result.events];
      advanceAll(db, nowMs);
      await saveDb(dbPath, db);
      return send(res, 201, summarize(item, nowMs));
    }

    // 按批次温湿度登记：作用于该批次所有养护中的墨锭
    const batchReading = url.pathname.match(/^\/api\/batches\/([^/]+)\/readings$/);
    if (batchReading && req.method === "POST") {
      const batch = decodeURIComponent(batchReading[1]);
      const input = await body(req);
      const at = parseAt(input.at, nowMs);
      const temp = num(input.temp, "温度");
      const humidity = num(input.humidity, "湿度");
      const targets = db.items.filter((x) => x.batch === batch && x.status === STATUS.CURING);
      if (!targets.length) return send(res, 404, { error: `批次「${batch}」没有养护中的墨锭` });
      const updated = [];
      for (const item of targets) {
        const result = applyReading(item, { at, temp, humidity });
        Object.assign(item, result.item);
        item.logs = [...(item.logs || []), ...result.events];
        updated.push(item.code);
      }
      advanceAll(db, nowMs);
      await saveDb(dbPath, db);
      return send(res, 201, { batch, updated });
    }

    // 初评：养护未到期会被 rules 拒绝；>=85 进入待复磨，否则重点观察
    const initial = url.pathname.match(/^\/api\/items\/([^/]+)\/initial$/);
    if (initial && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(initial[1]));
      if (!item) return send(res, 404, { error: "墨锭不存在" });
      const result = startInitial(item, await body(req), nowMs);
      Object.assign(item, result.item);
      item.logs = [...(item.logs || []), ...result.events];
      await saveDb(dbPath, db);
      return send(res, 201, summarize(item, nowMs));
    }

    // 复磨：初评满24小时；低5分或有沉淀转重点观察，否则按复磨结果定级
    const regrind = url.pathname.match(/^\/api\/items\/([^/]+)\/regrind$/);
    if (regrind && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(regrind[1]));
      if (!item) return send(res, 404, { error: "墨锭不存在" });
      const result = startRegrind(item, await body(req), nowMs);
      Object.assign(item, result.item);
      item.logs = [...(item.logs || []), ...result.events];
      await saveDb(dbPath, db);
      return send(res, 201, summarize(item, nowMs));
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 400, { error: error.message });
  }
});

server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
