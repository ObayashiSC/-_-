/* =====================================================================
   dashboard-core.js
   みんまちPJ ダッシュボード 共通ロジック
   （index.html と compare.html から読み込んで使います）
   ===================================================================== */

/* ===== 大林組カラーパレット ===== */
const GREEN       = '#00913A';
const GREEN_DARK  = '#00702D';
const GREEN_LIGHT = '#4FBB7A';
const ACCENT      = '#8DC63F';
const BLUE        = '#0067B9';   /* 比較モードのB系統色 */
const BLUE_LIGHT  = '#5AA8E0';
const GRID_COLOR  = '#e6ede9';

/* 「指定なし（全体）」を表す特別な値 */
const ANY = '__ANY__';

/* 少数サンプルの閾値：母数がこれ未満なら「参考値」と警告する */
const SMALL_N = 10;

/* セクションごとのレイアウト（棒の向き・レーダー指定） */
const LAYOUT = {
  gender:           {horizontal:false},
  age:              {horizontal:false},
  residence:        {horizontal:true},
  workplace:        {horizontal:true},
  media:            {horizontal:true},       /* 認知経路（横棒） */
  attachment_stage: {horizontal:false},      /* 愛着段階（縦棒・左から段0→段4） */
};

/* ===== データ読み込み（キャッシュ無効化つき） ===== */
function loadData(dataFile){
  const url = dataFile + '?t=' + Date.now();
  return fetch(url, {cache:'no-store'}).then(res=>{
    if(!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  });
}

/* ===== グラデーション生成 ===== */
function gradH(ctx, area, c1, c2){
  const g = ctx.createLinearGradient(0,0,area.right,0);
  g.addColorStop(0,c1); g.addColorStop(1,c2); return g;
}
function gradV(ctx, area, c1, c2){
  const g = ctx.createLinearGradient(0,area.bottom,0,area.top);
  g.addColorStop(0,c1); g.addColorStop(1,c2); return g;
}

/* =====================================================================
   絞り込み：複数条件（品川かかわり・性別・年代）で会員を抽出
   ===================================================================== */
function filterMembers(data, selection){
  return data.members.filter(m=>{
    for(const f of data.filters){
      const chosen = selection[f.key];
      if(!chosen || chosen === ANY) continue;
      const pool = (f.source === 'segments') ? m.segments : m.tags;
      if(!pool.includes(chosen)) return false;
    }
    return true;
  });
}

/* ===== あるラベル群について、対象会員での該当数を集計 ===== */
function countLabels(members, labels){
  return labels.map(lbl => ({
    label: lbl,
    count: members.filter(m => m.tags.includes(lbl)).length
  }));
}

/* ===== 割合(%)に変換（母数0なら0） ===== */
function toPercent(count, total){
  return total ? (count / total * 100) : 0;
}

/* ===== 値の表示モードに応じた数値・ツールチップ文言 =====
   mode: 'count' | 'percent'
   返り値: {value:数値(グラフ用), tip:ツールチップ文字列} */
function formatValue(count, total, mode){
  if(mode === 'percent'){
    const p = toPercent(count, total);
    return { value: Math.round(p * 10) / 10, tip: `${p.toFixed(1)}%（${count}/${total}）` };
  }
  return { value: count, tip: `${count} 名` };
}

/* ===== 選択内容を人が読める文字列にする ===== */
function selectionText(data, selection){
  const parts = [];
  for(const f of data.filters){
    const v = selection[f.key];
    if(v && v !== ANY) parts.push(v);
  }
  return parts.length ? parts.join('・') : '全体';
}

/* ===== 母数が少ないか判定 ===== */
function isSmall(n){ return n > 0 && n < SMALL_N; }

/* =====================================================================
   プルダウン群を生成（人数表示なし）
   ===================================================================== */
function buildFilters(container, data, state, onChange){
  container.innerHTML = '';
  data.filters.forEach(f=>{
    if(!(f.key in state)) state[f.key] = ANY;
    const wrap = document.createElement('label');
    wrap.className = 'filter-item';
    const opts = [`<option value="${ANY}">すべて</option>`]
      .concat(f.options.map(o=>`<option value="${o}">${o}</option>`)).join('');
    wrap.innerHTML = `<span class="fl-title">${f.title}</span>
      <select data-key="${f.key}">${opts}</select>`;
    const sel = wrap.querySelector('select');
    sel.value = state[f.key];
    sel.addEventListener('change', e=>{ state[f.key] = e.target.value; onChange(); });
    container.appendChild(wrap);
  });
}

/* =====================================================================
   単一ビュー用：1つの棒グラフを描画（mode対応）
   ===================================================================== */
function drawBar(canvas, sec, members, mode, colorSet){
  const cfg = LAYOUT[sec.key] || {horizontal:true};
  const total = members.length;
  let items = countLabels(members, sec.labels).map(it=>{
    const f = formatValue(it.count, total, mode);
    return { label: it.label, count: it.count, value: f.value, tip: f.tip };
  });
  if(cfg.horizontal) items.sort((a,b)=>b.count-a.count);
  const labels = items.map(i=>i.label);
  const values = items.map(i=>i.value);
  const tips   = items.map(i=>i.tip);
  const [c1,c2] = colorSet;
  const isPct = (mode === 'percent');
  const ctx = canvas.getContext('2d');
  return new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{
      label:'該当', data:values, tips:tips, borderRadius:6, borderSkipped:false, maxBarThickness:38,
      backgroundColor:(c)=>{
        const {ctx,chartArea}=c.chart; if(!chartArea) return c1;
        return cfg.horizontal ? gradH(ctx,chartArea,c1,c2) : gradV(ctx,chartArea,c1,c2);
      },
    }]},
    options:{
      indexAxis: cfg.horizontal ? 'y' : 'x',
      responsive:true, maintainAspectRatio:false, animation:{duration:350},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:GREEN_DARK, padding:10,
          callbacks:{label:(c)=>' '+c.dataset.tips[c.dataIndex]}}},
      scales:{
        x:{beginAtZero:true, max: isPct&&cfg.horizontal?100:undefined,
           grid:{color:GRID_COLOR,drawBorder:false},
           ticks:{precision:0,color:'#5c6b63',font:{size:11},
                  /* 横棒→X軸は値(%)、縦棒→X軸はカテゴリ名 */
                  callback:function(v){ return cfg.horizontal ? (isPct? v+'%' : v) : this.getLabelForValue(v); }}},
        y:{beginAtZero:true, max: isPct&&!cfg.horizontal?100:undefined,
           grid:{display:!cfg.horizontal,color:GRID_COLOR,drawBorder:false},
           ticks:{color:'#33413a',font:{size:12},
                  /* 縦棒→Y軸は値(%)、横棒→Y軸はカテゴリ名 */
                  callback:function(v){ return cfg.horizontal ? this.getLabelForValue(v) : (isPct? v+'%' : v); }}}
      }
    }
  });
}

