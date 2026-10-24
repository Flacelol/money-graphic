const KEY = 'finance-dashboard-v1';
const OPEN_KEY = 'finance-dashboard-opening';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

let tx = load();
let opening = loadOpening();
let group = 'month', filter = 'all', type = 'in';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function loadOpening() {
  try { return parseFloat(localStorage.getItem(OPEN_KEY)) || 0; } catch { return 0; }
}
const net = list => list.reduce((a, x) => a + (x.type === 'in' ? x.amount : -x.amount), 0);

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(tx)); } catch {}
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const money = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const fmtDate = s => new Date(s + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

// ключ и подпись группы для даты
function bucket(dateStr) {
  const d = new Date(dateStr + 'T00:00');
  if (group === 'day') return { k: dateStr, label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) };
  if (group === 'week') {
    const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = m.toISOString().slice(0, 10);
    return { k, label: 'нед. ' + m.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) };
  }
  const k = dateStr.slice(0, 7);
  return { k, label: d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }) };
}

function inRange() {
  const f = $('from').value, t = $('to').value;
  return tx.filter(x => (!f || x.date >= f) && (!t || x.date <= t));
}

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function render() {
  const data = inRange();
  const sumIn = data.filter(x => x.type === 'in').reduce((a, x) => a + x.amount, 0);
  const sumOut = data.filter(x => x.type === 'out').reduce((a, x) => a + x.amount, 0);
  $('sumIn').textContent = '+' + money(sumIn);
  $('sumOut').textContent = '−' + money(sumOut);
  const bal = opening + net(tx);
  $('sumBal').textContent = (bal < 0 ? '−' : '') + money(Math.abs(bal));
  $('sumBal').className = bal >= 0 ? '' : 'out';
  renderList(data);
  renderChart(data);
}

