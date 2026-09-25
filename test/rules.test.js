import test from "node:test";
import assert from "node:assert/strict";
import {
  STATUS,
  INITIAL_PASS_SCORE,
  REGRIND_DELAY_MS,
  applyReading,
  cureProgress,
  advance,
  startInitial,
  startRegrind,
  formatDuration,
  nextStep,
} from "../src/rules.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-09-01T08:00:00Z");

function curingItem(overrides = {}) {
  return {
    id: "T-1",
    code: "T-1",
    batch: "测试批次",
    status: STATUS.CURING,
    enteredAt: new Date(T0).toISOString(),
    cure: {
      requiredMs: 3 * DAY,
      accumulatedMs: 0,
      tempMin: 18,
      tempMax: 25,
      humMin: 55,
      humMax: 70,
      inRange: true,
      lastReadingAt: null,
      pausedAt: null,
      pauseReason: null,
    },
    env: [],
    tests: [],
    logs: [],
    initial: null,
    regrind: null,
    ...overrides,
  };
}

function read(item, atMs, temp, humidity) {
  const r = applyReading(item, { at: atMs, temp, humidity });
  r.item.logs = [...(item.logs || []), ...r.events];
  return r;
}

// ---------- 养护计时：超标暂停，回到范围续算 ----------

test("合规读数计入养护时长", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = read(item, T0 + 10 * HOUR, 22, 61).item;
  assert.equal(item.cure.accumulatedMs, 10 * HOUR);
  assert.equal(item.cure.inRange, true);
  const p = cureProgress(item, T0 + 12 * HOUR);
  assert.equal(p.effectiveMs, 12 * HOUR);
  assert.equal(p.paused, false);
});

test("超标读数触发暂停并记录原因，暂停期间不计时", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = read(item, T0 + 10 * HOUR, 22, 61).item;
  const paused = read(item, T0 + 12 * HOUR, 23, 78);
  assert.equal(paused.events.length, 1);
  assert.equal(paused.events[0].step, "暂停");
  assert.match(paused.events[0].note, /湿度78%高于上限70%/);
  item = paused.item;
  assert.equal(item.cure.pausedAt, new Date(T0 + 12 * HOUR).toISOString());
  // 暂停后 5 小时：有效时长仍停在 12 小时
  const p = cureProgress(item, T0 + 17 * HOUR);
  assert.equal(p.effectiveMs, 12 * HOUR);
  assert.equal(p.paused, true);
  assert.match(p.pauseReason, /湿度/);
});

test("回到范围从暂停点续算，不产生跳变", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = read(item, T0 + 10 * HOUR, 23, 80).item; // 暂停
  item = read(item, T0 + 15 * HOUR, 22, 62).item; // 恢复
  assert.equal(item.cure.inRange, true);
  assert.equal(item.cure.pausedAt, null);
  // 只累计了 0-10h 这一段，10-15h 超标段不计
  assert.equal(item.cure.accumulatedMs, 10 * HOUR);
  const p = cureProgress(item, T0 + 18 * HOUR);
  assert.equal(p.effectiveMs, 13 * HOUR); // 10h + 恢复后 3h
});

test("温度超标同样暂停", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  const r = read(item, T0 + HOUR, 30, 60);
  assert.match(r.events[0].note, /温度30℃高于上限25℃/);
});

test("读数时间不能早于上一条记录", () => {
  let item = curingItem();
  item = read(item, T0 + 5 * HOUR, 21, 60).item;
  assert.throws(() => applyReading(item, { at: T0 + HOUR, temp: 21, humidity: 60 }), /早于/);
});

// ---------- 养护到期 ----------

test("有效时长满要求后流转为待初评", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  const { item: next, events } = advance(item, T0 + 3 * DAY);
  assert.equal(next.status, STATUS.PENDING_INITIAL);
  assert.equal(events.length, 1);
  assert.match(events[0].note, /进入待初评/);
});

test("暂停期间不会到期", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = read(item, T0 + DAY, 21, 90).item; // 1 天有效后暂停
  const { item: next, events } = advance(item, T0 + 10 * DAY);
  assert.equal(next.status, STATUS.CURING);
  assert.equal(events.length, 0);
});

