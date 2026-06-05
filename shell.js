// ── Configuración (LS keys compartidas con el iframe) ─────────────────
const LS_CFG = {
  ratio:        'flowmodoro_ratio',
  breakRatio:   'flowmodoro_break_ratio',
  bonusMinutes: 'flowmodoro_bonus_minutes',
  bonusTarget:  'flowmodoro_bonus_target',
  showInTitle:  'flowmodoro_title',
};

// ── DOM refs ──────────────────────────────────────────────────────────
const shellHistoryBtn     = document.getElementById('shell-history-btn');
const shellCfgBtn         = document.getElementById('shell-cfg-btn');
const shellCfgPanel       = document.getElementById('shell-cfg-panel');
const shellResetBtn       = document.getElementById('shell-reset-btn');
const shellResetConfirm   = document.getElementById('shell-reset-confirm');
const shellResetYesBtn    = document.getElementById('shell-reset-yes-btn');
const shellResetNoBtn     = document.getElementById('shell-reset-no-btn');
const shellRatioInput     = document.getElementById('shell-ratio-input');
const shellBreakInput     = document.getElementById('shell-break-input');
const shellBonusInput     = document.getElementById('shell-bonus-input');
const shellBonusTargetIn  = document.getElementById('shell-bonus-target-input');
const shellTitleCheck     = document.getElementById('shell-title-check');

function getFlowmodoroFrame() {
  return document.getElementById('frame-flowmodoro');
}

function postToFlowmodoro(msg) {
  const fm = getFlowmodoroFrame();
  if (fm && fm.contentWindow) fm.contentWindow.postMessage(msg, '*');
}

// ── Config panel ──────────────────────────────────────────────────────
function readCfgFromLS() {
  shellRatioInput.value    = localStorage.getItem(LS_CFG.ratio)        ?? '25';
  shellBreakInput.value    = localStorage.getItem(LS_CFG.breakRatio)   ?? '5';
  shellBonusInput.value    = localStorage.getItem(LS_CFG.bonusMinutes) ?? '10';
  shellBonusTargetIn.value = localStorage.getItem(LS_CFG.bonusTarget)  ?? '60';
  shellTitleCheck.checked  = localStorage.getItem(LS_CFG.showInTitle) === '1';
}
readCfgFromLS();

if (!localStorage.getItem(LS_CFG.ratio)) shellCfgPanel.hidden = false;

function saveCfg(key, val, min = 1) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= min) {
    localStorage.setItem(key, n);
    postToFlowmodoro({ type: 'cfg-update' });
  }
}

// ── Click-outside: desactiva iframes para que los clicks lleguen al document
function disableIframePointerEvents() {
  document.getElementById('frame-flowmodoro').style.pointerEvents = 'none';
  document.querySelectorAll('.frame-countdown').forEach(f => f.style.pointerEvents = 'none');
}
function restoreIframePointerEvents() {
  document.getElementById('frame-flowmodoro').style.pointerEvents = '';
  document.querySelectorAll('.frame-countdown').forEach(f => f.style.pointerEvents = '');
}

function closeAllPanels() {
  shellCfgPanel.hidden     = true;
  shellResetConfirm.hidden = true;
  shellResetBtn.hidden     = false;
  restoreIframePointerEvents();
}

document.addEventListener('click', closeAllPanels);
document.getElementById('shell-header').addEventListener('click', e => e.stopPropagation());
shellCfgPanel.addEventListener('click', e => e.stopPropagation());

// ── Config panel toggle ───────────────────────────────────────────────
shellCfgBtn.addEventListener('click', () => {
  if (shellCfgPanel.hidden) {
    shellCfgPanel.hidden = false;
    disableIframePointerEvents();
  } else {
    closeAllPanels();
  }
});

shellRatioInput.addEventListener('input',    () => saveCfg(LS_CFG.ratio,        shellRatioInput.value));
shellBreakInput.addEventListener('input',    () => saveCfg(LS_CFG.breakRatio,   shellBreakInput.value));
shellBonusInput.addEventListener('input',    () => saveCfg(LS_CFG.bonusMinutes, shellBonusInput.value, 0));
shellBonusTargetIn.addEventListener('input', () => saveCfg(LS_CFG.bonusTarget,  shellBonusTargetIn.value));
shellTitleCheck.addEventListener('change', () => {
  localStorage.setItem(LS_CFG.showInTitle, shellTitleCheck.checked ? '1' : '0');
  postToFlowmodoro({ type: 'cfg-update' });
});

// ── History button ────────────────────────────────────────────────────
shellHistoryBtn.addEventListener('click', () => {
  postToFlowmodoro({ type: 'open-history' });
});

// ── Reset ─────────────────────────────────────────────────────────────
shellResetBtn.addEventListener('click', () => {
  shellResetBtn.hidden     = true;
  shellResetConfirm.hidden = false;
  disableIframePointerEvents();
});
shellResetNoBtn.addEventListener('click', () => closeAllPanels());
shellResetYesBtn.addEventListener('click', () => {
  postToFlowmodoro({ type: 'reset-confirm' });
  closeAllPanels();
});

// ── Countdown frames ──────────────────────────────────────────────────
const container = document.getElementById('countdown-container');
const addBtn    = document.getElementById('add-countdown-btn');

let cdIds = JSON.parse(localStorage.getItem('countdown_ids') || '["0"]');

function addCountdownFrame(id, isNew = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'countdown-wrapper';
  wrapper.id = `cd-wrapper-${id}`;

  const iframe = document.createElement('iframe');
  iframe.id        = `frame-countdown-${id}`;
  iframe.className = 'frame-countdown';
  const newParam   = isNew ? '&new=1' : '';
  iframe.src       = `countdown/index.html?id=${encodeURIComponent(id)}${newParam}`;
  iframe.scrolling = 'no';

  wrapper.appendChild(iframe);
  container.appendChild(wrapper);
}

cdIds.forEach(id => addCountdownFrame(id));

addBtn.addEventListener('click', () => {
  const newId = String(Date.now());
  cdIds.push(newId);
  localStorage.setItem('countdown_ids', JSON.stringify(cdIds));
  addCountdownFrame(newId, true);
});

// ── Messages from iframes ─────────────────────────────────────────────
window.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'cfg-loaded') {
    readCfgFromLS();
  } else if (e.data.type === 'title-update') {
    document.title = e.data.title;
  } else if (e.data.type === 'countdown-resize') {
    const frame = document.getElementById(`frame-countdown-${e.data.id}`);
    if (frame) frame.style.height = e.data.height + 'px';
  } else if (e.data.type === 'history-open') {
    document.getElementById('countdown-area').hidden = true;
  } else if (e.data.type === 'history-close') {
    document.getElementById('countdown-area').hidden = false;
  } else if (e.data.type === 'countdown-remove') {
    const id = e.data.id;
    cdIds = cdIds.filter(x => x !== id);
    localStorage.setItem('countdown_ids', JSON.stringify(cdIds));
    const wrapper = document.getElementById(`cd-wrapper-${id}`);
    if (wrapper) wrapper.remove();
  }
});