/* =====================================================================
   円（ドーナツ）グラフ用カラーパレット（スライス識別用・大林組系＋補色）
   ===================================================================== */
const PIE_COLORS = [
  '#00913A', '#0067B9', '#8DC63F', '#4FBB7A', '#5AA8E0',
  '#00702D', '#F0A020', '#E0655A', '#9B7BD0', '#3FBFB0',
  '#C0518D', '#7A8A45', '#D08A2C', '#5A9E7A', '#6C7BD0',
  '#B0A020', '#00A0A0', '#A05070', '#70A030', '#805030'
];

/* =====================================================================
   単一ビュー用：円（ドーナツ）グラフを描画（★割合のみ）
   ・各スライス＝該当数、割合＝該当数 ÷ 合計該当数 × 100（合計100%）
   ・複数選択の設問（認知経路・興味/関心）は「回答全体に占める構成比」
   ・legendPos で凡例位置（'right' | 'bottom'）を切り替え
   ===================================================================== */
function drawPie(canvas, sec, members, legendPos){
  const items  = countLabels(members, sec.labels).filter(it => it.count > 0);
  const labels = items.map(i => i.label);
  const counts = items.map(i => i.count);
  const sum    = counts.reduce((a, b) => a + b, 0);
  const colors = labels.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]);
  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{
      data: counts, backgroundColor: colors,
      borderColor: '#fff', borderWidth: 2, hoverOffset: 6
    }]},
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '55%',
      animation: { duration: 400 },
      plugins: {
        legend: {
          position: legendPos || 'right',
          labels: { boxWidth: 12, boxHeight: 12, padding: 8,
                    font: { size: 11 }, color: '#33413a' }
        },
        tooltip: { padding: 10, callbacks: {
          label: (c) => {
            const p = sum ? (c.parsed / sum * 100) : 0;
            return ` ${c.label}：${p.toFixed(1)}%（${c.parsed}件）`;
          }
        }}
      }
    }
  });
}