// ---------- 初评 ----------

test("养护未到期不能初评", () => {
  const item = curingItem({ status: STATUS.PENDING_INITIAL });
  assert.throws(
    () => startInitial(item, { score: 90 }, T0 + HOUR),
    /养护未到期/,
  );
});

test("初评达到 85 进入待复磨，不直接定级", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = advance(item, T0 + 3 * DAY).item;
  const { item: next, events } = startInitial(item, { score: INITIAL_PASS_SCORE, paper: "宣纸" }, T0 + 3 * DAY);
  assert.equal(next.status, STATUS.PENDING_REGRIND);
  assert.equal(next.initial.score, 85);
  assert.equal(next.gradeScore ?? null, null);
  assert.match(events[0].note, /待复磨/);
});

test("初评低于 85 转重点观察", () => {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = advance(item, T0 + 3 * DAY).item;
  const { item: next } = startInitial(item, { score: 79 }, T0 + 3 * DAY);
  assert.equal(next.status, STATUS.WATCH);
  assert.match(next.watchReason, /未达85分/);
});

test("非待初评状态不能初评", () => {
  const item = curingItem();
  assert.throws(() => startInitial(item, { score: 90 }, T0), /不能初评/);
});

// ---------- 复磨 ----------

function readyForRegrind(initialScore = 88) {
  let item = curingItem();
  item = read(item, T0, 21, 60).item;
  item = advance(item, T0 + 3 * DAY).item;
  const initialAt = T0 + 3 * DAY;
  item = startInitial(item, { score: initialScore }, initialAt).item;
  return { item, initialAt };
}

test("初评未满 24 小时不能复磨", () => {
  const { item, initialAt } = readyForRegrind();
  assert.throws(
    () => startRegrind(item, { score: 90 }, initialAt + 23 * HOUR),
    /24小时/,
  );
});

test("复磨正常则按复磨结果定级", () => {
  const { item, initialAt } = readyForRegrind(88);
  const { item: next, events } = startRegrind(item, { score: 90, sediment: "无沉淀" }, initialAt + REGRIND_DELAY_MS);
  assert.equal(next.status, STATUS.GRADED);
  assert.equal(next.gradeScore, 90);
  assert.match(events[0].note, /定级完成/);
});

test("复磨比初评低 5 分（含）转重点观察", () => {
  const { item, initialAt } = readyForRegrind(88);
  const { item: next } = startRegrind(item, { score: 83, sediment: "无沉淀" }, initialAt + REGRIND_DELAY_MS);
  assert.equal(next.status, STATUS.WATCH);
  assert.match(next.watchReason, /低5分/);
});

test("复磨出现沉淀转重点观察", () => {
  const { item, initialAt } = readyForRegrind(88);
  const { item: next } = startRegrind(item, { score: 90, sediment: "有沉淀" }, initialAt + REGRIND_DELAY_MS);
  assert.equal(next.status, STATUS.WATCH);
  assert.match(next.watchReason, /沉淀/);
});

test("低 4 分且无沉淀仍可定级", () => {
  const { item, initialAt } = readyForRegrind(88);
  const { item: next } = startRegrind(item, { score: 84, sediment: "无沉淀" }, initialAt + REGRIND_DELAY_MS);
  assert.equal(next.status, STATUS.GRADED);
  assert.equal(next.gradeScore, 84);
});

// ---------- 展示辅助 ----------

test("formatDuration 输出可读时长", () => {
  assert.equal(formatDuration(0), "已到期");
  assert.equal(formatDuration(2 * DAY + 3 * HOUR), "2天3小时");
  assert.equal(formatDuration(90 * 60 * 1000), "1小时30分钟");
});

test("nextStep 覆盖各状态", () => {
  const curing = curingItem();
  assert.match(nextStep(curing, T0), /首次温湿度登记/);
  const graded = { ...curing, status: STATUS.GRADED, gradeScore: 92 };
  assert.match(nextStep(graded, T0), /已定级/);
  const watch = { ...curing, status: STATUS.WATCH, watchReason: "复磨出现沉淀" };
  assert.match(nextStep(watch, T0), /重点观察/);
});
