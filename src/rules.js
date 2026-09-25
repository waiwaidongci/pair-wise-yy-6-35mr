// 判定规则：环境判定、养护计时、初评/复磨流转、下一步提示。
// 全部为纯函数，不直接读写数据库；时间一律传入 ISO 字符串，便于测试。

export const STAGES = ["养护中", "待初评", "待复磨", "已试磨", "重点观察"];
export const PASS_SCORE = 85; // 初评合格线：达到也只进入待复磨
export const DROP_LIMIT = 5; // 复磨比初评低 5 分即转重点观察
export const REGRIND_WAIT_MS = 24 * 60 * 60 * 1000; // 初评后须静置 24 小时才能复磨定级

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}天${hours}小时`;
  if (hours) return minutes ? `${hours}小时${minutes}分` : `${hours}小时`;
  return `${minutes}分`;
}

export function hasSediment(value) {
  if (value === true) return true;
  const text = String(value ?? "").trim();
  return ["有", "有沉淀", "明显", "是", "yes", "true"].includes(text);
}

// 温湿度是否落在入室时绑定的环境范围内
export function checkEnv(envRange, temperature, humidity) {
  const reasons = [];
  if (envRange) {
    if (Number.isFinite(temperature)) {
      if (temperature < envRange.tempMin) reasons.push(`温度偏低(${temperature}℃ < ${envRange.tempMin}℃)`);
      if (temperature > envRange.tempMax) reasons.push(`温度偏高(${temperature}℃ > ${envRange.tempMax}℃)`);
    }
    if (Number.isFinite(humidity)) {
      if (humidity < envRange.humidityMin) reasons.push(`湿度偏低(${humidity}% < ${envRange.humidityMin}%)`);
      if (humidity > envRange.humidityMax) reasons.push(`湿度偏高(${humidity}% > ${envRange.humidityMax}%)`);
    }
  }
  return { inRange: reasons.length === 0, reasons };
}

export function ensureCuring(item) {
  if (!item.curing) {
    item.curing = {
      requiredHours: Number(item.curingHours) || 0,
      accumulatedMs: 0,
      running: item.status === "养护中",
      lastTickAt: item.intakeAt || new Date().toISOString(),
      pauseReason: null,
      pauses: []
    };
  }
  item.curing.pauses ||= [];
  return item.curing;
}

// 把计时结算到 now：运行中则累加有效时长，暂停中则跳过
export function tickCuring(item, now) {
  const curing = ensureCuring(item);
  const at = +new Date(now);
  if (curing.running && curing.lastTickAt) {
    curing.accumulatedMs += Math.max(0, at - +new Date(curing.lastTickAt));
  }
  curing.lastTickAt = new Date(at).toISOString();
  return curing;
}

// 只读地计算养护进度（不改数据），供页面展示
export function curingProgress(item, now) {
  const curing = ensureCuring(item);
  const requiredMs = (curing.requiredHours || 0) * 3600 * 1000;
  let effectiveMs = curing.accumulatedMs || 0;
  if (curing.running && curing.lastTickAt) {
    effectiveMs += Math.max(0, +new Date(now) - +new Date(curing.lastTickAt));
  }
  const remainingMs = Math.max(0, requiredMs - effectiveMs);
  return {
    requiredMs,
    effectiveMs,
    remainingMs,
    done: remainingMs <= 0,
    paused: !curing.running,
    pauseReason: curing.pauseReason || null
  };
}

// 记录一次温湿度：先结算计时，再按是否超标暂停/从暂停点续算
export function recordEnv(item, reading, now) {
  const curing = tickCuring(item, now);
  const temperature = Number(reading.temperature);
  const humidity = Number(reading.humidity);
  const { inRange, reasons } = checkEnv(item.envRange, temperature, humidity);
  const entry = { at: now, temperature, humidity, inRange, note: reading.note || "" };
  if (!inRange) entry.reasons = reasons;
  item.envLogs ||= [];
  item.envLogs.push(entry);

  const events = [];
  if (!inRange) {
    const reason = reasons.join("；") || "环境超标";
    if (curing.running) {
      curing.pauses.push({ pausedAt: now, reason, resumedAt: null });
      events.push(`环境超标，养护计时暂停：${reason}`);
    } else {
      events.push(`环境仍超标，保持暂停：${reason}`);
    }
    curing.running = false;
    curing.pauseReason = reason;
  } else if (!curing.running) {
    const last = curing.pauses[curing.pauses.length - 1];
    if (last && !last.resumedAt) last.resumedAt = now;
    curing.running = true;
    curing.pauseReason = null;
    events.push("环境回到范围内，从暂停点续算养护计时");
  }
  return { entry, inRange, reasons, events };
}

// 养护到期自动流转：养护中 → 待初评
export function refreshStatus(item, now) {
  if (item.status === "养护中" && curingProgress(item, now).done) {
    tickCuring(item, now);
    item.curing.running = false;
    item.status = "待初评";
    return "养护到期，转入待初评";
  }
  return null;
}

// 距离可复磨还需等待的毫秒数（初评满 24 小时为 0）
export function regrindWaitMs(item, now) {
  if (!item.initial || !item.initial.at) return 0;
  return Math.max(0, +new Date(item.initial.at) + REGRIND_WAIT_MS - +new Date(now));
}

function canInitial(item, now) {
  if (item.status === "待初评") return { ok: true };
  if (item.status === "养护中") {
    const progress = curingProgress(item, now);
    if (!progress.done) return { ok: false, error: `养护未到期，还剩 ${formatDuration(progress.remainingMs)}，不能初评` };
    return { ok: true };
  }
  return { ok: false, error: `当前状态「${item.status}」不能初评` };
}

function applyInitial(item, test, now) {
  const check = canInitial(item, now);
  if (!check.ok) return check;
  const record = {
    at: now,
    stage: "初评",
    paper: test.paper || "",
    water: test.water || "",
    speed: test.speed || "",
    colorLayer: test.colorLayer || "",
    sediment: hasSediment(test.sediment),
    score: test.score
  };
  item.tests ||= [];
  item.tests.push(record);
  item.initial = record;
  let event;
  if (record.score >= PASS_SCORE) {
    item.status = "待复磨";
    event = `初评 ${record.score} 分，达到 ${PASS_SCORE} 分，转入待复磨（24小时后复磨定级）`;
  } else {
    item.status = "重点观察";
    event = `初评 ${record.score} 分，未达 ${PASS_SCORE} 分，转重点观察`;
  }
  return { ok: true, record, event };
}

function applyRegrind(item, test, now) {
  if (item.status !== "待复磨") return { ok: false, error: `当前状态「${item.status}」不能复磨` };
  const waitMs = regrindWaitMs(item, now);
  if (waitMs > 0) return { ok: false, error: `复磨需在初评 24 小时后，还需等待 ${formatDuration(waitMs)}` };
  const record = {
    at: now,
    stage: "复磨",
    paper: test.paper || "",
    water: test.water || "",
    speed: test.speed || "",
    colorLayer: test.colorLayer || "",
    sediment: hasSediment(test.sediment),
    score: test.score
  };
  item.tests ||= [];
  item.tests.push(record);
  item.regrind = record;
  const drop = (item.initial ? item.initial.score : record.score) - record.score;
  const why = [];
  if (drop >= DROP_LIMIT) why.push(`复磨比初评低 ${drop} 分`);
  if (record.sediment) why.push("出现沉淀");
  let event;
  if (why.length) {
    item.status = "重点观察";
    event = `复磨 ${record.score} 分，${why.join("且")}，转重点观察`;
  } else {
    item.status = "已试磨";
    item.finalScore = record.score;
    event = `复磨 ${record.score} 分，按复磨结果定级为已试磨`;
  }
  return { ok: true, record, event };
}

// 试磨入口：按当前状态决定是初评还是复磨，判定规则集中在这里
export function applyTest(item, test, now) {
  if (item.status === "待复磨") return applyRegrind(item, test, now);
  if (item.status === "养护中" || item.status === "待初评") return applyInitial(item, test, now);
  return { ok: false, error: `当前状态「${item.status}」无需试磨` };
}

// 页面展示用：下一步该做什么
export function nextStep(item, now) {
  if (item.status === "养护中") {
    const progress = curingProgress(item, now);
    if (progress.paused) return `养护暂停中（${progress.pauseReason || "环境超标"}），回到范围后续算，剩余 ${formatDuration(progress.remainingMs)}`;
    return `养护计时中，剩余 ${formatDuration(progress.remainingMs)}，到期后可初评`;
  }
  if (item.status === "待初评") return "养护已到期，安排初评";
  if (item.status === "待复磨") {
    const waitMs = regrindWaitMs(item, now);
    return waitMs > 0 ? `待复磨，还需静置 ${formatDuration(waitMs)}` : "可以复磨定级";
  }
  if (item.status === "已试磨") return `已定级（复磨 ${item.finalScore ?? (item.regrind && item.regrind.score) ?? "-"} 分）`;
  if (item.status === "重点观察") return "重点观察中，待老师傅处置";
  return item.status || "";
}

export function viewOf(item, now) {
  return {
    curing: curingProgress(item, now),
    regrindWaitMs: regrindWaitMs(item, now),
    nextStep: nextStep(item, now)
  };
}
