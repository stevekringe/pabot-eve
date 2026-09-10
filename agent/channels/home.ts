import { defineChannel, GET, HEAD } from "eve/channels";

// Demo chat UI for pabot-eve. Served same-origin at GET /, so the browser
// talks directly to the framework's /eve/v1/* session API with no CORS setup.
// Locally this just works (`localDev()` auth in channels/eve.ts admits
// localhost). On a deployed URL the browser gets 401 until channels/eve.ts
// swaps placeholderAuth() for real auth (or none() for a public demo).
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pabot-eve chat</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  #log { border: 1px solid #ccc; border-radius: 8px; min-height: 300px; max-height: 60vh; overflow-y: auto; padding: 1rem; margin-bottom: 1rem; }
  .user { text-align: right; margin: 0.5rem 0; }
  .user span { background: #e6f0ff; border-radius: 8px; padding: 0.4rem 0.8rem; display: inline-block; }
  .assistant { margin: 0.5rem 0; white-space: pre-wrap; }
  .assistant span { background: #f4f4f4; border-radius: 8px; padding: 0.4rem 0.8rem; display: inline-block; }
  .error { color: #b00; }
  .approval { border: 2px solid #a60; border-radius: 8px; padding: 0.5rem 0.8rem; margin: 0.5rem 0; background: #fff8ee; }
  .approval button { margin-right: 0.5rem; }
  .answered { font-size: 0.85rem; color: #666; }
  #status { font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; }
  #status.busy { color: #a60; animation: pulse 1.2s infinite; }
  #status.error { color: #b00; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  form { display: flex; gap: 0.5rem; }
  input { flex: 1; padding: 0.5rem; font-size: 1rem; }
  button { padding: 0.5rem 1rem; font-size: 1rem; }
</style>
</head>
<body>
<h1>pabot-eve</h1>
<div id="status">ready</div>
<div id="log"></div>
<form id="composer">
  <input id="input" autocomplete="off" placeholder="Say something…" />
  <button type="submit">Send</button>
  <button type="button" id="newchat">New chat</button>
</form>
<script>
var sessionId = null;
var log = document.getElementById('log');
var statusEl = document.getElementById('status');
var input = document.getElementById('input');
var reader = null;
var currentAssistant = null;
var pendingApprovals = {};

var busySince = null;
var phase = '';
var tickTimer = null;

function renderStatus() {
  if (busySince === null) return;
  var s = Math.floor((Date.now() - busySince) / 1000);
  statusEl.textContent = '● ' + phase + '… (' + s + 's)';
}

function setBusy(p) {
  if (busySince === null) {
    busySince = Date.now();
    tickTimer = setInterval(renderStatus, 1000);
  }
  phase = p;
  statusEl.className = 'busy';
  renderStatus();
}

function setReady() {
  busySince = null;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  statusEl.textContent = 'ready';
  statusEl.className = '';
}

function setErrorStatus() {
  busySince = null;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  statusEl.textContent = 'error';
  statusEl.className = 'error';
}

function addUser(text) {
  var div = document.createElement('div');
  div.className = 'user';
  var span = document.createElement('span');
  span.textContent = text;
  div.appendChild(span);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function addAssistant() {
  var div = document.createElement('div');
  div.className = 'assistant';
  var span = document.createElement('span');
  span.textContent = '';
  div.appendChild(span);
  log.appendChild(div);
  currentAssistant = span;
}

function addError(text) {
  var div = document.createElement('div');
  div.className = 'error';
  div.textContent = text;
  log.appendChild(div);
}

function renderApproval(req) {
  var div = document.createElement('div');
  div.className = 'approval';
  var isCalmCheck = req.action && req.action.toolName === 'confirm_calm';
  var p = document.createElement('p');
  p.textContent = isCalmCheck
    ? 'Pabot demands you formally confirm that you are calm before it will proceed.'
    : (req.prompt || 'Approval required');
  div.appendChild(p);
  (req.options || []).forEach(function (opt) {
    var b = document.createElement('button');
    b.type = 'button';
    if (isCalmCheck) {
      b.textContent = opt.id === 'approve' ? 'I confirm I am calm' : 'I refuse';
    } else {
      b.textContent = opt.label || opt.id;
    }
    b.onclick = function () { answerApproval(req.requestId, opt.id, div, b.textContent); };
    div.appendChild(b);
  });
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  pendingApprovals[req.requestId] = div;
}

function answerApproval(requestId, optionId, div, label) {
  var btns = div.getElementsByTagName('button');
  for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
  fetch('/eve/v1/session/' + sessionId, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputResponses: [{ requestId: requestId, optionId: optionId }] })
  }).then(function (res) { return res.json(); }).then(function (json) {
    if (!json.ok) { addError('Approval failed: ' + JSON.stringify(json).slice(0, 200)); return; }
    delete pendingApprovals[requestId];
    var done = document.createElement('p');
    done.className = 'answered';
    done.textContent = 'You chose: ' + label;
    div.appendChild(done);
    setBusy('thinking');
  }).catch(function (e) { addError('Approval error: ' + e); });
}

function hasPendingApprovals() {
  return Object.keys(pendingApprovals).length > 0;
}

function handleEvent(evt) {
  var d = evt.data || {};
  if (evt.type === 'turn.started') {
    addAssistant();
    setBusy('thinking');
  } else if (evt.type === 'step.started') {
    setBusy('thinking');
  } else if (evt.type === 'message.appended') {
    setBusy('replying');
    if (!currentAssistant) addAssistant();
    currentAssistant.textContent += (d.messageDelta || '');
    log.scrollTop = log.scrollHeight;
  } else if (evt.type === 'actions.requested') {
    var names = (d.actions || []).map(function (a) { return a.toolName; });
    if (names.indexOf('web_search') !== -1) {
      setBusy('searching the web');
    } else if (names.indexOf('confirm_calm') !== -1) {
      setBusy('demanding calm confirmation');
    } else if (names.indexOf('score_response') !== -1) {
      setBusy('scoring its draft');
    } else {
      setBusy('thinking');
    }
  } else if (evt.type === 'turn.completed') {
    if (hasPendingApprovals()) {
      setBusy('waiting for your approval');
    } else {
      setReady();
    }
  } else if (evt.type === 'session.waiting') {
    if (hasPendingApprovals()) {
      setBusy('waiting for your approval');
    } else {
      setReady();
    }
  } else if (evt.type === 'turn.cancelled') {
    setBusy('thinking');
  } else if (evt.type === 'input.requested') {
    setBusy('waiting for your approval');
    (d.requests || []).forEach(function (req) {
      if (!pendingApprovals[req.requestId]) renderApproval(req);
    });
  } else if (evt.type === 'input.resolved') {
    var rid = d.requestId || '';
    if (rid && pendingApprovals[rid]) delete pendingApprovals[rid];
    if (!hasPendingApprovals()) setReady();
  } else if (evt.type === 'turn.failed' || evt.type === 'session.failed') {
    setErrorStatus();
    addError('Turn failed: ' + JSON.stringify(d).slice(0, 300));
  }
}

function pump() {
  if (!reader) return;
  reader.read().then(function onChunk(res) {
    if (res.done) { reader = null; return; }
    var text = new TextDecoder().decode(res.value);
    pump.buffer = (pump.buffer || '') + text;
    var lines = pump.buffer.split('\\n');
    pump.buffer = lines.pop();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      try { handleEvent(JSON.parse(line)); } catch (e) { /* partial line */ }
    }
    pump();
  }).catch(function (e) {
    reader = null;
    busySince = null;
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    statusEl.textContent = 'stream disconnected — send a message to reconnect';
    statusEl.className = 'error';
  });
}

function attachStream() {
  fetch('/eve/v1/session/' + sessionId + '/stream').then(function (res) {
    if (!res.ok) { addError('Stream failed: ' + res.status); return; }
    reader = res.body.getReader();
    pump();
  }).catch(function (e) { addError('Stream error: ' + e); });
}

function sendMessage(text) {
  setBusy('sent, waiting for model');
  addUser(text);
  currentAssistant = null;
  var url = sessionId ? '/eve/v1/session/' + sessionId : '/eve/v1/session';
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: text })
  }).then(function (res) { return res.json(); }).then(function (json) {
    if (!json.ok) { setErrorStatus(); addError('Send failed: ' + JSON.stringify(json).slice(0, 300)); return; }
    if (!sessionId && json.sessionId) {
      sessionId = json.sessionId;
      attachStream();
    } else if (!reader) {
      attachStream();
    }
  }).catch(function (e) { setErrorStatus(); addError('Send error: ' + e); });
}

document.getElementById('composer').addEventListener('submit', function (e) {
  e.preventDefault();
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendMessage(text);
});

document.getElementById('newchat').addEventListener('click', function () {
  sessionId = null;
  log.innerHTML = '';
  currentAssistant = null;
  pendingApprovals = {};
  setReady();
  input.focus();
});

input.focus();
</script>
</body>
</html>`;

const respond = async () =>
  new Response(page, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

export default defineChannel({
  routes: [GET("/", respond), HEAD("/", respond)],
});
