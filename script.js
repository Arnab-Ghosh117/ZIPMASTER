(() => {
'use strict';
const $ = id => document.getElementById(id);
const MAX_ENTRIES = 5000, MAX_TOTAL = 2 * 1024 ** 3; // zip-bomb guards
const COLORS = {img:'#d6336c',doc:'#2447e0',sheet:'#12805c',code:'#7048e8',media:'#e8590c',zip:'#b08900',txt:'#64748b'};
const TYPES = {img:'png jpg jpeg gif webp svg bmp ico avif',doc:'pdf doc docx odt rtf ppt pptx',sheet:'xls xlsx csv ods',code:'js ts html css json xml py java c cpp md yml',media:'mp3 wav mp4 mov avi mkv webm ogg',zip:'zip rar 7z tar gz'};
const fmt = b => { if (!b) return '0 B'; const u=['B','KB','MB','GB'],i=Math.min(3,Math.floor(Math.log(b)/Math.log(1024))); return (b/1024**i).toFixed(i?2:0)+' '+u[i]; };
const ext = n => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
const kind = e => Object.keys(TYPES).find(k => TYPES[k].split(' ').includes(e)) || 'txt';
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg, type='ok') {
  const t = document.createElement('div'); t.className = 'toast ' + (type==='error'?'error':''); t.textContent = msg;
  $('toasts').append(t); setTimeout(() => t.remove(), 4200);
}
function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function badge(name) { const e = ext(name); return `<span class="badge" style="--c:${COLORS[kind(e)]}" aria-hidden="true">${esc((e||'file').slice(0,4).toUpperCase())}</span>`; }

// Theme
const root = document.documentElement;
function setTheme(t) { root.dataset.theme = t; $('themeBtn').setAttribute('aria-label', t==='dark'?'Switch to light theme':'Switch to dark theme'); try { localStorage.setItem('zm-theme', t); } catch {} }
let saved = null; try { saved = localStorage.getItem('zm-theme'); } catch {}
setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('themeBtn').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
$('yr').textContent = new Date().getFullYear();

// Tabs
const tabs = [$('tab-compress'), $('tab-extract')];
function showTab(i) { tabs.forEach((t,j) => { t.setAttribute('aria-selected', i===j); t.tabIndex = i===j?0:-1; $(t.getAttribute('aria-controls')).hidden = i!==j; }); tabs[i].focus(); }
tabs.forEach((t,i) => { t.onclick = () => showTab(i); t.onkeydown = e => { if (e.key==='ArrowRight'||e.key==='ArrowLeft') showTab(1-i); }; });
document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', e => { if (a.hash==='#compress') showTab(0); if (a.hash==='#extract') showTab(1); }));

// Drop zones
function wireDrop(zone, input, handler) {
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => handler([...e.dataTransfer.files]));
  zone.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { handler([...input.files]); input.value = ''; });
}

// ---------- Compress ----------
let files = [], lastUrl = null;
const level = $('level');
level.oninput = () => $('levelOut').textContent = level.value;

function renderFiles() {
  const list = $('fileList'); list.innerHTML = '';
  files.forEach((f, i) => {
    const li = document.createElement('li'); li.className = 'file';
    li.innerHTML = `${badge(f.name)}<div class="meta"><div class="name" title="${esc(f.name)}">${esc(f.name)}</div><div class="sub">.${esc(ext(f.name)||'none')} · ${fmt(f.size)} · ${esc(f.type||'unknown type')}</div></div><button class="x" type="button" aria-label="Remove ${esc(f.name)}">×</button>`;
    li.querySelector('.x').onclick = () => { files.splice(i,1); resetResult(); renderFiles(); };
    list.append(li);
  });
  $('count').textContent = files.length;
  $('empty1').hidden = files.length > 0;
  $('clearBtn').disabled = $('zipBtn').disabled = !files.length;
}
function resetResult() {
  $('stats').hidden = $('prog1').hidden = $('dlZip').hidden = true;
  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
}
function addFiles(list) {
  if (!list.length) return toast('No files were selected.', 'error');
  list = list.filter(f => f.size >= 0 && f.type !== '' || f.size > 0 || f.name.includes('.'));
  files.push(...list); resetResult(); renderFiles(); toast(`Added ${list.length} file${list.length>1?'s':''}.`);
}
wireDrop($('drop1'), $('fileIn'), addFiles);
$('clearBtn').onclick = () => { files = []; resetResult(); renderFiles(); toast('Selection cleared.'); };