/* =====================================================================
   時系列（推移）ライン描画：会員登録数の推移／流入経路の推移
   ・data.timeseries.registration … {dates:[], counts:[](日次＝その日の登録者数), cumulative:[]}
   ・data.timeseries.source        … {dates:[], series:[{name,counts(日次),cumulative}]}
   ・絞り込み（性別・年代）には連動しない全体推移のオーバービューです。
   ===================================================================== */
let tsCharts = [];

function drawLineChart(canvas, labels, datasets){
  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: 'bottom',
                  labels: { boxWidth: 12, boxHeight: 12, padding: 10,
                            font: { size: 11 }, color: '#33413a' } },
        tooltip: { padding: 10 }
      },
      scales: {
        x: { grid: { color: GRID_COLOR, drawBorder: false },
             ticks: { color: '#5c6b63', font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: GRID_COLOR, drawBorder: false },
             ticks: { precision: 0, color: '#5c6b63', font: { size: 11 } } }
      }
    }
  });
}

/* 推移カード（絞り込みパネルの下・グラフ一番上に差し込む） */
/* 推移カード用スタイル（合計バッジ・経路別内訳）を一度だけ注入 */
function ensureTsStyle(){
  if(document.getElementById('ts-summary-style')) return;
  const st = document.createElement('style');
  st.id = 'ts-summary-style';
  st.textContent = `
    .ts-total{margin-left:12px;font-size:13px;font-weight:700;color:#00702D;
      background:#eaf6ef;border:1px solid #bfe3cd;border-radius:20px;padding:3px 12px;}
    .ts-total b{font-size:15px;}
    .ts-breakdown{display:flex;flex-wrap:wrap;gap:8px 14px;margin:2px 0 14px;}
    .ts-chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;
      color:#33413a;background:#f3f7f4;border:1px solid #e3ebe6;border-radius:20px;padding:4px 11px;}
    .ts-chip b{font-size:13.5px;color:#1b2a22;}
    .ts-sw{width:11px;height:11px;border-radius:3px;display:inline-block;}
  `;
  document.head.appendChild(st);
}

