/* 함께 돌봄 5.0 — 알림.
   ① 앱 안 알림 목록  ② 앱이 켜져 있을 때 시스템 알림(30분마다 확인, 종류별 하루 한 번)  ③ 꺼져 있어도 오는 알림(웹 푸시) 신청.
   시스템 알림 문구에는 이름·건강·가정사를 넣지 않고 숫자만 씁니다. 시험: tests/web/notify.test.cjs */
(function (root) {
  'use strict';
  const C = root.MinistryCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const K = root.CareCore || (typeof require !== 'undefined' ? require('./care.js') : null);
  const N = root.NewcomerCore || (typeof require !== 'undefined' ? require('./newcomer.js') : null);
  const TYPES = {
    recontact: { label: '다시 연락할 분', roles: ['visitor', 'district_pastor'], text: n => `오늘 다시 연락할 분이 ${n}명 있습니다.` },
    tomorrow: { label: '내일 연락할 분(전날 저녁)', roles: ['visitor', 'district_pastor'], text: n => `내일 연락할 분이 ${n}명 있습니다.` },
    birthday: { label: '담당 성도 생일', roles: ['visitor', 'district_pastor'], text: n => `오늘 생일인 분이 ${n}명 있습니다.` },
    newcomerLate: { label: '새가족 진행 늦어짐', roles: ['committee', 'newcomer_pastor', 'newcomer_admin'], text: n => `예정일이 지난 새가족 단계가 ${n}건 있습니다.` },
    makeup: { label: '교육 결석 후 보강', roles: ['committee', 'newcomer_pastor', 'newcomer_admin'], text: n => `보강이 필요한 새가족이 ${n}명 있습니다.` },
    report: { label: '주간 보고 승인', roles: ['visitor', 'committee'], text: () => '승인할 주간 보고서가 있습니다.' },
    longNoContact: { label: '오래 연락 못 한 분', roles: ['visitor', 'district_pastor'], text: n => `오래 연락하지 못한 분이 ${n}명 있습니다.` },
    requests: { label: '소통 메모 확인 요청', roles: ['committee', 'district_pastor', 'newcomer_pastor', 'newcomer_admin'], text: n => `확인 요청 메모가 ${n}건 있습니다.` },
  };
  const typesFor = role => Object.keys(TYPES).filter(k => TYPES[k].roles.includes(role));

  // 범위: 서버가 이미 권한 범위(같은 교구)의 자료만 보내 줍니다. 심방은 교구 전체를 셉니다(오늘 할 일과 같음).
  function compute(state, me, at = K.now()) {
    const today = C.iso(at), tomorrow = C.iso(new Date(at.getTime() + 86400000));
    const mine = () => true; // 심방은 교구 전체(같은 교구 사역자가 함께 봄)
    const care = K.carePeople(state).filter(mine);
    const nextOf = p => K.lastVisit(state, p.id)?.nextDate;
    const out = {};
    const add = (type, people, page) => { if (typesFor(me.role).includes(type) && people.length) out[type] = { type, count: people.length, page, names: people.map(p => p.name).slice(0, 5) }; };
    add('recontact', care.filter(p => nextOf(p) && nextOf(p) <= today), 'today');
    add('tomorrow', care.filter(p => nextOf(p) === tomorrow), 'today');
    add('birthday', care.filter(p => C.birthdayDistance(p, today) === 0), 'today');
    const ncs = N.newcomers(state).filter(p => N.progressOf(state, p.id).status !== 'paused');
    const late = ncs.flatMap(p => N.stages(state, p, today).filter(s => s.overdue).map(() => p));
    add('newcomerLate', late, 'board');
    add('makeup', ncs.filter(p => needsMakeup(state, p.id)), 'board');
    const w = K.reportWindow(0, at), type = me.role === 'committee' ? 'newcomer' : 'visit';
    const hasRows = me.role === 'committee' ? N.newcomers(state).length > 0 : K.visitDraft(state, me, w).rows.length > 0;
    if (['visitor', 'committee'].includes(me.role) && hasRows && !K.latestReport(state, type, me.userId, w.key)) out.report = { type: 'report', count: 1, page: me.role === 'committee' ? 'nreport' : 'report', names: [] };
    add('longNoContact', K.longNoContact(state, today).map(x => x.p).filter(mine), 'today');
    add('requests', N.openRequests(state, me).map(n => state.people.find(p => p.id === n.personId)).filter(Boolean), me.role === 'district_pastor' ? 'handover' : 'board');
    return Object.values(out);
  }
  // 결석했지만 그 과목을 아직 이수하지 않은 새가족
  function needsMakeup(state, pid) {
    const done = C.completed(state, pid, 'welcome');
    return state.education.some(e => e.personId === pid && e.course === 'welcome' && e.status === 'absent' && !done.has(String(Number(e.subject))));
  }

  // 종류별 켜고 끄기(기기마다). 기본은 모두 켬. "오래 연락 못 한 분"은 자주 울리지 않게 시스템 알림은 기본 끔.
  const PREF_KEY = 'hamkke.notify.prefs.v1', SHOWN_KEY = 'hamkke.notify.shown.v1';
  const ls = () => { try { return root.document ? root.localStorage : null; } catch (_) { return null; } };
  function prefs() { let p = {}; try { p = JSON.parse(ls()?.getItem(PREF_KEY) || '{}'); } catch (_) { } return { ...Object.fromEntries(Object.keys(TYPES).map(k => [k, k !== 'longNoContact'])), ...p }; }
  function setPrefs(p) { try { ls()?.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) { } }
  // 시스템 알림 문구: 숫자만. 같은 종류는 하루 한 번만.
  function systemMessages(items, p = prefs(), at = K.now(), shown = readShown()) {
    const day = C.iso(at);
    return items.filter(x => p[x.type] && shown[x.type] !== day && x.type !== 'tomorrow').map(x => ({ type: x.type, title: '함께 돌봄', body: TYPES[x.type].text(x.count) }));
  }
  function readShown() { try { return JSON.parse(ls()?.getItem(SHOWN_KEY) || '{}'); } catch (_) { return {}; } }
  function markShown(types, at = K.now()) { const s = readShown(), d = C.iso(at); for (const t of types) s[t] = d; try { ls()?.setItem(SHOWN_KEY, JSON.stringify(s)); } catch (_) { } }

  const api = { TYPES, typesFor, compute, needsMakeup, prefs, setPrefs, systemMessages, markShown, readShown };
  root.NotifyCore = api;
  if (typeof module !== 'undefined') module.exports = api;

  // ── 아래는 화면(브라우저)에서만
  if (!root.document || !root.UI) return;
  const { $, $$, esc, toast } = root.UI;
  const Pages = root.HamkkePages = root.HamkkePages || {};
  const env = () => {
    const ua = root.navigator?.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && root.navigator?.maxTouchPoints > 1);
    const standalone = root.matchMedia?.('(display-mode: standalone)').matches || root.navigator?.standalone === true;
    return { ios, standalone, notif: 'Notification' in root, perm: 'Notification' in root ? root.Notification.permission : 'unsupported', push: 'serviceWorker' in (root.navigator || {}) && 'PushManager' in root };
  };

  Pages.alerts = {
    label: '알림',
    render(ctx) {
      const items = compute(ctx.state, ctx.me), p = prefs(), e = env(), types = typesFor(ctx.me.role);
      const vapid = (root.HAMKKE_CONFIG || {}).vapidPublicKey;
      const permText = { granted: '허용됨', denied: '거절됨(기기 설정에서 다시 허용해야 합니다)', default: '아직 묻지 않음', unsupported: '이 브라우저는 알림을 지원하지 않음' }[e.perm];
      return `<div class="eyebrow">알림</div><h1 class="page-title">알림</h1>
      <section class="card"><h2>지금 확인할 것 <span class="chip">${items.length}</span></h2>
        ${items.length ? `<div class="list">${items.map(x => `<div class="row"><div class="grow"><b>${esc(TYPES[x.type].text(x.count))}</b>${x.names.length ? `<div class="muted small">${x.names.map(esc).join(', ')}${x.count > x.names.length ? ' 외' : ''}</div>` : ''}</div><button type="button" data-goto="${x.page}">보기</button></div>`).join('')}</div>` : '<p class="muted">지금 확인할 알림이 없습니다.</p>'}</section>
      <section class="card"><h2>받을 알림 고르기</h2><p class="muted small">이 기기에만 적용됩니다. 알림에는 이름이나 사정을 넣지 않고 "몇 명"만 알려 드립니다.</p>
        <form id="prefForm">${types.map(k => `<label class="check"><input type="checkbox" name="${k}" ${p[k] ? 'checked' : ''}> ${esc(TYPES[k].label)}</label>`).join('')}<div class="acts"><button class="primary">저장</button></div></form></section>
      <section class="card"><h2>이 기기에서 알림 받기</h2>
        <p>알림 허용: <b>${esc(permText)}</b></p>
        ${e.ios && !e.standalone ? '<p class="notice">iPhone은 Safari에서 "홈 화면에 추가"한 뒤, 홈 화면의 함께 돌봄 아이콘으로 열어야 알림을 받을 수 있습니다(iOS 16.4 이상).</p>' : ''}
        <ul class="small"><li><b>앱이 켜져 있을 때:</b> 30분마다 확인해 화면 구석에 알려 드립니다(종류별 하루 한 번).</li>
          <li><b>앱이 꺼져 있을 때:</b> ${vapid ? '서버가 아침 7시 30분 · 저녁 8시 · 주일 10시 5분에 보내 드립니다. 컴퓨터는 브라우저가 실행 중이어야 합니다.' : '교회 서버에 알림 설정이 아직 되어 있지 않아 받을 수 없습니다. 관리자에게 문의해 주세요.'}</li></ul>
        <div class="acts">${e.perm === 'granted' ? '' : `<button type="button" id="askPerm" class="primary" ${e.notif && e.perm !== 'denied' ? '' : 'disabled'}>알림 허용하기</button>`}
          ${vapid && e.push && e.perm === 'granted' ? '<button type="button" id="pushOn">꺼져 있을 때도 받기</button><button type="button" id="pushOff" class="quiet">이 기기 알림 그만 받기</button>' : ''}
          ${e.perm === 'granted' ? '<button type="button" id="testNotif">시험 알림 보내기</button>' : ''}</div></section>`;
    },
    bind(ctx) {
      $$('[data-goto]').forEach(b => b.onclick = () => ctx.go(b.dataset.goto));
      $('#prefForm').onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target), p = prefs();
        for (const k of typesFor(ctx.me.role)) p[k] = f.get(k) === 'on';
        setPrefs(p); toast('알림 설정을 저장했습니다.');
        if (await pushRegistered()) subscribe(ctx, true).catch(() => { });
      };
      const ask = $('#askPerm'); if (ask) ask.onclick = async () => { try { await root.Notification.requestPermission(); } catch (_) { } ctx.render(); };
      const on = $('#pushOn'); if (on) on.onclick = () => subscribe(ctx).then(() => toast('이 기기에서 꺼져 있을 때도 알림을 받습니다.')).catch(e => toast(e.message));
      const off = $('#pushOff'); if (off) off.onclick = () => unsubscribe().then(() => toast('이 기기 알림을 그만 받습니다.')).catch(e => toast(e.message));
      const t = $('#testNotif'); if (t) t.onclick = () => show('함께 돌봄', '시험 알림입니다. 이렇게 보입니다.');
    },
  };

  async function show(title, body) {
    try {
      const reg = await root.navigator.serviceWorker?.getRegistration?.();
      if (reg?.showNotification) return reg.showNotification(title, { body, icon: 'icon.svg', tag: 'hamkke-' + body.length });
      return new root.Notification(title, { body, icon: 'icon.svg' });
    } catch (_) { }
  }
  // 앱이 켜져 있을 때: 열 때와 30분마다 확인
  function check(ctx) {
    if (!ctx?.me?.signedIn || env().perm !== 'granted') return;
    const msgs = systemMessages(compute(ctx.state, ctx.me));
    msgs.forEach(m => show(m.title, m.body));
    markShown(msgs.map(m => m.type));
  }
  let timer = null;
  function start(getCtx) { clearInterval(timer); setTimeout(() => check(getCtx()), 3000); timer = setInterval(() => check(getCtx()), 30 * 60000); }

  // 꺼져 있을 때 받기: 브라우저의 푸시 구독을 교회 서버에 저장(내 것만 읽고 쓸 수 있음)
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
  async function pushRegistered() { try { const r = await root.navigator.serviceWorker.getRegistration(); return !!(await r?.pushManager.getSubscription()); } catch (_) { return false; } }
  async function subscribe(ctx, quiet) {
    const key = (root.HAMKKE_CONFIG || {}).vapidPublicKey;
    if (!key) throw Error('교회 서버에 알림 설정이 아직 없습니다.');
    const reg = await root.navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    const j = sub.toJSON(), p = prefs();
    await root.HamkkeStore.request('/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ church_id: root.HamkkeStore.status().churchId, endpoint: j.endpoint, keys: j.keys, prefs: Object.fromEntries(typesFor(ctx.me.role).map(k => [k, !!p[k]])) }) });
    if (!quiet) ctx.render();
  }
  async function unsubscribe() {
    const reg = await root.navigator.serviceWorker.getRegistration(), sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await root.HamkkeStore.request('/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(sub.endpoint), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => { });
    await sub.unsubscribe();
  }
  Object.assign(api, { check, start, show, env, subscribe, unsubscribe });
})(typeof window !== 'undefined' ? window : globalThis);
