// 墨锭养护与试磨判定规则（纯函数层）
// 不读写文件、不发请求；时间一律由参数 nowMs 传入，便于测试。

export const STATUS = Object.freeze({
  CURING: "养护中",
  PENDING_INITIAL: "待初评",
  PENDING_REGRIND: "待复磨",
  GRADED: "已定级",
  WATCH: "重点观察",
});

export const STATUSES = Object.freeze(Object.values(STATUS));

export const INITIAL_PASS_SCORE = 85; // 初评达标线
export const REGRIND_DELAY_MS = 24 * 60 * 60 * 1000; // 初评后须满 24 小时才能复磨
export const REGRIND_DROP_LIMIT = 5; // 复磨比初评低 5 分（含）转重点观察

export const SEDIMENT_YES = "有沉淀";
export const SEDIMENT_NO = "无沉淀";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function envSpec(item) {
  const c = item.cure;
  return { tempMin: c.tempMin, tempMax: c.tempMax, humMin: c.humMin, humMax: c.humMax };
}

export function readingInRange(spec, temp, humidity) {
  return (
    temp >= spec.tempMin &&
    temp <= spec.tempMax &&
    humidity >= spec.humMin &&
    humidity <= spec.humMax
  );
}

export function outOfRangeReason(spec, temp, humidity) {
  const reasons = [];
  if (temp < spec.tempMin) reasons.push(`温度${temp}℃低于下限${spec.tempMin}℃`);
  if (temp > spec.tempMax) reasons.push(`温度${temp}℃高于上限${spec.tempMax}℃`);
  if (humidity < spec.humMin) reasons.push(`湿度${humidity}%低于下限${spec.humMin}%`);
  if (humidity > spec.humMax) reasons.push(`湿度${humidity}%高于上限${spec.humMax}%`);
  return reasons.join("，");
}

// 建档时校验养护参数，返回错误文案；合法返回 null。
export function validateCureSpec({ cureDays, tempMin, tempMax, humMin, humMax }) {
  if (!(cureDays > 0)) return "养护时长必须大于 0 天";
  if (!(tempMin < tempMax)) return "温度下限必须小于上限";
  if (!(humMin < humMax)) return "湿度下限必须小于上限";
  if (humMin < 0 || humMax > 100) return "湿度范围必须在 0%～100% 之间";
  if (tempMin < -20 || tempMax > 60) return "温度范围超出合理区间（-20℃～60℃）";
  return null;
}

// 登记一条温湿度读数。
// 上一条读数合规，则 [上次读数, 本次读数] 整段计入养护；上一条超标则整段不计（暂停）。
// 越过范围边界时产生「暂停 / 恢复」事件，恢复后从暂停点续算。
export function applyReading(item, { at: atMs, temp, humidity }) {
  const cure = { ...item.cure };
  const spec = envSpec(item);
  const events = [];
  const at = Number(atMs);

  if (!Number.isFinite(at)) throw new Error("读数时间无效");
  if (cure.lastReadingAt && at < Date.parse(cure.lastReadingAt)) {
    throw new Error("读数时间早于上一条温湿度记录");
  }

  if (cure.lastReadingAt) {
    if (cure.inRange === true) {
      cure.accumulatedMs += at - Date.parse(cure.lastReadingAt);
    }
  }

  const nowInRange = readingInRange(spec, temp, humidity);
  const wasInRange = cure.inRange ?? true; // 首次读数前按入室合规处理

  if (!nowInRange && wasInRange) {
    cure.pausedAt = new Date(at).toISOString();
    cure.pauseReason = outOfRangeReason(spec, temp, humidity);
    events.push({
      at: new Date(at).toISOString(),
      step: "暂停",
      note: `温湿度超标（${cure.pauseReason}），养护计时暂停`,
    });
  } else if (nowInRange && cure.inRange === false) {
    events.push({
      at: new Date(at).toISOString(),
      step: "恢复",
      note: `温湿度回到范围（${temp}℃ / ${humidity}%），从暂停点续算养护计时`,
    });
    cure.pausedAt = null;
    cure.pauseReason = null;
  }

  cure.lastReadingAt = new Date(at).toISOString();
  cure.inRange = nowInRange;

  const reading = {
    at: cure.lastReadingAt,
    temp,
    humidity,
    inRange: nowInRange,
  };

  return {
    item: { ...item, cure, env: [...(item.env || []), reading] },
    events,
  };
}

// 截至 nowMs 的养护计时情况。
export function cureProgress(item, nowMs) {
  const c = item.cure;
  let effectiveMs = c.accumulatedMs || 0;
  if (c.lastReadingAt && c.inRange === true) {
    effectiveMs += Math.max(0, nowMs - Date.parse(c.lastReadingAt));
  }
  const done = effectiveMs >= c.requiredMs;
  return {
    effectiveMs: Math.min(effectiveMs, c.requiredMs),
    requiredMs: c.requiredMs,
    remainingMs: Math.max(0, c.requiredMs - effectiveMs),
    ratio: Math.min(1, effectiveMs / c.requiredMs),
    done,
    // 到期后即便超标也不再暂停
    paused: !done && c.pausedAt != null,
    pauseReason: done ? null : c.pauseReason,
    lastReadingAt: c.lastReadingAt,
  };
}