function renderList(data) {
  const ul = $('list');
  ul.innerHTML = '';
  const rows = data.filter(x => filter === 'all' || x.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('empty').hidden = rows.length > 0;
  for (const x of rows) {
    const li = document.createElement('li');
    li.dataset.bucket = bucket(x.date).k;
    const c = x.type === 'in' ? 'var(--in)' : 'var(--out)';
    li.innerHTML = `<span class="dot ${x.type}">${x.type === 'in' ? '↑' : '↓'}</span>
      <span class="meta"><b></b><small>${fmtDate(x.date)}</small></span>
      <span class="amt" style="color:${c}">${x.type === 'in' ? '+' : '−'}${money(x.amount)}</span>
      <button class="del" title="Удалить" type="button">×</button>`;
    li.querySelector('b').textContent = x.description;
    li.querySelector('.del').onclick = () => { tx = tx.filter(t => t.id !== x.id); save(); render(); };
    ul.appendChild(li);
  }
}

function renderChart(data) {
  const box = $('chart');
  box.innerHTML = '';
  if (!data.length) {
    box.innerHTML = '<p class="empty">Добавьте первую транзакцию, и здесь появится график</p>';
    return;
  }
  const map = new Map();
  for (const x of data) {
    const b = bucket(x.date);
    if (!map.has(b.k)) map.set(b.k, { k: b.k, label: b.label, in: 0, out: 0 });
    map.get(b.k)[x.type] += x.amount;
  }
  const pts = [...map.values()].sort((a, b) => a.k.localeCompare(b.k));
  const from = $('from').value;
  let run = opening + net(from ? tx.filter(x => x.date < from) : []);
  for (const p of pts) { run += p.in - p.out; p.bal = run; }

  const W = box.clientWidth || 600, H = 300;
  const m = { l: 52, r: 12, t: 12, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = pts.flatMap(p => [p.in, p.out, p.bal]);
  let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  if (max === min) max = min + 1;
  const y = v => m.t + ih * (1 - (v - min) / (max - min));
  const step = iw / pts.length;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}` }, box);

  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v);
    el('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: 'grid-line' }, svg);
    const t = el('text', { x: m.l - 6, y: yy + 4, 'text-anchor': 'end', class: 'ax' }, svg);
    t.textContent = Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(v);
  }
  el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: '#9ca3af' }, svg);

  // оси со стрелками как на образце
  el('line', { x1: m.l, x2: m.l, y1: m.t - 4, y2: H - m.b, stroke: '#d1d5db', 'stroke-width': 1 }, svg);
  el('line', { x1: m.l, x2: W - m.r + 4, y1: H - m.b, y2: H - m.b, stroke: '#d1d5db', 'stroke-width': 1 }, svg);

  const pad = Math.min(36, iw / 6);
  const px = i => pts.length === 1 ? m.l + iw / 2 : m.l + pad + i * (iw - pad * 2) / (pts.length - 1);
  const every = Math.ceil(pts.length / Math.max(1, Math.floor(iw / 70)));
  const series = [
    { key: 'in', color: 'var(--in)', w: 2 },
    { key: 'out', color: 'var(--out)', w: 2 },
    { key: 'bal', color: 'var(--bal)', w: 2.5 },
  ];
  const guide = el('line', { y1: m.t, y2: H - m.b, stroke: '#d1d5db', 'stroke-dasharray': '3 4', visibility: 'hidden', 'pointer-events': 'none' }, svg);
  const dots = [];
  for (const s of series) {
    const line = pts.map((p, i) => px(i) + ',' + y(p[s.key])).join(' ');
    if (s.key === 'bal' && pts.length > 1) {
      el('polygon', { points: `${px(0)},${y(0)} ${line} ${px(pts.length - 1)},${y(0)}`, fill: 'var(--bal)', opacity: 0.05, 'pointer-events': 'none' }, svg);
    }
    el('polyline', { points: line, fill: 'none', stroke: s.color, 'stroke-width': s.w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' }, svg);
    dots.push(el('circle', { r: 5.5, fill: s.color, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden', 'pointer-events': 'none' }, svg));
    // постоянные точки, когда их немного
    if (pts.length <= 31) pts.forEach((p, i) => el('circle', { cx: px(i), cy: y(p[s.key]), r: s.key === 'bal' ? 3.5 : 2.5, fill: s.color, 'pointer-events': 'none' }, svg));
  }
  pts.forEach((p, i) => {
    const cx = px(i);
    if (i % every === 0) {
      el('line', { x1: cx, x2: cx, y1: H - m.b, y2: H - m.b + 5, stroke: '#d1d5db', 'stroke-width': 1 }, svg);
      const t = el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'ax' }, svg);
      t.textContent = p.label;
    }
    const left = i === 0 ? m.l : (px(i - 1) + cx) / 2;
    const right = i === pts.length - 1 ? W - m.r : (cx + px(i + 1)) / 2;
    const hit = el('rect', { x: left, y: m.t, width: right - left, height: ih, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', e => {
      guide.setAttribute('x1', cx); guide.setAttribute('x2', cx); guide.setAttribute('visibility', 'visible');
      series.forEach((s, j) => { dots[j].setAttribute('cx', cx); dots[j].setAttribute('cy', y(p[s.key])); dots[j].setAttribute('visibility', 'visible'); });
      showTip(e, p);
    });
    hit.addEventListener('mouseleave', () => {
      guide.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.setAttribute('visibility', 'hidden'));
      hideTip();
    });
  });
}

function showTip(e, p) {
  const tip = $('tip');
  tip.hidden = false;
  tip.innerHTML = `<b>${p.label}</b><br>Доход: +${money(p.in)}<br>Расход: −${money(p.out)}<br>Баланс: ${money(p.bal)}`;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 180) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  document.querySelectorAll('#list li').forEach(li => li.classList.toggle('hl', li.dataset.bucket === p.k));
}
function hideTip() {
  $('tip').hidden = true;
  document.querySelectorAll('#list li.hl').forEach(li => li.classList.remove('hl'));
}

function seg(id, attr, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    cb(b.dataset[attr]);
  });
}
seg('groupSeg', 'g', v => { group = v; render(); });
seg('filterSeg', 'f', v => { filter = v; render(); });
seg('typeSeg', 't', v => { type = v; });

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseFloat($('amount').value);
  const description = $('desc').value.trim();
  if (!(amount > 0) || !description) return;
  tx.push({ id: Date.now(), date: $('date').value, type, amount, description });
  save();
  $('amount').value = ''; $('desc').value = '';
  $('desc').focus();
  render();
});

// задать фактический баланс карты: разница с суммой транзакций уходит в начальный остаток
$('setBal').onclick = () => {
  $('balForm').hidden = false;
  $('setBal').hidden = true;
  $('balInput').value = String(Math.round((opening + net(tx)) * 100) / 100).replace('.', ',');
  $('balInput').focus();
  $('balInput').select();
};
$('balCancel').onclick = () => { $('balForm').hidden = true; $('setBal').hidden = false; };
$('balForm').onsubmit = e => {
  e.preventDefault();
  const target = parseFloat($('balInput').value.replace(/\s/g, '').replace(',', '.'));
  if (isNaN(target)) return;
  opening = Math.round((target - net(tx)) * 100) / 100;
  try { localStorage.setItem(OPEN_KEY, opening); } catch {}
  $('balForm').hidden = true; $('setBal').hidden = false;
  render();
};

// даты показываются как дд.мм.гггг, внутри хранятся как гггг-мм-дд
const fpOpts = { locale: 'ru', dateFormat: 'Y-m-d', altInput: true, altFormat: 'd.m.Y', allowInput: false, disableMobile: true };
let fpFrom, fpTo;
if (window.flatpickr) {
  fpFrom = flatpickr('#from', { ...fpOpts, onChange: render });
  fpTo = flatpickr('#to', { ...fpOpts, onChange: render });
  flatpickr('#date', { ...fpOpts, defaultDate: today() });
} else {
  for (const id of ['from', 'to', 'date']) { $(id).type = 'date'; $(id).onchange = render; }
  $('date').value = today();
}
$('resetRange').onclick = () => { fpFrom ? (fpFrom.clear(), fpTo.clear()) : ($('from').value = $('to').value = ''); render(); };

addEventListener('resize', () => renderChart(inRange()));
render();

