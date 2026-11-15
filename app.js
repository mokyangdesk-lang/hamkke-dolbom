/* 함께 돌봄 5.0 — 앱 뼈대: 로그인 → 역할 확인 → 그 역할의 화면만 보여 줌.
   화면에서 메뉴를 숨기는 것은 편의일 뿐, 실제 권한은 서버가 판정합니다. */
(function (root) {
  'use strict';
  const { $, $$, esc, ROLE, MINISTRY, CREDIT, toast, dialog, closeDialog, ask, formatCode } = root.UI;
  const store = root.HamkkeStore, C = root.MinistryCore;
  const copy = x => JSON.parse(JSON.stringify(x));

  // 역할별 메뉴(순서대로). 각 화면은 Pages에 등록됩니다(admin.js 등).
  const NAV = {
    admin: [], // 아래 ADMIN_AREAS 순서대로 채웁니다.
    newcomer_admin: ['board', 'attendance', 'matching', 'imports'],
    newcomer_pastor: ['board', 'attendance', 'nreports', 'message'],
    district_pastor: ['today', 'people', 'message', 'reports', 'handover', 'assign'],
    committee: ['board', 'attendance', 'message', 'nreport'],
    visitor: ['today', 'people', 'message', 'report'],
  };
  // 최고 관리자 메뉴: 큰 영역 5개(컴퓨터는 왼쪽, 휴대폰은 아래) → 영역 안의 화면만 위에 작은 탭으로. [화면, 한 줄 설명]
  const ICON = {
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 13.9c1.7.6 2.7 2.4 3 5.1"/>',
    new: '<path d="M12 20v-8"/><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5Z"/><path d="M12 14c0-3.2-2.4-5.2-5.6-5.2 0 3.2 2.4 5.2 5.6 5.2Z"/>',
    visit: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9.5h12V10"/><path d="M12 17s-2.6-1.6-2.6-3.3a1.4 1.4 0 0 1 2.6-.7 1.4 1.4 0 0 1 2.6.7c0 1.7-2.6 3.3-2.6 3.3Z"/>',
    sms: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z"/>',
    set: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  };
  const ADMIN_AREAS = [
    { key: 'people', label: '사람·명단', hint: '담당자 · 명단 · 교구', items: [['staff', '등록 · 코드 발급 · 접근 중지 · 주소 문자'], ['imports', '교적 엑셀 올리기 · 양식 받기'], ['roster', '돌봄 성도 · 새가족 명단 보기'], ['groups', '교구 이름 · 심방사역자 있는 교구']] },
    { key: 'new', label: '새가족', hint: '현황 · 교육 · 매칭 · 인계', items: [['board', '단계별 진행 · 다음 할 일'], ['attendance', '새가족교육 4과목 출석'], ['matching', '4과목 마친 분과 양육도우미 잇기'], ['handover', '정착한 분을 교구로 인계'], ['nreports', '새가족위원 주간 보고 보기']] },
    { key: 'visit', label: '심방', hint: '교구별 할 일 · 성도 · 보고', items: [['today', '교구를 골라 오늘 할 일'], ['people', '교구 성도 · 연락 기록'], ['assign', '교구별 심방사역자와 성도 현황'], ['reports', '심방사역자 주간 보고 보기']] },
    { key: 'sms', label: '문자', hint: '보내기 · 예문', items: [['message', '받는 사람 → 예문 → 문자 앱'], ['templates', '교회 공통 예문 · 기준 일수']] },
    { key: 'set', label: '설정', hint: '화면 · 자료 백업', items: [['theme', '색 · 글꼴 · 밝기 · 글자 크기'], ['data', '백업 · 한 분 지우기 · 초기화 · 되살리기']] },
  ];
  NAV.admin = ADMIN_AREAS.flatMap(a => a.items.map(([id]) => id));
  const areaOf = id => ADMIN_AREAS.find(a => a.items.some(([x]) => x === id));
  const Pages = root.HamkkePages = root.HamkkePages || {};

  let state = C.empty(), page = '', cache = {}, loading = false, adminDistrict = '';
  // 최고 관리자는 모든 화면을 씁니다. 교구 화면(오늘 할 일·성도·보고 받기·인계)은 위에서 고른 교구로 봅니다.
  const DISTRICT_PAGES = ['today', 'people', 'reports', 'handover'];
  const pickedDistrict = () => { const g = C.groups(state).map(x => x.name); return g.includes(adminDistrict) ? adminDistrict : g[0] || ''; };
  const me = () => { const m = store.status(); return m && m.role === 'admin' && DISTRICT_PAGES.includes(page) ? { ...m, district: pickedDistrict() } : m; };
  const scoped = () => { const m = me(); if (!(m && m.role === 'admin' && DISTRICT_PAGES.includes(page))) return state; const d = m.district; return { ...state, people: state.people.filter(p => p.district === d) }; };
  const ctx = () => ({ state: scoped(), me: me(), cache, commit, refresh, render, go, toast, dialog, closeDialog, ask });
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

  // 역할별 주소(?for=visit|new|admin): 로그인 화면의 제목과 안내만 바뀝니다. 실제로 열리는 화면은 코드(서버의 역할)가 정합니다.
  const ENTRY = {
    visit: { title: '심방사역자 로그인', tags: ['심방사역자'], note: '관리자에게 받은 이름과 코드를 넣으면 심방 화면이 열립니다.' },
    new: { title: '새가족위원 로그인', tags: ['새가족위원', '새가족팀'], note: '관리자에게 받은 이름과 코드를 넣으면 새가족 화면이 열립니다.' },
    admin: { title: '관리자 로그인', tags: ['전체 관리자'], note: '전체 관리자는 아래 "관리자 이메일 로그인"을 쓰세요. 교구 목사님과 새가족팀은 이름과 코드로 로그인합니다.' },
  };
  const entry = () => { try { return ENTRY[new URLSearchParams(location.search).get('for')] || null; } catch (_) { return null; } };
  function loginHTML(message) {
    const s = me(), sv = store.server(), e = entry();
    return `<main class="login" id="main"><div class="login-card">
      <div class="brand-mark" aria-hidden="true">✦</div><h1>${e ? esc(e.title) : '함께 돌봄'}</h1><p class="muted">${e ? '함께 돌봄 · ' : ''}심방 · 새가족 사역자의 수첩</p>
      <div class="who-login" aria-label="이 화면에서 로그인하는 분">${(e ? e.tags : ['심방사역자', '새가족위원', '교구 목사', '새가족팀']).map(t => `<span>${esc(t)}</span>`).join('')}</div>
      <p class="muted small">${e ? esc(e.note) : '모두 이 화면에서 로그인합니다. 받은 코드에 맞는 화면(심방 또는 새가족)이 자동으로 열립니다.'}</p>
      ${message ? `<p class="notice" role="alert">${esc(message)}</p>` : ''}
      ${s.hasServer ? '' : '<p class="notice">서버 정보가 아직 없습니다. 아래 "서버 정보 입력"을 관리자에게 받아 한 번 입력해 주세요.</p>'}
      <form id="codeLogin" class="stack">
        <label for="loginName">이름</label><input id="loginName" name="name" autocomplete="off" required>
        <label for="loginCode">개인 코드</label><input id="loginCode" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required>
        <button class="primary big" ${s.hasServer ? '' : 'disabled'}>로그인</button>
      </form>
      <p class="muted small">코드는 관리자에게 받습니다. 잊어버리셨으면 관리자에게 새 코드를 요청하세요. 이전 코드는 그때부터 쓸 수 없습니다.</p>
      <details class="more" ${e === ENTRY.admin ? 'open' : ''}><summary>관리자 이메일 로그인</summary>
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
      ${m.role === 'admin' ? adminShell(m, P) : nav.length > 1 ? `<nav class="tabs" aria-label="메뉴">${nav.map(id => `<button data-page="${id}" class="${id === page ? 'active' : ''}" ${id === page ? 'aria-current="page"' : ''}>${esc(Pages[id]?.label || id)}</button>`).join('')}</nav>` : ''}
      ${m.role === 'admin' ? '' : `<main id="main" class="page">${P ? P.render(ctx()) : ''}</main>`}
      <footer class="credit">${esc(CREDIT)}</footer>`;
  }
  function districtBar(m) {
    return `${DISTRICT_PAGES.includes(page) ? `<div class="admin-district"><label>교구 <select id="adminDistrict">${C.groups(state).map(g => `<option ${g.name === m.district ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label><span class="muted small">최고 관리자: 고른 교구의 화면으로 봅니다</span></div>` : ''}`;
  }
  function adminShell(m, P) {
    const label = id => Pages[id]?.label || id, area = areaOf(page) || ADMIN_AREAS[0], cur = area.items.find(([id]) => id === page);
    const svg = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
    return `<div class="admin-shell">
      <nav class="areas" aria-label="관리자 영역">${ADMIN_AREAS.map(a => `<button type="button" data-area="${a.key}" class="area-btn ${a === area ? 'active' : ''}" ${a === area ? 'aria-current="true"' : ''}>${svg(a.key)}<span class="area-text"><b>${esc(a.label)}</b><span class="area-hint">${esc(a.hint)}</span></span></button>`).join('')}</nav>
      <div class="admin-main">
        <div class="area-bar"><nav class="subtabs" aria-label="${esc(area.label)} 화면">${area.items.map(([id, desc]) => `<button type="button" data-page="${id}" class="${id === page ? 'active' : ''}" ${id === page ? 'aria-current="page"' : ''} title="${esc(desc)}">${esc(label(id))}</button>`).join('')}</nav>
          ${cur ? `<p class="subdesc">${esc(cur[1])}</p>` : ''}</div>
        ${districtBar(m)}<main id="main" class="page">${P ? P.render(ctx()) : ''}</main></div>
    </div>`;
  }
  function render() {
    if (!me().signedIn) return renderLogin();
    document.body.className = 'm-' + MINISTRY[me().role]?.[1];
    $('#app').innerHTML = shellHTML();
    const top = $('.top'); if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
    $$('[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));
    $('#refreshBtn').onclick = () => refresh();
    const ad = $('#adminDistrict'); if (ad) ad.onchange = () => { adminDistrict = ad.value; render(); };
    $$('[data-area]').forEach(b => b.onclick = () => { const a = ADMIN_AREAS.find(x => x.key === b.dataset.area); if (a && areaOf(page) !== a) go(a.items[0][0]); });
    $('#alertsBtn').onclick = () => go('alerts');
    $('#logoutBtn').onclick = async () => { if (await ask('로그아웃', '이 기기에서 로그아웃합니다. 다시 들어오려면 이름과 코드가 필요합니다.', '로그아웃')) { await store.signOut(); renderLogin('로그아웃했습니다.'); } };
    Pages[page]?.bind?.(ctx());
  }

  store.on((type, msg) => { if (type === 'signedout') { closeDialog(); renderLogin(msg); } });
  async function boot() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      const hadOld = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { }); });
      }).catch(() => { });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOld) showUpdate(); });
    }
    if (me().signedIn) await enter(); else renderLogin();
  }
  // 새 버전 알림 띠: 누르면 새로 고침(쓰던 내용이 있을 수 있어 저절로 새로 고치지는 않음)
  function showUpdate() {
    if (document.getElementById('updateBar')) return;
    const bar = document.createElement('div'); bar.id = 'updateBar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>새 버전이 있습니다.</span><button type="button" class="primary">새로 고침</button>';
    bar.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(bar);
  }
  root.HamkkeApp = { boot, ctx, NAV, ADMIN_AREAS, showUpdate, get state() { return state; } };
  if (!root.HAMKKE_NO_BOOT) document.addEventListener('DOMContentLoaded', boot);
})(window);
