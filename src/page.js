// 页面层：只负责 HTML 结构与前端交互展示，判定规则由服务端返回。
import { STATUS, STATUSES, SEDIMENT_YES, SEDIMENT_NO } from "./rules.js";

export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --hold:#8a6d2f; --ok:#3f6b4a; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; font-size:17px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat,.batch { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .range { display:grid; grid-template-columns:1fr auto 1fr; gap:6px; align-items:center; } .range input { padding:8px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:22px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .batch { margin-bottom:14px; padding:14px 16px; } .batch-head { display:flex; justify-content:space-between; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:10px; }
    .batch-head h3 { font-size:16px; } .batch-meta { color:var(--muted); font-size:13px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; } .card { display:grid; gap:7px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 9px; font-size:12px; font-weight:700; }
    .pill[data-s="${STATUS.CURING}"] { color:var(--hold); border-color:#d8c89a; background:#faf5e8; }
    .pill[data-s="${STATUS.PENDING_INITIAL}"], .pill[data-s="${STATUS.PENDING_REGRIND}"] { color:#34506e; border-color:#b9cbe0; background:#eef4fb; }
    .pill[data-s="${STATUS.GRADED}"] { color:var(--ok); border-color:#bcd9c2; background:#eef7f0; }
    .pill[data-s="${STATUS.WATCH}"] { color:var(--warn); border-color:#dfbcb2; background:#fbf0ed; }
    .next { font-size:13px; padding:8px 10px; border-radius:6px; background:#f4f6f2; border:1px dashed var(--line); }
    .next.warn { color:var(--warn); border-color:#dfbcb2; background:#fbf0ed; font-weight:700; }
    .bar { height:8px; border-radius:999px; background:#e6eae2; overflow:hidden; } .bar > i { display:block; height:100%; background:var(--accent); }
    .bar.paused > i { background:var(--warn); }
    .records { border-top:1px solid var(--line); padding-top:8px; margin-top:4px; max-height:230px; overflow:auto; font-size:13px; display:grid; gap:4px; }
    .records .rec { color:var(--muted); } .records .rec b { color:var(--ink); font-weight:700; }
    .tag { font-size:11px; border:1px solid var(--line); border-radius:4px; padding:0 5px; color:var(--muted); margin-right:5px; }
    .tag.env { color:#34506e; } .tag.test { color:var(--accent); } .tag.flow { color:var(--warn); }
    .actions { display:flex; gap:8px; flex-wrap:wrap; }
    .scoreline { display:flex; gap:14px; font-size:13px; } .scoreline b { font-size:16px; }
    .err { color:var(--warn); font-size:13px; margin-top:8px; white-space:pre-wrap; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>墨锭试磨室</h1><div class="meta">入室绑定批次与养护要求 · 温湿度超标计时暂停 · 初评达标后满24小时复磨定级</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <section>
      <form id="createForm" class="panel">
        <h2>墨锭入室建档</h2>
        <div class="row">
          <div><label>墨锭编号 *</label><input name="code" required placeholder="IS-301"></div>
          <div><label>生产批次 *</label><input name="batch" required list="batchList" placeholder="2026春-松烟"></div>
        </div>
        <datalist id="batchList"></datalist>
        <div class="row">
          <div><label>烟料来源</label><input name="smokeSource" placeholder="黄山松烟"></div>
          <div><label>胶料比例</label><input name="glueRatio" placeholder="7.5%"></div>
        </div>
        <div class="row">
          <div><label>存放年限</label><input name="ageYears" type="number" min="0" step="1"></div>
          <div><label>存放位置</label><input name="storage" placeholder="恒湿柜B"></div>
        </div>
        <label>养护时长（天）*</label><input name="cureDays" type="number" min="1" step="1" value="3" required>
        <label>温度范围（℃）*</label>
        <div class="range"><input name="tempMin" type="number" step="0.1" value="18"><span>～</span><input name="tempMax" type="number" step="0.1" value="25"></div>
        <label>湿度范围（%RH）*</label>
        <div class="range"><input name="humMin" type="number" step="1" value="55"><span>～</span><input name="humMax" type="number" step="1" value="70"></div>
        <label>入室即时温湿度（留空则暂不开始计时）</label>
        <div class="row">
          <div><input name="temp" type="number" step="0.1" placeholder="温度 ℃"></div>
          <div><input name="humidity" type="number" step="1" placeholder="湿度 %"></div>
        </div>
        <div style="margin-top:12px"><button>入室建档</button></div>
        <div class="err" id="createErr"></div>
      </form>
      <form id="envForm" class="panel" style="margin-top:14px">
        <h2>温湿度登记（计时依据）</h2>
        <label>登记范围</label>
        <select name="scope"><option value="batch">按生产批次（该批次养护中的墨锭）</option><option value="item">单个墨锭</option></select>
        <div class="row" style="margin-top:0">
          <div><label>批次</label><input name="batch" list="batchList" placeholder="选择批次"></div>
          <div><label>墨锭</label><select name="id" id="envItemSelect"></select></div>
        </div>
        <div class="row">
          <div><label>温度 ℃ *</label><input name="temp" type="number" step="0.1" required></div>
          <div><label>湿度 %RH *</label><input name="humidity" type="number" step="1" required></div>
        </div>
        <label>读数时间（留空为现在）</label><input name="at" type="datetime-local">
        <div style="margin-top:12px"><button>提交温湿度</button></div>
        <div class="err" id="envErr"></div>
        <div class="meta" style="margin-top:8px">读数落在范围内才计时；超标期间暂停，回到范围后从暂停点续算。</div>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar">
        <select id="statusFilter"><option value="">全部状态</option>${STATUSES.map((s) => `<option>${s}</option>`).join("")}</select>
        <select id="batchFilter"><option value="">全部批次</option></select>
        <input id="search" placeholder="搜索编号 / 烟料 / 位置">
        <button class="secondary" type="button" id="clearFilter">清除筛选</button>
      </div>
      <div id="batches"></div>
    </section>
  </main>

<script>
const STATUSES = ${JSON.stringify(STATUSES)};
const SEDIMENT_YES = ${JSON.stringify(SEDIMENT_YES)};
const SEDIMENT_NO = ${JSON.stringify(SEDIMENT_NO)};
let items = [];

const $ = (sel) => document.querySelector(sel);
async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { "Content-Type": "application/json" } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function fmtAt(at) {
  if (!at) return "—";
  const d = new Date(at);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") +
    " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}

function testFormHtml(item, kind) {
  const title = kind === "initial" ? "初评" : "复磨";
  return '<form class="testform" data-id="' + esc(item.id) + '" data-kind="' + kind + '">'
    + '<label>试磨纸张</label><input name="paper" placeholder="宣纸" required>'
    + '<label>加水量</label><input name="water" placeholder="20滴">'
    + '<div class="row"><div><label>出墨速度</label><input name="speed" placeholder="快 / 中 / 慢"></div>'
      + '<div><label>墨色层次</label><input name="colorLayer" placeholder="乌黑发亮"></div></div>'
    + '<div class="row"><div><label>评分（0-100）*</label><input name="score" type="number" min="0" max="100" step="1" required></div>'
      + '<div><label>沉淀情况 *</label><select name="sediment"><option>' + SEDIMENT_NO + '</option><option>' + SEDIMENT_YES + '</option></select></div></div>'
    + '<div style="margin-top:10px" class="actions"><button>提交' + title + '</button><button type="button" class="secondary cancel">取消</button></div>'
    + '<div class="err"></div></form>';
}

function cardHtml(item) {
  const curing = item.status === ${JSON.stringify(STATUS.CURING)};
  let progress = "";
  if (curing || item.status === ${JSON.stringify(STATUS.PENDING_INITIAL)}) {
    const p = item.progress;
    const pct = Math.round(p.ratio * 100);
    progress =
      '<div class="bar' + (p.paused ? " paused" : "") + '"><i style="width:' + pct + '%"></i></div>'
      + '<div class="meta">' + (p.paused ? "已暂停 · " : "") + "有效养护 " + pct + "% · 剩余 " + esc(p.remainingText)
      + (p.lastReadingAt ? " · 最近读数 " + fmtAt(p.lastReadingAt) : " · 尚未登记温湿度") + "</div>"
      + (p.paused ? '<div class="next warn">暂停原因：' + esc(p.pauseReason) + "</div>" : "");
  }

  const scoreLine = item.initial
    ? '<div class="scoreline"><span>初评 <b>' + item.initial.score + '</b></span>'
      + (item.regrind ? '<span>复磨 <b>' + item.regrind.score + '</b></span>' : '<span class="meta">复磨未定级</span>')
      + (item.gradeScore != null ? '<span>定级 <b>' + item.gradeScore + "</b></span>" : "") + "</div>"
    : "";

  const actions = {
    ${JSON.stringify(STATUS.CURING)}: '<span class="meta">养护未到期，不能初评</span>',
    ${JSON.stringify(STATUS.PENDING_INITIAL)}: '<button data-act="initial" data-id="' + esc(item.id) + '">录入初评</button>',
    ${JSON.stringify(STATUS.PENDING_REGRIND)}: item.regrindReady
        ? '<button data-act="regrind" data-id="' + esc(item.id) + '">录入复磨定级</button>'
        : '<span class="meta">初评后未满24小时，复磨窗口未到</span>',
    ${JSON.stringify(STATUS.GRADED)}: '<span class="meta">流程结束</span>',
    ${JSON.stringify(STATUS.WATCH)}: '<span class="meta">等待老师傅复核</span>',
  }[item.status] || "";

  const envRecords = (item.env || []).slice().reverse().map((r) =>
    '<div class="rec"><span class="tag env">温湿度</span>' + fmtAt(r.at)
    + " · " + r.temp + "℃ / " + r.humidity + "%"
    + (r.inRange ? "" : ' <b class="warn">超标</b>') + "</div>").join("");

  const testRecords = (item.tests || []).slice().reverse().map((t) =>
    '<div class="rec"><span class="tag test">' + esc(t.kind) + "</span>" + fmtAt(t.at)
    + " · 评分 <b>" + t.score + "</b> · " + esc(t.sediment)
    + (t.paper ? " · " + esc(t.paper) : "") + "</div>").join("");

  const flowLogs = (item.logs || []).filter((l) =>
      ["建档","暂停","恢复","养护","初评","复磨","迁移"].includes(l.step)).slice().reverse().map((l) =>
    '<div class="rec"><span class="tag flow">' + esc(l.step) + "</span>" + fmtAt(l.at) + " · " + esc(l.note) + "</div>").join("");

  return '<article class="card">'
    + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'
    + "<h3>" + esc(item.code) + '</h3><span class="pill" data-s="' + esc(item.status) + '">' + esc(item.status) + "</span></div>"
    + '<div class="meta">' + esc(item.batch) + " · " + esc(item.smokeSource || "—") + " · 胶 " + esc(item.glueRatio || "—")
      + " · 陈 " + esc(item.ageYears ?? "—") + " 年 · " + esc(item.storage || "—") + "</div>"
    + '<div class="meta">入室 ' + fmtAt(item.enteredAt) + " · 养护要求 " + esc(item.cureText)
      + " · 环境 " + esc(item.envText) + "</div>"
    + progress + scoreLine
    + '<div class="next' + (item.status === ${JSON.stringify(STATUS.WATCH)} ? " warn" : "") + '">下一步：' + esc(item.nextStep) + "</div>"
    + '<div class="actions">' + actions + "</div>"
    + (item.status === ${JSON.stringify(STATUS.WATCH)} && item.watchReason ? '<div class="next warn">' + esc(item.watchReason) + "</div>" : "")
    + '<div class="records"><b>温湿度记录</b>' + (envRecords || '<div class="rec">暂无</div>') + "</div>"
    + '<div class="records"><b>试磨记录</b>' + (testRecords || '<div class="rec">暂无</div>') + "</div>"
    + '<div class="records"><b>流程记录</b>' + flowLogs + "</div>"
    + "</article>";
}

function render() {
  // 批次下拉
  const batches = [...new Set(items.map((i) => i.batch))];
  const batchOpts = batches.map((b) => '<option value="' + esc(b) + '">').join("");
  $("#batchList").innerHTML = batchOpts;
  const bf = $("#batchFilter");
  const bfVal = bf.value;
  bf.innerHTML = '<option value="">全部批次</option>' + batches.map((b) => '<option>' + esc(b) + "</option>").join("");
  bf.value = batches.includes(bfVal) ? bfVal : "";

  $("#envItemSelect").innerHTML = items
    .filter((i) => i.status === ${JSON.stringify(STATUS.CURING)})
    .map((i) => '<option value="' + esc(i.id) + '">' + esc(i.code) + " · " + esc(i.batch) + "</option>").join("");

  $("#stats").innerHTML = STATUSES.map((s) =>
    '<div class="stat"><span>' + s + "</span><strong>" + items.filter((i) => i.status === s).length + "</strong></div>").join("");

  const status = $("#statusFilter").value;
  const batch = bf.value;
  const q = $("#search").value.trim();
  const visible = items.filter((i) =>
    (!status || i.status === status) &&
    (!batch || i.batch === batch) &&
    (!q || (i.code + i.batch + i.smokeSource + i.storage).includes(q)));

  const groups = new Map();
  for (const i of visible) {
    if (!groups.has(i.batch)) groups.set(i.batch, []);
    groups.get(i.batch).push(i);
  }
  $("#batches").innerHTML = [...groups.entries()].map(([b, list]) => {
    const pausing = list.filter((i) => i.progress && i.progress.paused).length;
    return '<div class="batch"><div class="batch-head"><h3>' + esc(b) + '</h3>'
      + '<span class="batch-meta">' + list.length + " 锭"
      + (pausing ? ' · <span class="warn">' + pausing + " 锭计时暂停</span>" : "")
      + '</span></div><div class="grid">' + list.map(cardHtml).join("") + "</div></div>";
  }).join("") || '<div class="panel meta">没有符合条件的墨锭</div>';

  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => {
      const item = items.find((i) => i.id === btn.dataset.id);
      const host = btn.closest(".actions");
      host.innerHTML = testFormHtml(item, btn.dataset.act);
      const form = host.querySelector(".testform");
      form.querySelector(".cancel").onclick = () => { render(); };
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api("/api/items/" + encodeURIComponent(item.id) + "/" + form.dataset.kind, {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
          });
          await load();
        } catch (err) { form.querySelector(".err").textContent = err.message; }
      };
    };
  });
}

async function load() {
  items = await api("/api/items");
  render();
}

$("#createForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#createErr").textContent = "";
  try {
    await api("/api/items", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
    e.target.reset();
    await load();
  } catch (err) { $("#createErr").textContent = err.message; }
};

$("#envForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#envErr").textContent = "";
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    if (data.scope === "batch") {
      if (!data.batch) throw new Error("请填写或选择批次");
      await api("/api/batches/" + encodeURIComponent(data.batch) + "/readings", { method: "POST", body: JSON.stringify(data) });
    } else {
      if (!data.id) throw new Error("没有养护中的墨锭可选");
      await api("/api/items/" + encodeURIComponent(data.id) + "/readings", { method: "POST", body: JSON.stringify(data) });
    }
    await load();
  } catch (err) { $("#envErr").textContent = err.message; }
};

$("#statusFilter").onchange = render;
$("#batchFilter").onchange = render;
$("#search").oninput = render;
$("#reload").onclick = load;
$("#clearFilter").onclick = () => { $("#statusFilter").value = ""; $("#batchFilter").value = ""; $("#search").value = ""; render(); };

load();
</script>
</body>
</html>`;
}
