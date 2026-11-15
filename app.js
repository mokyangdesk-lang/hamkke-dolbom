/* 함께 돌봄 5.0 — 앱 뼈대: 로그인 → 역할 확인 → 그 역할의 화면만 보여 줌.
   화면에서 메뉴를 숨기는 것은 편의일 뿐, 실제 권한은 서버가 판정합니다. */
(function (root) {
  'use strict';
  const { $, $$, esc, ROLE, MINISTRY, CREDIT, toast, dialog, closeDialog, ask, formatCode } = root.UI;
  const store = root.HamkkeStore, C = root.MinistryCore;
  const copy = x => JSON.parse(JSON.stringify(x));

  // 역할별 메뉴(순서대로). 각 화면은 Pages에 등록됩니다(admin.js 등).
  const NAV = {
    admin: ['staff', 'groups', 'imports', 'board', 'matching', 'assign', 'templates', 'theme'],
    newcomer_admin: ['board', 'attendance', 'matching', 'imports'],
    newcomer_pastor: ['board', 'attendance', 'nreports', 'message'],
    district_pastor: ['today', 'people', 'message', 'reports', 'handover', 'assign'],
    committee: ['board', 'message', 'nreport'],
    visitor: ['today', 'people', 'message', 'report'],
  };
  const Pages = root.HamkkePages = root.HamkkePages || {};

  let state = C.empty(), page = '', cache = {}, loading = false;
  const me = () => store.status();
  const ctx = () => ({ state, me: me(), cache, commit, refresh, render, go, toast, dialog, closeDialog, ask });
  function go(id) { page = id; render(); }

  // 바꾼 내용을 서버에 저장. 실패하면 화면을 저장 전 상태로 되돌립니다.
  async function commit(mutate, okMessage = '저장했습니다.') {
    const before = copy(state);
    try { mutate(state); const n = await store.save(state); toast(n ? okMessage : '바뀐 내용이 없습니다.'); render(); return true; }
    catch (e) { state = before; toast(e.message); render(); return false; }
  }
  async function refresh(quiet) {
    if (loading) return; loading = true; setStatus('불러오는 중…');
    try { state = await store.load(); cache = {}; root.HamkkeTheme?.apply(root.HamkkeTheme.fromState(state)); if (!quiet) toast('서버의 최신 자료를 불러왔습니다.'); }
    catch (e) { toast(e.message); }
    finally { loading = false; if (me().signedIn) render(); }
  }
  function setStatus(t) { const el = $('#syncState'); if (el) el.textContent = t; }

  function loginHTML(message) {
    const s = me(), sv = store.server();
    return `<main class="login" id="main"><div class="login-card">
      <div class="brand-mark" aria-hidden="true">✦</div><h1>함께 돌봄</h1><p class="muted">심방 · 새가족 사역자의 수첩</p>
      <div class="who-login" aria-label="이 화면에서 로그인하는 분"><span>심방사역자</span><span>새가족위원</span><span>교구 목사</span><span>새가족팀</span></div>
      <p class="muted small">모두 이 화면에서 로그인합니다. 받은 코드에 맞는 화면(심방 또는 새가족)이 자동으로 열립니다.</p>
      ${message ? `<p class="notice" role="alert">${esc(message)}</p>` : ''}
      ${s.hasServer ? '' : '<p class="notice">서버 정보가 아직 없습니다. 아래 "서버 정보 입력"을 관리자에게 받아 한 번 입력해 주세요.</p>'}
      <form id="codeLogin" class="stack">
        <label for="loginName">이름</label><input id="loginName" name="name" autocomplete="off" required>
        <label for="loginCode">개인 코드</label><input id="loginCode" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required>
        <button class="primary big" ${s.hasServer ? '' : 'disabled'}>로그인</button>
      </form>
      <p class="muted small">코드는 관리자에게 받습니다. 잊어버리셨으면 관리자에게 새 코드를 요청하세요. 이전 코드는 그때부터 쓸 수 없습니다.</p>
      <details class="more"><summary>관리자 이메일 로그인</summary>
        <form id="emailLogin" class="stack"><label for="adminEmail">이메일</label><input id="adminEmail" name="email" type="email" autocomplete="username" required>
        <label for="adminPassword">비밀번호</label><input id="adminPassword" name="password" type="password" autocomplete="current-password" required>
        <button ${s.hasServer ? '' : 'disabled'}>관리자 로그인</button></form></details>
      ${s.builtInServer ? '' : `<details class="more" ${s.hasServer ? '' : 'open'}><summary>서버 정보 입력 (처음 한 번)</summary>
        <form id="serverForm" class="stack"><p class="muted small">공개해도 되는 값만 넣습니다. 비밀 키(service_role)는 넣지 마세요.</p>
        <label for="srvUrl">서버 주소</label><input id="srvUrl" name="url" type="url" placeholder="https://….supabase.co" value="${esc(sv.url || '')}" required>
        <label for="srvKey">공개 키</label><input id="srvKey" name="key" autocomplete="off" value="${esc(sv.key || '')}" required>
        <label for="srvChurch">교회 ID</label><input id="srvChurch" name="churchId" autocomplete="off" value="${esc(sv.churchId || '')}" required>
        <button>이 기기에 저장</button></form></details>`}
    </div><p class="guide-link"><a href="guide/">처음이신가요? 사용 안내 보기</a></p><p class="credit">${esc(CREDIT)}</p></main>`;
  }
  function bindLogin() {
    const code = $('#loginCode');
    if (code) code.oninput = () => { code.value = formatCode(code.value); };
    $('#codeLogin').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), btn = $('button', e.target);
      btn.disabled = true; btn.textContent = '확인 중…';
      try { await store.codeLogin(f.get('name'), f.get('code')); await enter(); }
      catch (err) { renderLogin(err.message); }
    };
    $('#emailLogin').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await store.emailLogin(f.get('email'), f.get('password')); await enter(); } catch (err) { renderLogin(err.message); }
    };
    const sf = $('#serverForm');
    if (sf) sf.onsubmit = e => { e.preventDefault(); const f = new FormData(sf); try { store.setServer(f.get('url'), f.get('key'), f.get('churchId')); renderLogin('서버 정보를 저장했습니다. 이제 이름과 코드로 로그인하세요.'); } catch (err) { toast(err.message); } };
  }
  function renderLogin(message) { state = C.empty(); cache = {}; page = ''; document.body.className = ''; $('#app').innerHTML = loginHTML(message); bindLogin(); }

  async function enter() {
    $('#app').innerHTML = '<main class="login"><p class="muted">불러오는 중…</p></main>';
    try { state = await store.load(); } catch (e) { return renderLogin(e.message); }
    root.HamkkeTheme?.apply(root.HamkkeTheme.fromState(state)); // 교회 테마(관리자가 정함)
    const nav = NAV[me().role];
    if (!nav) { await store.signOut(); return renderLogin('알 수 없는 역할입니다. 관리자에게 문의해 주세요.'); }
    page = nav[0]; render();
    root.NotifyCore?.start?.(ctx); // 켜져 있는 동안 30분마다 알림 확인
  }

  function shellHTML() {
    const m = me(), nav = NAV[m.role] || [], [ministry] = MINISTRY[m.role];
    if (!nav.includes(page) && page !== 'alerts') page = nav[0];
    const alerts = root.NotifyCore ? root.NotifyCore.compute(state, m).length : 0;
    const P = Pages[page];
    return `<header class="top"><div class="brand"><span class="brand-mark sm" aria-hidden="true">✦</span><span>함께 돌봄</span><span class="ministry-tag">${esc(ministry)}</span></div>
      <div class="who"><b>${esc(m.name || '')}</b> <span class="muted">${esc(ROLE[m.role])}${m.district ? ' · ' + esc(m.district) : ''}</span></div>
      <div class="top-acts"><span id="syncState" class="muted small" role="status">서버와 연결됨</span><button id="alertsBtn" class="${page === 'alerts' ? 'primary' : 'quiet'}" aria-label="알림 ${alerts}건">알림${alerts ? ` <span class="badge">${alerts}</span>` : ''}</button><button id="refreshBtn" class="quiet" title="다른 기기에서 바꾼 내용을 불러옵니다" aria-label="새로고침"><span aria-hidden="true">↻</span><span class="lbl">새로고침</span></button><button id="logoutBtn" class="quiet">로그아웃</button></div></header>
      ${nav.length > 1 ? `<nav class="tabs" aria-label="메뉴">${nav.map(id => `<button data-page="${id}" class="${id === page ? 'active' : ''}" ${id === page ? 'aria-current="page"' : ''}>${esc(Pages[id]?.label || id)}</button>`).join('')}</nav>` : ''}
      <main id="main" class="page">${P ? P.render(ctx()) : ''}</main>
      <footer class="credit">${esc(CREDIT)}</footer>`;
  }
  function render() {
    if (!me().signedIn) return renderLogin();
    document.body.className = 'm-' + MINISTRY[me().role]?.[1];
    $('#app').innerHTML = shellHTML();
    const top = $('.top'); if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
    $$('[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));
    $('#refreshBtn').onclick = () => refresh();
    $('#alertsBtn').onclick = () => go('alerts');
    $('#logoutBtn').onclick = async () => { if (await ask('로그아웃', '이 기기에서 로그아웃합니다. 다시 들어오려면 이름과 코드가 필요합니다.', '로그아웃')) { await store.signOut(); renderLogin('로그아웃했습니다.'); } };
    Pages[page]?.bind?.(ctx());
  }

  store.on((type, msg) => { if (type === 'signedout') { closeDialog(); renderLogin(msg); } });
  async function boot() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
    if (me().signedIn) await enter(); else renderLogin();
  }
  root.HamkkeApp = { boot, ctx, NAV, get state() { return state; } };
  if (!root.HAMKKE_NO_BOOT) document.addEventListener('DOMContentLoaded', boot);
})(window);