// 时间自然流逝带来的流转：养护计时满足要求 -> 待初评。幂等。
export function advance(item, nowMs) {
  const events = [];
  if (item.status === STATUS.CURING && cureProgress(item, nowMs).done) {
    const days = item.cure.requiredMs / DAY_MS;
    events.push({
      at: new Date(nowMs).toISOString(),
      step: "养护",
      note: `有效养护时长已满${days}天，进入待初评`,
    });
    return { item: { ...item, status: STATUS.PENDING_INITIAL }, events };
  }
  return { item, events };
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("评分必须是 0～100 的数字");
  }
  return score;
}

function testRecord(kind, payload, atMs) {
  return {
    at: new Date(atMs).toISOString(),
    kind,
    paper: String(payload.paper || "").trim(),
    water: String(payload.water || "").trim(),
    speed: String(payload.speed || "").trim(),
    colorLayer: String(payload.colorLayer || "").trim(),
    sediment: payload.sediment === SEDIMENT_YES ? SEDIMENT_YES : SEDIMENT_NO,
    score: normalizeScore(payload.score),
  };
}

// 初评：养护未到期不能评；达到 85 分才进入待复磨，否则转重点观察。
export function startInitial(item, payload, nowMs) {
  if (item.status !== STATUS.PENDING_INITIAL) {
    throw new Error(`当前状态为「${item.status}」，不能初评`);
  }
  if (!cureProgress(item, nowMs).done) {
    throw new Error("养护未到期，不能初评");
  }
  if (item.initial) throw new Error("该墨锭已做过初评");

  const test = testRecord("初评", payload, nowMs);
  let next = { status: STATUS.WATCH, watchReason: `初评${test.score}分，未达${INITIAL_PASS_SCORE}分` };
  let note = `初评${test.score}分，未达${INITIAL_PASS_SCORE}分，转重点观察`;
  if (test.score >= INITIAL_PASS_SCORE) {
    next = { status: STATUS.PENDING_REGRIND, watchReason: null };
    note = `初评${test.score}分，达到${INITIAL_PASS_SCORE}分，进入待复磨；满24小时后复磨才能定级`;
  }

  const events = [{ at: test.at, step: "初评", note }];
  return {
    item: {
      ...item,
      ...next,
      initial: test,
      tests: [...(item.tests || []), test],
    },
    events,
  };
}

export function regrindAvailableAt(item) {
  return item.initial ? Date.parse(item.initial.at) + REGRIND_DELAY_MS : null;
}

// 复磨：初评满 24 小时后进行；比初评低 5 分（含）或出现沉淀 -> 重点观察，
// 否则按复磨结果定级。
export function startRegrind(item, payload, nowMs) {
  if (item.status !== STATUS.PENDING_REGRIND) {
    throw new Error(`当前状态为「${item.status}」，不能复磨`);
  }
  if (!item.initial) throw new Error("缺少初评记录，不能复磨");

  const availableAt = regrindAvailableAt(item);
  if (nowMs < availableAt) {
    throw new Error(`复磨需在初评24小时后进行，还需等待${formatDuration(availableAt - nowMs)}`);
  }
  if (item.regrind) throw new Error("该墨锭已复磨定级");

  const test = testRecord("复磨", payload, nowMs);
  const drop = item.initial.score - test.score;
  const hasSediment = test.sediment === SEDIMENT_YES;
  const watchReasons = [];
  if (drop >= REGRIND_DROP_LIMIT) {
    watchReasons.push(`复磨${test.score}分比初评${item.initial.score}分低${drop}分`);
  }
  if (hasSediment) watchReasons.push("复磨出现沉淀");

  let next;
  let note;
  if (watchReasons.length) {
    const reason = watchReasons.join("，");
    next = { status: STATUS.WATCH, watchReason: reason, gradeScore: null };
    note = `${reason}，转重点观察`;
  } else {
    next = { status: STATUS.GRADED, watchReason: null, gradeScore: test.score };
    note = `复磨${test.score}分（初评${item.initial.score}分），定级完成`;
  }

  const events = [{ at: test.at, step: "复磨", note }];
  return {
    item: {
      ...item,
      ...next,
      regrind: test,
      tests: [...(item.tests || []), test],
    },
    events,
  };
}

export function formatDuration(ms) {
  if (!(ms > 0)) return "已到期";
  const totalMin = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小时`);
  if (!days && minutes) parts.push(`${minutes}分钟`);
  return parts.join("") || "不足1分钟";
}

// 页面对应的「下一步」指引文案。
export function nextStep(item, nowMs) {
  switch (item.status) {
    case STATUS.CURING: {
      const p = cureProgress(item, nowMs);
      if (!p.lastReadingAt) {
        return `等待首次温湿度登记；计划养护${formatDuration(p.requiredMs)}`;
      }
      if (p.paused) {
        return `温湿度超标计时暂停（${p.pauseReason}），回到范围后从暂停点续算；养护还需${formatDuration(p.remainingMs)}`;
      }
      return `养护中，还需${formatDuration(p.remainingMs)}`;
    }
    case STATUS.PENDING_INITIAL:
      return "养护已到期，可以进行初评";
    case STATUS.PENDING_REGRIND: {
      const avail = regrindAvailableAt(item);
      if (nowMs < avail) {
        const when = new Date(avail).toLocaleString("zh-CN", { hour12: false });
        return `初评${item.initial.score}分已完成，${when}后才可复磨，还需等待${formatDuration(avail - nowMs)}`;
      }
      return `初评${item.initial.score}分已满24小时，可以复磨定级`;
    }
    case STATUS.GRADED:
      return `已定级，定级评分 ${item.gradeScore} 分`;
    case STATUS.WATCH:
      return `重点观察：${item.watchReason || "试磨结果异常，需人工复核"}`;
    default:
      return item.status || "";
  }
}
