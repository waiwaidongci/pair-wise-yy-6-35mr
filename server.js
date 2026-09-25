// HTTP 入口：只负责路由与参数校验。
// 判定规则在 src/rules.js，数据保存在 src/store.js，页面在 src/page.js。
import http from "node:http";
import { loadDb, saveDb } from "./src/store.js";
import { STAGES, applyTest, recordEnv, refreshStatus, viewOf } from "./src/rules.js";
import { page } from "./src/page.js";

const port = Number(process.env.PORT || 3037);

async function readBody(req) {
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
function newId() { return "IS-" + Date.now(); }
function findItem(db, key) { return db.items.find(x => x.id === key || x.code === key); }
function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function computeStats(items) {
  const stats = Object.fromEntries(STAGES.map(label => [label, 0]));
  for (const item of items) if (stats[item.status] !== undefined) stats[item.status] += 1;
  return stats;
}
function withView(item, now) { return { ...item, view: viewOf(item, now) }; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    const now = new Date().toISOString();

    // 养护到期的墨锭自动转入待初评
    let changed = false;
    for (const item of db.items) {
      const event = refreshStatus(item, now);
      if (event) {
        item.logs.push({ at: now, step: "养护", note: event });
        changed = true;
      }
    }
    if (changed) await saveDb(db);

    if (req.method === "GET" && url.pathname === "/") return html(res, page());
    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, { now, items: db.items.map(item => withView(item, now)) });
    }
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats(db.items));

    // 入室建档：必须绑定生产批次、养护时长和环境范围
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await readBody(req);
      const missing = ["code", "batch", "curingHours", "tempMin", "tempMax", "humidityMin", "humidityMax"]
        .filter(k => input[k] === undefined || input[k] === "");
      if (missing.length) return send(res, 400, { error: "入室需绑定生产批次、养护时长和环境范围，缺少：" + missing.join("、") });
      const curingHours = num(input.curingHours);
      const tempMin = num(input.tempMin), tempMax = num(input.tempMax);
      const humidityMin = num(input.humidityMin), humidityMax = num(input.humidityMax);
      if (!curingHours || curingHours <= 0) return send(res, 400, { error: "养护时长需为正数（小时）" });
      if ([tempMin, tempMax, humidityMin, humidityMax].some(v => v === null) || tempMin >= tempMax || humidityMin >= humidityMax) {
        return send(res, 400, { error: "环境范围需为数字，且下限小于上限" });
      }
      if (db.items.some(x => x.code === input.code)) return send(res, 409, { error: "墨锭编号已存在：" + input.code });
      const item = {
        id: newId(),
        code: String(input.code),
        batch: String(input.batch),
        smokeSource: input.smokeSource || "",
        glueRatio: input.glueRatio || "",
        ageYears: input.ageYears === "" || input.ageYears === undefined ? "" : Number(input.ageYears),
        storage: input.storage || "",
        status: "养护中",
        intakeAt: now,
        curing: { requiredHours: curingHours, accumulatedMs: 0, running: true, lastTickAt: now, pauseReason: null, pauses: [] },
        envRange: { tempMin, tempMax, humidityMin, humidityMax },
        envLogs: [],
        tests: [],
        logs: [{ at: now, step: "入室", note: `入室建档，绑定批次 ${input.batch}，养护 ${curingHours} 小时，环境 ${tempMin}~${tempMax}℃ / ${humidityMin}~${humidityMax}%` }]
      };
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, { item: withView(item, now) });
    }

    // 温湿度记录：超标暂停计时，回到范围从暂停点续算
    const env = url.pathname.match(/^\/api\/items\/([^/]+)\/env$/);
    if (env && req.method === "POST") {
      const item = findItem(db, env[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (item.status !== "养护中") return send(res, 409, { error: `「${item.code}」当前状态为${item.status}，养护已结束，无需记录环境` });
      const input = await readBody(req);
      const temperature = num(input.temperature), humidity = num(input.humidity);
      if (temperature === null || humidity === null) return send(res, 400, { error: "温度、湿度需为数字" });
      const result = recordEnv(item, { temperature, humidity, note: input.note }, now);
      item.logs.push({ at: now, step: "环境", note: `温度${temperature}℃ 湿度${humidity}%` + (result.inRange ? "，在范围内" : "，超标：" + result.reasons.join("；")) });
      for (const event of result.events) item.logs.push({ at: now, step: "养护", note: event });
      const done = refreshStatus(item, now);
      if (done) item.logs.push({ at: now, step: "养护", note: done });
      await saveDb(db);
      return send(res, 201, { result, item: withView(item, now) });
    }

    // 试磨：按当前状态自动判定为初评或复磨，规则见 src/rules.js
    const test = url.pathname.match(/^\/api\/items\/([^/]+)\/test$/);
    if (test && req.method === "POST") {
      const item = findItem(db, test[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await readBody(req);
      const score = num(input.score);
      if (score === null || score < 0 || score > 100) return send(res, 400, { error: "评分需为 0~100 的数字" });
      const result = applyTest(item, { ...input, score }, now);
      if (!result.ok) return send(res, 409, { error: result.error });
      item.logs.push({ at: now, step: result.record.stage, note: `${input.paper || "试纸"}，评分${score}` + (result.record.sediment ? "，有沉淀" : ""), score });
      item.logs.push({ at: now, step: "判定", note: result.event });
      await saveDb(db);
      return send(res, 201, { result, item: withView(item, now) });
    }

    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const item = findItem(db, log[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await readBody(req);
      item.logs.push({ at: now, step: input.step || "备注", note: input.note || "" });
      await saveDb(db);
      return send(res, 201, { item: withView(item, now) });
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});
server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
