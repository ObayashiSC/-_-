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

/* セクションごとのレイアウト（列幅と棒の向き） */
const LAYOUT = {
  gender:    {horizontal:false},
  age:       {horizontal:false},
  residence: {horizontal:true},
  workplace: {horizontal:true},
  interest:  {horizontal:true},
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
   selection = { segment:値orANY, gender:値orANY, age:値orANY }
   ===================================================================== */
function filterMembers(data, selection){
  return data.members.filter(m=>{
    for(const f of data.filters){
      const chosen = selection[f.key];
      if(!chosen || chosen === ANY) continue;      /* 未指定はスルー */
      const pool = (f.source === 'segments') ? m.segments : m.tags;
      if(!pool.includes(chosen)) return false;      /* 1つでも外れたら除外 */
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

/* ===== 選択内容を人が読める文字列にする（例: 港南勤務者・男性・30代） ===== */
function selectionText(data, selection){
  const parts = [];
  for(const f of data.filters){
    const v = selection[f.key];
    if(v && v !== ANY) parts.push(v);
  }
  return parts.length ? parts.join('・') : '全体';
}

/* =====================================================================
   プルダウン群を生成（人数表示なし）
   container: 挿入先要素 / data: JSON / state: selectionオブジェクト
   onChange: 変更時コールバック
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
    sel.addEventListener('change', e=>{
      state[f.key] = e.target.value;
      onChange();
    });
    container.appendChild(wrap);
  });
}

/* =====================================================================
   1つの棒グラフカードを描画して返す（Chartインスタンス）
   ===================================================================== */
function drawBar(canvas, sec, members, colorSet){
  const cfg = LAYOUT[sec.key] || {horizontal:true};
  let items = countLabels(members, sec.labels);
  if(cfg.horizontal) items.sort((a,b)=>b.count-a.count);
  const labels = items.map(i=>i.label);
  const counts = items.map(i=>i.count);
  const [c1,c2] = colorSet;
  const ctx = canvas.getContext('2d');
  return new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{
      label:'該当者数', data:counts, borderRadius:6, borderSkipped:false, maxBarThickness:38,
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
          callbacks:{label:(c)=>` ${c.parsed[cfg.horizontal?'x':'y']} 名`}}},
      scales:{
        x:{beginAtZero:true, grid:{color:GRID_COLOR,drawBorder:false}, ticks:{precision:0,color:'#5c6b63',font:{size:11}}},
        y:{grid:{display:!cfg.horizontal,color:GRID_COLOR,drawBorder:false}, ticks:{color:'#33413a',font:{size:12}}}
      }
    }
  });
}

/* =====================================================================
   CSV文字列を生成（対象会員での集計結果）
   selectionLabel: 見出しに入れる絞り込み条件の文字列
   ===================================================================== */
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
      const pct = members.length ? (it.count / members.length * 100).toFixed(1) : '0.0';
      rows.push([sec.title, it.label, it.count, members.length, pct]);
    });
  });
  /* CSVエスケープ */
  const esc = v => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  return rows.map(r=>r.map(esc).join(',')).join('\r\n');
}

/* ===== CSVをダウンロード（Excelで文字化けしないようBOM付きUTF-8） ===== */
function downloadCsv(filename, csvText){
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvText], {type:'text/csv;charset=utf-8;'});
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