function cleanName(s) { s = s.trim().replace(/\.zip$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,''); return (s || 'archive') + '.zip'; }

$('zipBtn').onclick = async () => {
  if (!files.length) return toast('Add at least one file first.', 'error');
  if (typeof JSZip === 'undefined') return toast('JSZip failed to load. Check your connection and reload.', 'error');
  const btn = $('zipBtn'); btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Compressing'; resetResult();
  $('prog1').hidden = false; $('bar1').style.width = '0'; $('pct1').textContent = '0%';
  try {
    const zip = new JSZip(), used = new Set();
    files.forEach(f => {
      let n = f.name.replace(/[\\/]/g,'_'), k = 1; const dot = n.lastIndexOf('.');
      const base = dot > 0 ? n.slice(0,dot) : n, e = dot > 0 ? n.slice(dot) : '';
      while (used.has(n.toLowerCase())) n = `${base} (${k++})${e}`;
      used.add(n.toLowerCase()); zip.file(n, f, {date: new Date(f.lastModified || Date.now())});
    });
    const blob = await zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:+level.value}, streamFiles:true},
      m => { const p = Math.round(m.percent); $('bar1').style.width = p+'%'; $('pct1').textContent = p+'%'; });
    const orig = files.reduce((s,f) => s + f.size, 0), diff = (1 - blob.size/orig) * 100;
    $('sOrig').textContent = fmt(orig); $('sComp').textContent = fmt(blob.size);
    $('sLbl').textContent = diff >= 0 ? 'Saved' : 'Larger by';
    $('sPct').textContent = orig ? Math.abs(diff).toFixed(1)+'%' : '0%';
    $('stats').hidden = false;
    lastUrl = URL.createObjectURL(blob); const a = $('dlZip'); a.href = lastUrl; a.download = cleanName($('zipName').value); a.hidden = false;
    toast(diff < 0 ? 'ZIP ready. These files were already compact, so the archive is slightly larger.' : 'ZIP ready to download.');
  } catch (err) { console.error(err); toast('Compression failed: ' + (err.message || 'unknown error'), 'error'); $('prog1').hidden = true; }
  btn.classList.remove('busy'); btn.textContent = 'Create ZIP'; btn.disabled = !files.length;
};
$('dlZip').onclick = () => toast('Downloading ' + $('dlZip').download);

