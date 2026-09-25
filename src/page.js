// 页面：按批次分组展示剩余养护时间、暂停原因和下一步，并保留每次温湿度与试磨记录。
export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; }
    main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; }
    input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; margin-top:12px; }
    button.secondary { background:#69736a; }
    #msg { margin:14px 28px 0; padding:10px 14px; border-radius:6px; display:none; }
    #msg.ok { display:block; background:#e6efe0; border:1px solid var(--line); color:var(--accent); }
    #msg.err { display:block; background:#f5e4df; border:1px solid #d8b3a7; color:var(--warn); }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; }
    .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
    .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .batch { margin-bottom:18px; }
    .batch > h3 { margin:0 0 10px; font-size:15px; color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; align-content:start; }
    .cardHead { display:flex; align-items:center; gap:8px; }
    .cardHead h3 { margin:0; flex:1; }
    .meta { color:var(--muted); font-size:13px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; white-space:nowrap; }
    .warnPill { background:#f5e4df; border-color:#d8b3a7; color:var(--warn); }
    .next { background:#f4f7f1; border:1px solid var(--line); border-radius:6px; padding:8px; font-size:13px; }
    .hint { font-size:12px; color:var(--muted); margin:6px 0 2px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:120px; overflow:auto; font-size:13px; }
    .logs b { display:block; margin-bottom:4px; }
    .warn { color:var(--warn); font-weight:700; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>墨锭试磨室</h1><div class="meta">养护计时 · 初评 · 复磨定级，判定规则与页面分层，全程留痕</div></div>
    <button id="reload">刷新</button>
  </header>
  <div id="msg"></div>
  <main>
    <section>
      <form id="createForm"><h2>墨锭入室</h2><div id="createFields"></div><button>入室建档</button></form>
      <form id="envForm" style="margin-top:14px"><h2>温湿度记录</h2>
        <label>选择墨锭（仅养护中）</label><select id="envSelect"></select>
        <label>温度（℃）</label><input name="temperature" type="number" step="0.1" required>
        <label>湿度（%）</label><input name="humidity" type="number" step="0.1" required>
        <label>备注</label><input name="note">
        <button>提交环境记录</button>
      </form>
      <form id="testForm" style="margin-top:14px"><h2>试磨记录</h2>
        <label>选择墨锭（待初评 / 待复磨）</label><select id="testSelect"></select>
        <div class="hint" id="testHint"></div>
        <div id="testFields"></div>
        <label>沉淀情况</label><select name="sediment"><option>无沉淀</option><option>有沉淀</option></select>
        <label>评分</label><input name="score" type="number" min="0" max="100" step="1" required>
        <button>提交试磨</button>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar">
        <select id="statusFilter"></select>
        <input id="search" placeholder="搜索编号、批次或关键词">
      </div>
      <div id="batches"></div>
    </section>
  </main>
  <script>
    var STAGES = ['养护中', '待初评', '待复磨', '已试磨', '重点观察'];
    var createFields = [
      ['code', '墨锭编号', 'text', true, '如 IS-007'],
      ['batch', '生产批次', 'text', true, '如 P2026-09-C'],
      ['smokeSource', '烟料来源', 'text', false, ''],
      ['glueRatio', '胶料比例', 'text', false, ''],
      ['ageYears', '存放年限', 'number', false, ''],
      ['storage', '存放位置', 'text', false, ''],
      ['curingHours', '养护时长（小时）', 'number', true, '如 96'],
      ['tempMin', '温度下限（℃）', 'number', true, '18'],
      ['tempMax', '温度上限（℃）', 'number', true, '26'],
      ['humidityMin', '湿度下限（%）', 'number', true, '55'],
      ['humidityMax', '湿度上限（%）', 'number', true, '70']
    ];
    var testFields = [['paper', '试磨纸张'], ['water', '加水量'], ['speed', '出墨速度'], ['colorLayer', '墨色层次']];
    var createForm = document.querySelector('#createForm');
    var envForm = document.querySelector('#envForm');
    var testForm = document.querySelector('#testForm');
    var envSelect = document.querySelector('#envSelect');
    var testSelect = document.querySelector('#testSelect');
    var testHint = document.querySelector('#testHint');
    var statsEl = document.querySelector('#stats');
    var batchesEl = document.querySelector('#batches');
    var statusFilter = document.querySelector('#statusFilter');
    var searchEl = document.querySelector('#search');
    var msgEl = document.querySelector('#msg');
    var items = [];
    var clockSkew = 0;
    var msgTimer = null;

    function nowMs() { return Date.now() + clockSkew; }
    function post(obj) { return { method: 'POST', body: JSON.stringify(obj) }; }
    async function api(path, options) {
      var res = await fetch(path, options && options.body ? Object.assign({}, options, { headers: { 'Content-Type': 'application/json' } }) : options);
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function showMsg(text, isErr) {
      msgEl.textContent = text;
      msgEl.className = isErr ? 'err' : 'ok';
      clearTimeout(msgTimer);
      msgTimer = setTimeout(function () { msgEl.className = ''; }, 8000);
    }
    function fmtDur(ms) {
      var total = Math.max(0, Math.round(ms / 1000));
      var d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60);
      if (d) return d + '天' + h + '小时';
      if (h) return h + '小时' + (m ? m + '分' : '');
      return m + '分';
    }
    function fmtTime(at) {
      var d = new Date(at);
      if (isNaN(d)) return at || '';
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    function remainingMs(item) {
      var c = item.curing;
      if (!c) return 0;
      var effective = c.accumulatedMs || 0;
      if (c.running && c.lastTickAt) effective += Math.max(0, nowMs() - new Date(c.lastTickAt).getTime());
      return Math.max(0, (c.requiredHours || 0) * 3600000 - effective);
    }
    function esc(value) {
      return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function renderForms() {
      document.querySelector('#createFields').innerHTML = createFields.map(function (f) {
        return '<label>' + f[1] + (f[3] ? '（必填）' : '') + '</label><input name="' + f[0] + '" type="' + f[2] + '"' + (f[3] ? ' required' : '') + (f[4] ? ' placeholder="' + f[4] + '"' : '') + '>';
      }).join('');
      document.querySelector('#testFields').innerHTML = testFields.map(function (f) {
        return '<label>' + f[1] + '</label><input name="' + f[0] + '">';
      }).join('');
      statusFilter.innerHTML = '<option value="">全部状态</option>' + STAGES.map(function (s) { return '<option>' + s + '</option>'; }).join('');
    }
    function updateTestHint() {
      var item = items.find(function (i) { return i.id === testSelect.value; });
      if (!item) { testHint.textContent = '养护到期后才能初评；初评达 85 分进入待复磨，满 24 小时后复磨定级。'; return; }
      if (item.status === '待初评') {
        testHint.textContent = item.code + ' 本次为初评：≥85 分转待复磨，未达 85 分转重点观察。';
      } else {
        var wait = item.view ? item.view.regrindWaitMs : 0;
        testHint.textContent = item.code + ' 本次为复磨：' + (wait > 0 ? '还需静置 ' + fmtDur(wait) + '；' : '') + '比初评低 5 分或出现沉淀转重点观察，否则按复磨分定级。';
      }
    }
    function cardHtml(item) {
      var c = item.curing || {};
      var env = item.envRange;
      var head = '<div class="cardHead"><h3>' + esc(item.code) + '</h3><span class="pill">' + esc(item.status) + '</span>'
        + (item.status === '养护中' && c.running === false ? '<span class="pill warnPill">已暂停</span>' : '') + '</div>';
      var meta = '<div class="meta">' + esc([item.smokeSource, item.glueRatio, item.ageYears === '' || item.ageYears == null ? '' : item.ageYears + '年', item.storage].filter(Boolean).join(' · ')) + '</div>';
      var envLine = env ? '<div><b>环境范围</b> ' + esc(env.tempMin + '~' + env.tempMax + '℃ / ' + env.humidityMin + '~' + env.humidityMax + '%') + '</div>' : '';
      var curingLine = '';
      if (c.requiredHours) {
        if (item.status === '养护中') {
          var remain = '<span data-remain="' + esc(item.id) + '">' + fmtDur(remainingMs(item)) + '</span>';
          curingLine = c.running
            ? '<div><b>养护</b> 共 ' + c.requiredHours + ' 小时 · 剩余 ' + remain + '（计时中）</div>'
            : '<div class="warn"><b>养护已暂停</b> ' + esc(c.pauseReason || '环境超标') + ' · 剩余 ' + remain + '</div>';
        } else {
          curingLine = '<div><b>养护</b> 共 ' + c.requiredHours + ' 小时 · 已完成</div>';
        }
      }
      var pauses = (c.pauses && c.pauses.length) ? '<div class="meta">养护暂停 ' + c.pauses.length + ' 次</div>' : '';
      var next = '<div class="next"><b>下一步：</b>' + esc(item.view ? item.view.nextStep : '') + '</div>';
      var tests = (item.tests || []).map(function (t) {
        return '<div>' + fmtTime(t.at) + ' ' + esc(t.stage) + ' <b>' + esc(t.score) + '</b> 分' + (t.sediment ? ' · <span class="warn">有沉淀</span>' : '') + (t.paper ? ' · ' + esc(t.paper) : '') + '</div>';
      }).join('');
      var envLogs = (item.envLogs || []).slice(-4).reverse().map(function (e) {
        return '<div' + (e.inRange ? '' : ' class="warn"') + '>' + fmtTime(e.at) + ' ' + esc(e.temperature) + '℃ / ' + esc(e.humidity) + '%' + (e.inRange ? ' 在范围' : ' 超标') + (e.note ? ' · ' + esc(e.note) : '') + '</div>';
      }).join('');
      var logs = (item.logs || []).slice(-4).reverse().map(function (l) {
        return '<div>' + fmtTime(l.at) + ' ' + esc(l.step) + '：' + esc(l.note) + '</div>';
      }).join('');
      return '<article class="card">' + head + meta + envLine + curingLine + pauses + next
        + '<div class="logs"><b>试磨记录</b>' + (tests || '<div class="meta">暂无</div>') + '</div>'
        + '<div class="logs"><b>温湿度记录</b>' + (envLogs || '<div class="meta">暂无</div>') + '</div>'
        + '<div class="logs"><b>事件</b>' + (logs || '<div class="meta">暂无</div>') + '</div>'
        + '<button class="secondary" data-note="' + esc(item.id) + '">追加备注</button></article>';
    }
    function render() {
      var stats = {};
      STAGES.forEach(function (s) { stats[s] = 0; });
      items.forEach(function (i) { if (stats[i.status] !== undefined) stats[i.status] += 1; });
      statsEl.innerHTML = STAGES.map(function (s) { return '<div class="stat"><span>' + s + '</span><strong>' + stats[s] + '</strong></div>'; }).join('');

      var prevEnv = envSelect.value, prevTest = testSelect.value;
      var curingItems = items.filter(function (i) { return i.status === '养护中'; });
      envSelect.innerHTML = curingItems.length
        ? curingItems.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.code) + ' · ' + (i.curing && i.curing.running === false ? '已暂停' : '计时中') + '</option>'; }).join('')
        : '<option value="">暂无养护中的墨锭</option>';
      var testable = items.filter(function (i) { return i.status === '待初评' || i.status === '待复磨'; });
      testSelect.innerHTML = testable.length
        ? testable.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.code) + ' · ' + (i.status === '待初评' ? '初评' : '复磨') + '</option>'; }).join('')
        : '<option value="">暂无可试磨的墨锭</option>';
      if (curingItems.some(function (i) { return i.id === prevEnv; })) envSelect.value = prevEnv;
      if (testable.some(function (i) { return i.id === prevTest; })) testSelect.value = prevTest;
      updateTestHint();

      var status = statusFilter.value;
      var q = searchEl.value.trim();
      var visible = items.filter(function (i) { return (!status || i.status === status) && (!q || JSON.stringify(i).indexOf(q) >= 0); });
      var groups = {};
      visible.forEach(function (i) { var b = i.batch || '未绑定批次'; (groups[b] = groups[b] || []).push(i); });
      var names = Object.keys(groups).sort();
      batchesEl.innerHTML = names.length ? names.map(function (b) {
        return '<section class="batch"><h3>生产批次：' + esc(b) + '（' + groups[b].length + ' 锭）</h3><div class="grid">' + groups[b].map(cardHtml).join('') + '</div></section>';
      }).join('') : '<div class="panel">暂无墨锭</div>';
      document.querySelectorAll('[data-note]').forEach(function (btn) {
        btn.onclick = async function () {
          var note = prompt('记录备注');
          if (!note) return;
          try { await api('/api/items/' + btn.dataset.note + '/logs', post({ step: '备注', note: note })); await load(); }
          catch (err) { showMsg(err.message, true); }
        };
      });
    }
    async function load() {
      var data = await api('/api/items');
      items = data.items;
      clockSkew = new Date(data.now).getTime() - Date.now();
      render();
    }
    createForm.onsubmit = async function (event) {
      event.preventDefault();
      try {
        await api('/api/items', post(Object.fromEntries(new FormData(createForm).entries())));
        createForm.reset();
        showMsg('已入室建档，开始养护计时');
        await load();
      } catch (err) { showMsg(err.message, true); }
    };
    envForm.onsubmit = async function (event) {
      event.preventDefault();
      if (!envSelect.value) return showMsg('暂无养护中的墨锭', true);
      try {
        var data = await api('/api/items/' + envSelect.value + '/env', post(Object.fromEntries(new FormData(envForm).entries())));
        envForm.reset();
        showMsg(data.result.inRange ? '环境在范围内，养护计时继续' : '环境超标，养护计时已暂停', !data.result.inRange);
        await load();
      } catch (err) { showMsg(err.message, true); }
    };
    testForm.onsubmit = async function (event) {
      event.preventDefault();
      if (!testSelect.value) return showMsg('暂无可试磨的墨锭', true);
      try {
        var data = await api('/api/items/' + testSelect.value + '/test', post(Object.fromEntries(new FormData(testForm).entries())));
        testForm.reset();
        showMsg(data.result.event);
        await load();
      } catch (err) { showMsg(err.message, true); }
    };
    testSelect.onchange = updateTestHint;
    statusFilter.onchange = render;
    searchEl.oninput = render;
    document.querySelector('#reload').onclick = load;
    setInterval(function () {
      document.querySelectorAll('[data-remain]').forEach(function (el) {
        var item = items.find(function (i) { return i.id === el.dataset.remain; });
        if (item) el.textContent = fmtDur(remainingMs(item));
      });
    }, 1000);
    renderForms();
    load().catch(function (err) { showMsg(err.message, true); });
  </script>
</body>
</html>`;
}