function renderTimeseries(container, data){
  tsCharts.forEach(c => c.destroy()); tsCharts = [];
  if(!container) return;
  ensureTsStyle();
  container.innerHTML = '';
  const ts = (data && data.timeseries) || {};

  /* ① 会員登録数の推移（緑の折れ線・日次＝その日の登録者数） */
  const reg = ts.registration;
  if(reg && reg.dates && reg.dates.length){
    const modeTag = (reg.mode === 'cumulative') ? '累計' : '日次';
    /* 合計会員数＝日次件数の総和（total があればそれを優先） */
    const regTotal = (reg.total != null)
      ? reg.total
      : (reg.counts || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const card = document.createElement('div'); card.className = 'card col-12';
    card.innerHTML = `<h2><span class="dot"></span>${reg.title}
        <span class="ts-total">合計 <b>${regTotal}</b> 人</span>
        <span class="badge-mode">${modeTag}・登録日</span></h2>
      <div class="chart-box" style="height:300px"><canvas></canvas></div>`;
    container.appendChild(card);
    tsCharts.push(drawLineChart(card.querySelector('canvas'), reg.dates, [{
      label: '会員登録数', data: reg.counts,
      borderColor: GREEN, backgroundColor: 'rgba(0,145,58,.12)',
      borderWidth: 2.5, pointBackgroundColor: GREEN, pointRadius: 4,
      tension: .25, fill: true
    }]));
  }

  /* ② 流入経路の推移（経路ごとに1本・今回は5本） */
  const src = ts.source;
  if(src && src.dates && src.dates.length && src.series && src.series.length){
    const modeTag = (src.mode === 'cumulative') ? '累計' : '日次';
    /* 経路ごとの合計人数（total があればそれを優先） */
    const srcGrand = src.series.reduce((a, s) =>
      a + (s.total != null ? s.total : (s.counts || []).reduce((x, y) => x + (Number(y) || 0), 0)), 0);
    /* 経路名 〇人 を色付きチップで並べる */
    const perRoute = src.series.map((s, i) => {
      const col = PIE_COLORS[i % PIE_COLORS.length];
      const t = (s.total != null) ? s.total : (s.counts || []).reduce((x, y) => x + (Number(y) || 0), 0);
      return `<span class="ts-chip"><span class="ts-sw" style="background:${col}"></span>${s.name} <b>${t}</b>人</span>`;
    }).join('');
    const card = document.createElement('div'); card.className = 'card col-12';
    card.innerHTML = `<h2><span class="dot"></span>${src.title}
        <span class="ts-total">合計 <b>${srcGrand}</b> 人</span>
        <span class="badge-mode">${modeTag}・流入経路別</span></h2>
      <div class="ts-breakdown">${perRoute}</div>
      <div class="chart-box" style="height:340px"><canvas></canvas></div>`;
    container.appendChild(card);
    const datasets = src.series.map((s, i) => {
      const col = PIE_COLORS[i % PIE_COLORS.length];
      return { label: s.name, data: s.counts,
               borderColor: col, backgroundColor: col,
               borderWidth: 2.5, pointBackgroundColor: col, pointRadius: 4,
               tension: .25, fill: false };
    });
    tsCharts.push(drawLineChart(card.querySelector('canvas'), src.dates, datasets));
  }
}

/* ===== 円グラフ用CSV生成（割合のみ・構成比） ===== */
function buildPieCsv(data, members, selectionLabel){
  const rows = [];
  rows.push(['# みんまちPJ アンケート集計（円グラフ・構成比）']);
  rows.push(['# 絞り込み条件', selectionLabel]);
  rows.push(['# 対象人数', members.length + '名']);
  rows.push(['# 生成', data.meta.generated_at || '']);
  rows.push([]);
  rows.push(['カテゴリ', '項目', '該当数', '合計該当数', '構成比(%)']);
  data.sections.forEach(sec => {
    const items = countLabels(members, sec.labels);
    const sum = items.reduce((a, b) => a + b.count, 0);
    items.forEach(it => {
      const pct = sum ? (it.count / sum * 100).toFixed(1) : '0.0';
      rows.push([sec.title, it.label, it.count, sum, pct]);
    });
  });
  return rows.map(r => r.map(csvEsc).join(',')).join('\r\n');
}

/* ===== CSVエスケープ ===== */
function csvEsc(v){
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

/* ===== 単一ビュー用CSV生成 ===== */
function buildCsv(data, members, selectionLabel){
  const rows = [];
  rows.push(['# みんまちPJ アンケート集計']);
  rows.push(['# 絞り込み条件', selectionLabel]);
  rows.push(['# 対象人数', members.length + '名']);
  rows.push(['# 生成', data.meta.generated_at || '']);
  rows.push([]);
  rows.push(['カテゴリ','項目','該当数','対象人数','割合(%)']);
  data.sections.forEach(sec=>{
    countLabels(members, sec.labels).forEach(it=>{
      const pct = members.length ? (it.count/members.length*100).toFixed(1) : '0.0';
      rows.push([sec.title, it.label, it.count, members.length, pct]);
    });
  });
  return rows.map(r=>r.map(csvEsc).join(',')).join('\r\n');
}

/* ===== CSVダウンロード（Excel文字化け防止のBOM付きUTF-8） ===== */
function downloadCsv(filename, csvText){
  const blob = new Blob(['\uFEFF' + csvText], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ===== 日付文字列（ファイル名用 YYYYMMDD_HHMM） ===== */
function stamp(){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