// ---------- Extract ----------
let entries = [], archiveName = '';
// returns safe relative path or null when the entry must be skipped
function safePath(p) {
  if (/[\x00-\x1f]/.test(p)) return null;
  p = p.replace(/\\/g,'/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split('/').filter(s => s && s !== '.');
  if (!parts.length || parts.includes('..')) return null;
  return parts.join('/');
}
async function openZip(list) {
  const f = list[0]; if (!f) return;
  if (typeof JSZip === 'undefined') return toast('JSZip failed to load. Check your connection and reload.', 'error');
  if (!/\.zip$/i.test(f.name) && !/zip/.test(f.type)) return toast('That is not a ZIP file. Choose a .zip archive.', 'error');
  resetEx(true); $('prog2').hidden = false; $('bar2').style.width = '40%'; $('pct2').textContent = 'Reading';
  try {
    const zip = await JSZip.loadAsync(f); archiveName = f.name.replace(/\.zip$/i,'');
    const all = Object.values(zip.files).filter(e => !e.dir);
    if (all.length > MAX_ENTRIES) throw new Error(`Archive has ${all.length} files, above the ${MAX_ENTRIES} limit.`);
    let total = 0, skipped = 0, seen = new Set();
    entries = [];
    all.forEach(e => {
      const safe = safePath(e.name), size = e._data && e._data.uncompressedSize || 0;
      total += size;
      if (!safe) { skipped++; entries.push({name:e.name, size, unsafe:true}); return; }
      let n = safe, k = 1; while (seen.has(n)) n = safe + ` (${k++})`; seen.add(n);
      entries.push({name:n, original:e.name, size, entry:e, blob:null, renamed:n!==e.name.replace(/\\/g,'/')});
    });
    if (total > MAX_TOTAL) { entries = []; throw new Error('Archive would expand beyond 2 GB, so it was not opened.'); }
    renderEntries(); $('bar2').style.width = '100%'; $('pct2').textContent = 'Done';
    setTimeout(() => $('prog2').hidden = true, 500);
    toast(`Opened ${f.name}: ${entries.length - skipped} files${skipped ? `, ${skipped} unsafe skipped` : ''}.`);
  } catch (err) {
    console.error(err); $('prog2').hidden = true; resetEx(false);
    toast(/corrupt|end of central|signature|zip/i.test(err.message) ? 'This file is not a valid ZIP archive or is damaged.' : err.message, 'error');
  }
}
wireDrop($('drop2'), $('zipIn'), openZip);

function renderEntries() {
  const ul = $('exList'); ul.innerHTML = '';
  entries.forEach((e, i) => {
    const li = document.createElement('li'); li.className = 'file';
    const note = e.unsafe ? '<span class="warn"> · Skipped: unsafe path</span>' : e.renamed ? ' · Path adjusted' : '';
    li.innerHTML = `${badge(e.name)}<div class="meta"><div class="name" title="${esc(e.name)}">${esc(e.name)}</div><div class="sub">${fmt(e.size)}${note}</div></div>` +
      (e.unsafe ? '' : `<button class="btn sm" type="button">Download</button>`);
    const b = li.querySelector('button'); if (b) b.onclick = () => extractOne(i, b);
    ul.append(li);
  });
  $('exHead').hidden = !entries.length; $('empty2').hidden = entries.length > 0;
  $('exTitle').textContent = `${archiveName}.zip · ${entries.filter(e=>!e.unsafe).length} files`;
  $('allBtn').disabled = !entries.some(e => !e.unsafe);
}
async function getBlob(e) { return e.blob || (e.blob = await e.entry.async('blob')); }
async function extractOne(i, btn) {
  const e = entries[i]; btn.disabled = true; btn.classList.add('busy');
  try { save(await getBlob(e), e.name.split('/').pop()); toast('Downloaded ' + e.name.split('/').pop()); }
  catch (err) { toast('Could not extract ' + e.name + '.', 'error'); }
  btn.disabled = false; btn.classList.remove('busy');
}
$('allBtn').onclick = async () => {
  const btn = $('allBtn'), safe = entries.filter(e => !e.unsafe); btn.disabled = true; btn.classList.add('busy');
  $('prog2').hidden = false; $('bar2').style.width = '0'; $('pct2').textContent = '0%';
  try {
    const out = new JSZip(); let done = 0;
    for (const e of safe) { out.file(e.name, await getBlob(e)); $('bar2').style.width = (++done/safe.length*100)+'%'; $('pct2').textContent = Math.round(done/safe.length*100)+'%'; }
    save(await out.generateAsync({type:'blob', compression:'STORE'}), archiveName + '-extracted.zip');
    toast('Downloaded all files as a single bundle. Unzip it to get your folder structure.');
  } catch (err) { toast('Extraction failed: ' + err.message, 'error'); }
  btn.classList.remove('busy'); btn.disabled = false; setTimeout(() => $('prog2').hidden = true, 600);
};
function resetEx(silent) { entries = []; $('exList').innerHTML = ''; $('exHead').hidden = true; $('empty2').hidden = false; $('prog2').hidden = true; }
$('resetEx').onclick = () => { resetEx(); toast('Archive closed.'); };

renderFiles();
})();
