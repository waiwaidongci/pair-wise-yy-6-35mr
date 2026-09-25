// 数据保存：负责 data/ink-stick-testing.json 的读写、首次播种和旧数据缺省补齐。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "ink-stick-testing.json");

const envRange = { tempMin: 18, tempMax: 26, humidityMin: 55, humidityMax: 70 };
const H = 3600 * 1000;

export const seed = {
  items: [
    {
      id: "IS-001",
      code: "IS-001",
      batch: "P2026-09-A",
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      status: "已试磨",
      intakeAt: "2026-09-18T00:00:00.000Z",
      curing: { requiredHours: 72, accumulatedMs: 72 * H, running: false, lastTickAt: "2026-09-21T00:00:00.000Z", pauseReason: null, pauses: [] },
      envRange,
      envLogs: [
        { at: "2026-09-18T00:00:00.000Z", temperature: 22, humidity: 60, inRange: true, note: "入室首测" },
        { at: "2026-09-19T12:00:00.000Z", temperature: 23, humidity: 62, inRange: true, note: "" },
        { at: "2026-09-21T00:00:00.000Z", temperature: 21, humidity: 58, inRange: true, note: "养护到期" }
      ],
      initial: { at: "2026-09-21T02:00:00.000Z", stage: "初评", paper: "宣纸", water: "20滴", speed: "快", colorLayer: "清透", sediment: false, score: 86 },
      regrind: { at: "2026-09-22T03:00:00.000Z", stage: "复磨", paper: "宣纸", water: "20滴", speed: "快", colorLayer: "清透", sediment: false, score: 84 },
      finalScore: 84,
      tests: [
        { at: "2026-09-21T02:00:00.000Z", stage: "初评", paper: "宣纸", water: "20滴", speed: "快", colorLayer: "清透", sediment: false, score: 86 },
        { at: "2026-09-22T03:00:00.000Z", stage: "复磨", paper: "宣纸", water: "20滴", speed: "快", colorLayer: "清透", sediment: false, score: 84 }
      ],
      logs: [
        { at: "2026-09-18T00:00:00.000Z", step: "入室", note: "入室建档，绑定批次 P2026-09-A，养护 72 小时，环境 18~26℃ / 55~70%" },
        { at: "2026-09-21T00:00:00.000Z", step: "养护", note: "养护到期，转入待初评" },
        { at: "2026-09-21T02:00:00.000Z", step: "初评", note: "宣纸，评分86", score: 86 },
        { at: "2026-09-21T02:00:00.000Z", step: "判定", note: "初评 86 分，达到 85 分，转入待复磨（24小时后复磨定级）" },
        { at: "2026-09-22T03:00:00.000Z", step: "复磨", note: "宣纸，评分84", score: 84 },
        { at: "2026-09-22T03:00:00.000Z", step: "判定", note: "复磨 84 分，按复磨结果定级为已试磨" }
      ]
    },
    {
      id: "IS-002",
      code: "IS-002",
      batch: "P2026-09-A",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "试样盒C",
      status: "待复磨",
      intakeAt: "2026-09-20T00:00:00.000Z",
      curing: { requiredHours: 72, accumulatedMs: 72 * H, running: false, lastTickAt: "2026-09-23T00:00:00.000Z", pauseReason: null, pauses: [] },
      envRange,
      envLogs: [
        { at: "2026-09-20T00:00:00.000Z", temperature: 22, humidity: 61, inRange: true, note: "入室首测" },
        { at: "2026-09-22T00:00:00.000Z", temperature: 23, humidity: 59, inRange: true, note: "" },
        { at: "2026-09-23T00:00:00.000Z", temperature: 22, humidity: 60, inRange: true, note: "养护到期" }
      ],
      initial: { at: "2026-09-23T06:00:00.000Z", stage: "初评", paper: "棉连纸", water: "18滴", speed: "中", colorLayer: "偏暖", sediment: false, score: 88 },
      tests: [
        { at: "2026-09-23T06:00:00.000Z", stage: "初评", paper: "棉连纸", water: "18滴", speed: "中", colorLayer: "偏暖", sediment: false, score: 88 }
      ],
      logs: [
        { at: "2026-09-20T00:00:00.000Z", step: "入室", note: "入室建档，绑定批次 P2026-09-A，养护 72 小时，环境 18~26℃ / 55~70%" },
        { at: "2026-09-23T00:00:00.000Z", step: "养护", note: "养护到期，转入待初评" },
        { at: "2026-09-23T06:00:00.000Z", step: "初评", note: "棉连纸，评分88", score: 88 },
        { at: "2026-09-23T06:00:00.000Z", step: "判定", note: "初评 88 分，达到 85 分，转入待复磨（24小时后复磨定级）" }
      ]
    },
    {
      id: "IS-003",
      code: "IS-003",
      batch: "P2026-09-B",
      smokeSource: "松烟",
      glueRatio: "7%",
      ageYears: 1,
      storage: "恒湿柜A",
      status: "养护中",
      intakeAt: "2026-09-23T00:00:00.000Z",
      curing: {
        requiredHours: 96,
        accumulatedMs: 24 * H,
        running: false,
        lastTickAt: "2026-09-24T08:00:00.000Z",
        pauseReason: "温度偏高(26.8℃ > 26℃)；湿度偏高(74% > 70%)",
        pauses: [
          { pausedAt: "2026-09-24T00:00:00.000Z", reason: "温度偏高(27.5℃ > 26℃)；湿度偏高(78% > 70%)", resumedAt: null }
        ]
      },
      envRange,
      envLogs: [
        { at: "2026-09-23T00:00:00.000Z", temperature: 22, humidity: 60, inRange: true, note: "入室首测" },
        { at: "2026-09-24T00:00:00.000Z", temperature: 27.5, humidity: 78, inRange: false, reasons: ["温度偏高(27.5℃ > 26℃)", "湿度偏高(78% > 70%)"], note: "恒湿柜A故障" },
        { at: "2026-09-24T08:00:00.000Z", temperature: 26.8, humidity: 74, inRange: false, reasons: ["温度偏高(26.8℃ > 26℃)", "湿度偏高(74% > 70%)"], note: "" }
      ],
      tests: [],
      logs: [
        { at: "2026-09-23T00:00:00.000Z", step: "入室", note: "入室建档，绑定批次 P2026-09-B，养护 96 小时，环境 18~26℃ / 55~70%" },
        { at: "2026-09-24T00:00:00.000Z", step: "环境", note: "温度27.5℃ 湿度78%，超标：温度偏高(27.5℃ > 26℃)；湿度偏高(78% > 70%)" },
        { at: "2026-09-24T00:00:00.000Z", step: "养护", note: "环境超标，养护计时暂停：温度偏高(27.5℃ > 26℃)；湿度偏高(78% > 70%)" },
        { at: "2026-09-24T08:00:00.000Z", step: "环境", note: "温度26.8℃ 湿度74%，超标：温度偏高(26.8℃ > 26℃)；湿度偏高(74% > 70%)" },
        { at: "2026-09-24T08:00:00.000Z", step: "养护", note: "环境仍超标，保持暂停：温度偏高(26.8℃ > 26℃)；湿度偏高(74% > 70%)" }
      ]
    },
    {
      id: "IS-004",
      code: "IS-004",
      batch: "P2026-09-B",
      smokeSource: "漆烟",
      glueRatio: "6.5%",
      ageYears: 0,
      storage: "恒湿柜A",
      status: "养护中",
      intakeAt: "2026-09-24T12:00:00.000Z",
      curing: { requiredHours: 72, accumulatedMs: 0, running: true, lastTickAt: "2026-09-24T12:00:00.000Z", pauseReason: null, pauses: [] },
      envRange,
      envLogs: [
        { at: "2026-09-24T12:00:00.000Z", temperature: 21, humidity: 57, inRange: true, note: "入室首测" }
      ],
      tests: [],
      logs: [
        { at: "2026-09-24T12:00:00.000Z", step: "入室", note: "入室建档，绑定批次 P2026-09-B，养护 72 小时，环境 18~26℃ / 55~70%" }
      ]
    },
    {
      id: "IS-005",
      code: "IS-005",
      batch: "P2026-09-A",
      smokeSource: "油烟",
      glueRatio: "8.5%",
      ageYears: 5,
      storage: "试样盒D",
      status: "重点观察",
      intakeAt: "2026-09-15T00:00:00.000Z",
      curing: { requiredHours: 72, accumulatedMs: 72 * H, running: false, lastTickAt: "2026-09-18T00:00:00.000Z", pauseReason: null, pauses: [] },
      envRange,
      envLogs: [
        { at: "2026-09-15T00:00:00.000Z", temperature: 22, humidity: 60, inRange: true, note: "入室首测" },
        { at: "2026-09-18T00:00:00.000Z", temperature: 22, humidity: 61, inRange: true, note: "养护到期" }
      ],
      initial: { at: "2026-09-19T02:00:00.000Z", stage: "初评", paper: "宣纸", water: "20滴", speed: "快", colorLayer: "沉稳", sediment: false, score: 90 },
      regrind: { at: "2026-09-20T03:00:00.000Z", stage: "复磨", paper: "宣纸", water: "20滴", speed: "慢", colorLayer: "发灰", sediment: false, score: 84 },
      tests: [
        { at: "2026-09-19T02:00:00.000Z", stage: "初评", paper: "宣纸", water: "20滴", speed: "快", colorLayer: "沉稳", sediment: false, score: 90 },
        { at: "2026-09-20T03:00:00.000Z", stage: "复磨", paper: "宣纸", water: "20滴", speed: "慢", colorLayer: "发灰", sediment: false, score: 84 }
      ],
      logs: [
        { at: "2026-09-15T00:00:00.000Z", step: "入室", note: "入室建档，绑定批次 P2026-09-A，养护 72 小时，环境 18~26℃ / 55~70%" },
        { at: "2026-09-18T00:00:00.000Z", step: "养护", note: "养护到期，转入待初评" },
        { at: "2026-09-19T02:00:00.000Z", step: "初评", note: "宣纸，评分90", score: 90 },
        { at: "2026-09-19T02:00:00.000Z", step: "判定", note: "初评 90 分，达到 85 分，转入待复磨（24小时后复磨定级）" },
        { at: "2026-09-20T03:00:00.000Z", step: "复磨", note: "宣纸，评分84", score: 84 },
        { at: "2026-09-20T03:00:00.000Z", step: "判定", note: "复磨 84 分，复磨比初评低 6 分，转重点观察" }
      ]
    },
    {
      id: "IS-006",
      code: "IS-006",
      batch: "P2026-09-B",
      smokeSource: "松烟",
      glueRatio: "7.2%",
      ageYears: 2,
      storage: "恒湿柜B",
      status: "待初评",
      intakeAt: "2026-09-19T00:00:00.000Z",
      curing: { requiredHours: 72, accumulatedMs: 72 * H, running: false, lastTickAt: "2026-09-22T00:00:00.000Z", pauseReason: null, pauses: [] },
      envRange,
      envLogs: [
        { at: "2026-09-19T00:00:00.000Z", temperature: 21, humidity: 59, inRange: true, note: "入室首测" },
        { at: "2026-09-22T00:00:00.000Z", temperature: 22, humidity: 60, inRange: true, note: "养护到期" }
      ],
      tests: [],
      logs: [
        { at: "2026-09-19T00:00:00.000Z", step: "入室", note: "入室建档，绑定批次 P2026-09-B，养护 72 小时，环境 18~26℃ / 55~70%" },
        { at: "2026-09-22T00:00:00.000Z", step: "养护", note: "养护到期，转入待初评" }
      ]
    }
  ]
};

function normalize(item) {
  item.logs ||= [];
  item.envLogs ||= [];
  item.tests ||= [];
  if (item.curing) item.curing.pauses ||= [];
  return item;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  db.items = (db.items || []).map(normalize);
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}
