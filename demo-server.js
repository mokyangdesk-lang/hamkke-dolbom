/* 함께 돌봄 시연 모드 — 브라우저 안의 가상 서버.
   진짜 서버(Supabase) 대신 이 파일이 요청을 받아, 서버와 같은 권한 규칙(server/01-schema.sql의 church_access)으로 답합니다.
   자료는 모두 가상이며 이 기기에만 저장됩니다("처음으로"를 누르면 처음 상태로). 실제 서버로는 아무것도 보내지 않습니다.
   시험: tests/web/demo.test.mjs */
(function (root) {
  'use strict';
  const BASE = 'https://demo.hamkke.invalid', CHURCH = '00000000-0000-4000-8000-00000000c0de';
  root.HAMKKE_DEMO = true;
  root.HAMKKE_CONFIG = { url: BASE, key: 'sb_publishable_demo', churchId: CHURCH, vapidPublicKey: '' };

  // ── 시연 저장 공간: 실제 앱과 같은 주소에 올려도 로그인·자료가 섞이지 않게 'hamkke.'로 시작하는 이름 앞에 'demo.'를 붙입니다.
  const S = root.Storage && root.Storage.prototype;
  if (S && !S.__demo) {
    const g = S.getItem, s = S.setItem, r = S.removeItem, map = k => (typeof k === 'string' && k.startsWith('hamkke.') ? 'demo.' + k : k);
    S.getItem = function (k) { return g.call(this, map(k)); };
    S.setItem = function (k, v) { return s.call(this, map(k), v); };
    S.removeItem = function (k) { return r.call(this, map(k)); };
    S.__demo = true;
  }
  const ls = root.localStorage, DB_KEY = 'demo.db.v1', OFF_KEY = 'demo.offset.v1';

  // ── 시연 시각: "주일 오전 10시로 넘기기"로 앞당길 수 있습니다(주간 보고 시연용).
  const offset = () => Number(ls.getItem(OFF_KEY) || 0) || 0;
  const demoNow = () => new Date(Date.now() + offset());
  try { Object.defineProperty(root, 'HAMKKE_TEST_NOW', { configurable: true, get: () => demoNow().toISOString() }); } catch (_) { }
  function jumpToSunday10() {
    const now = demoNow(), t = new Date(now); t.setHours(10, 5, 0, 0);
    t.setDate(t.getDate() + ((7 - t.getDay()) % 7)); if (t <= now) t.setDate(t.getDate() + 7);
    ls.setItem(OFF_KEY, String(offset() + (t - now)));
    return t;
  }

  // ── 시연 인물(모두 가상)
  const id = n => 'd0000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const PEOPLE_OF_DEMO = [
    { key: 'visitor', id: id(1), name: '김은혜', title: '권사', role: 'visitor', district: '5교구', extra: [], phone: '010-0000-0101', desc: '심방사역자' },
    { key: 'visitor2', id: id(2), name: '박소망', title: '권사', role: 'visitor', district: '5교구', extra: [], phone: '010-0000-0102', desc: '심방사역자 · 같은 교구 명단 공유' },
    { key: 'committee', id: id(3), name: '이믿음', title: '집사', role: 'committee', district: '5교구', extra: [], phone: '010-0000-0103', desc: '새가족위원' },
    { key: 'pastor', id: id(4), name: '정목자', title: '목사', role: 'district_pastor', district: '5교구', extra: [], phone: '010-0000-0104', desc: '교구 목사' },
    { key: 'npastor', id: id(5), name: '한새벽', title: '목사', role: 'newcomer_pastor', district: '', extra: ['newcomer_admin'], phone: '010-0000-0105', desc: '새가족 담당 목사 + 새가족 관리자(겸직)' },
    { key: 'lead', id: id(6), name: '서온유', title: '목사', role: 'visit_lead', district: '', extra: [], phone: '010-0000-0106', desc: '심방 총괄' },
    { key: 'admin', id: id(9), name: '관리자', title: '', role: 'admin', district: '', extra: [], phone: '', desc: '전체 관리자' },
  ];
  const OTHER_STAFF = [
    [id(11), '최온누리', 'district_pastor', '3교구'], [id(12), '오선한', 'district_pastor', '7교구'], [id(13), '문평안', 'visitor', '3교구'], [id(14), '배기쁨', 'committee', '7교구'],
  ];

  // ── 자료 저장
  let db = null;
  function load() { if (db) return db; try { db = JSON.parse(ls.getItem(DB_KEY) || 'null'); } catch (_) { db = null; } if (!db) { db = seed(); save(); } return db; }
  function save() { try { ls.setItem(DB_KEY, JSON.stringify(db)); } catch (_) { } }
  function reset() { db = null; const keys = []; for (let i = 0; i < ls.length; i++) keys.push(ls.key(i)); for (const k of keys) if (k && k.startsWith('demo.')) ls.removeItem(k); }

  // ── 가상 명단과 기록
  function seed() {
    const C = root.MinistryCore, K = root.CareCore, N = root.NewcomerCore;
    const now = demoNow(), iso = C.iso, day = n => { const d = new Date(now); d.setDate(d.getDate() + n); return d; }, dIso = n => iso(day(n));
    const md = n => dIso(n).slice(5);
    const recs = {}, put = (kind, p, owner = id(9)) => { recs[kind + '/' + p.id] = { kind, id: p.id, payload: p, version: 1, owner }; };
    put('settings', { id: 'groups', districts: [...Array.from({ length: 8 }, (_, i) => ({ name: (i + 1) + '교구', visitors: true })), { name: '청장년교구', visitors: false }] });
    // 5교구 돌봄 성도(가상)
    const care = [
      ['김순자', '권사', '1951-' + md(0)], ['이영희', '집사', '1958-' + md(3)], ['박정자', '권사', '1949-' + md(6)], ['최옥순', '권사', '1955-03-14'], ['정미경', '집사', '1966-07-02'],
      ['강은숙', '권사', '1953-12-24'], ['조영수', '장로', '1950-02-11'], ['윤명숙', '집사', '1962-09-30'], ['장복순', '권사', '1947-05-05'], ['임춘자', '권사', '1952-10-19'],
      ['한상철', '안수집사', '1960-06-21'], ['오진우', '성도', '1975-01-08'], ['서민정', '집사', '1979-04-27'], ['신동철', '성도', '1968-08-16'], ['권혜자', '권사', '1956-11-03'], ['황보람', '성도', '1984-02-28'],
    ].map(([name, office, birthDate], i) => ({ id: 'C5-' + String(i + 1).padStart(2, '0'), name, office, birthDate, birthCalendar: 'solar', district: '5교구', newcomer: false, phone: '010-0000-' + String(1001 + i) }));
    const others = [['3교구', '노은총'], ['3교구', '유성실'], ['7교구', '남겸손'], ['7교구', '안화평']].map(([d, name], i) => ({ id: 'CX-' + (i + 1), name, office: '집사', birthDate: '1960-01-0' + (i + 1), birthCalendar: 'solar', district: d, newcomer: false, phone: '010-0000-' + String(1101 + i) }));
    for (const p of [...care, ...others]) put('people', p);
    // 연락 기록: 재연락할 분, 최근 연락, 지난주(보고 기간) 기록
    const V = [id(1), '김은혜'], V2 = [id(2), '박소망'];
    const st = { ...C.empty(), people: [...care, ...others] };
    const w0 = K.reportWindow(0, now), w1 = K.reportWindow(1, now);
    const inW = (w, h) => new Date(w.start.getTime() + h * 3600000);
    const visit = (pid, who, at, result, extra = {}) => {
      const v = { id: 'V-' + pid + '-' + at.getTime().toString(36), personId: pid, authorId: who[0], authorName: who[1], createdAt: at.toISOString(), date: iso(at), result,
        affiliation: '본교회 출석', careNeed: '특이사항 없음', memo: '', prayer: '', prayerInReport: true, nextDate: '', ...extra };
      st.visits.push(v); put('visits', v, who[0]);
    };
    visit('C5-04', V, inW(w1, 30), '통화 완료', { memo: '안부 전화, 무릎 수술 후 회복 중이심', careNeed: '재연락', nextDate: dIso(0), prayer: '빠른 회복' });
    visit('C5-05', V2, inW(w1, 52), '부재', { nextDate: dIso(-1) });
    visit('C5-06', V, inW(w0, 26), '통화 완료', { memo: '사랑방 모임 참석 권면', prayer: '자녀 진로' });
    visit('C5-07', V, inW(w0, 50), '방문 완료', { memo: '가정 심방, 함께 기도', prayer: '가정의 평안' });
    visit('C5-08', V, inW(w0, 75), '문자 남김');
    visit('C5-09', V2, inW(w0, 30), '통화 완료', { memo: '주일 예배 출석 안부', prayer: '건강' });
    visit('C5-10', V2, inW(w0, 98), '부재', { nextDate: dIso(2) });
    visit('C5-11', V2, inW(w0, 120), '통화 완료', { memo: '새 직장 출근 축하' });
    // 새가족(5교구 일곱 분 + 다른 교구 두 분). 각자 다른 단계에 있습니다.
    const nc = [
      ['N5-01', '최새봄', -3], ['N5-02', '박하늘', -10], ['N5-03', '이소망', -21], ['N5-04', '김다윗', -35], ['N5-05', '정한나', -63], ['N5-06', '강요셉', -98], ['N5-07', '윤사라', -112],
    ].map(([pid, name, reg], i) => ({ id: pid, name, district: '5교구', newcomer: true, registeredAt: dIso(reg), phone: '010-0000-' + String(2001 + i), birthDate: '', office: '성도' }));
    const ncOther = [{ id: 'N3-01', name: '오믿음', district: '3교구', newcomer: true, registeredAt: dIso(-6), phone: '010-0000-2101', office: '성도' }, { id: 'N7-01', name: '서기쁨', district: '7교구', newcomer: true, registeredAt: dIso(-40), phone: '010-0000-2102', office: '성도' }];
    const mentors = [{ id: 'M5-1', name: '조은혜', phone: '010-0000-3001', district: '5교구', trained: true, active: true, capacity: 2 }, { id: 'M5-2', name: '문사랑', phone: '010-0000-3002', district: '5교구', trained: true, active: true, capacity: 2 }, { id: 'M7-1', name: '배온유', phone: '010-0000-3003', district: '7교구', trained: true, active: true, capacity: 1 }];
    nc[4].mentorId = 'M5-1'; nc[5].mentorId = 'M5-2'; nc[6].mentorId = 'M5-2';
    for (const p of [...nc, ...ncOther]) put('people', p);
    for (const m of mentors) put('mentors', m);
    st.people.push(...nc, ...ncOther); st.mentors.push(...mentors);
    const edu = (pid, course, subjects, ago, status = 'completed') => subjects.forEach((s, i) => { const e = { id: 'E-' + pid + '-' + course + '-' + s, personId: pid, course, subject: String(s), status, date: dIso(ago + i * 7) }; st.education.push(e); put('education', e, id(5)); });
    edu('N5-03', 'welcome', [1, 2], -15); edu('N5-03', 'welcome', [3], -1, 'absent');
    edu('N5-04', 'welcome', [1, 2, 3, 4], -28); edu('N5-05', 'welcome', [1, 2, 3, 4], -56); edu('N5-05', 'fellowship', [1, 2, 3, 4, 5], -35);
    edu('N5-06', 'welcome', [1, 2, 3, 4], -91); edu('N5-06', 'fellowship', [1, 2, 3, 4, 5, 6, 7, 8], -63); edu('N5-07', 'welcome', [1, 2, 3, 4], -105); edu('N5-07', 'fellowship', [1, 2, 3, 4, 5, 6, 7, 8], -77);
    edu('N7-01', 'welcome', [1, 2, 3, 4], -33);
    const done = n => ({ completedAt: dIso(n) });
    const prog = (pid, milestones, status = 'active') => { const r = { id: pid, personId: pid, status, milestones }; st.progress.push(r); put('progress', r, id(3)); };
    prog('N5-01', { welcomeCall: { dueAt: dIso(-1) } });
    prog('N5-02', { welcomeCall: done(-8), groupInvite: { dueAt: dIso(2) } });
    prog('N5-03', { welcomeCall: done(-20), groupInvite: done(-19) });
    prog('N5-04', { welcomeCall: done(-34), groupInvite: done(-33) });
    prog('N5-05', { welcomeCall: done(-62), groupInvite: done(-61) });
    prog('N5-06', { welcomeCall: done(-97), groupInvite: done(-96), friends: done(-20), loveGroup: { completedAt: dIso(-6), name: '5-3 사랑방' } });
    prog('N5-07', { welcomeCall: done(-111), groupInvite: done(-110), friends: done(-40), loveGroup: { completedAt: dIso(-20), name: '5-1 사랑방' }, settled: done(-2) }, 'settled');
    // 소통 메모: 교구 목사의 확인 요청(아직 안 닫힘), 위원의 진행 메모
    const note = (pid, who, text, request, ago) => { const n = { id: 'NT-' + pid + '-' + who[0].slice(-2), personId: pid, authorId: who[0], authorName: who[1], authorRole: who[2], text, request, createdAt: day(ago).toISOString() }; st.notes.push(n); put('notes', n, who[0]); };
    note('N5-03', [id(4), '정목자', 'district_pastor'], '3과 결석하셨는데 보강 일정을 이번 주 안에 안내해 주실 수 있을까요?', true, -1);
    note('N5-05', [id(3), '이믿음', 'committee'], '조은혜 도우미님과 5주차까지 잘 진행 중입니다.', false, -4);
    // 지난주 승인된 보고(사역자 둘, 위원 한 분)
    for (const who of [V, V2]) { const r = K.makeReport(K.visitDraft(st, { userId: who[0], name: who[1], district: '5교구' }, w0), '', null, new Date(w0.end.getTime() + 3 * 3600000)); put('reports', r, who[0]); }
    { const r = K.makeReport(N.newcomerDraft(st, { userId: id(3), name: '이믿음', district: '5교구' }, w0), '', null, new Date(w0.end.getTime() + 4 * 3600000)); put('reports', r, id(3)); }
    const staff = [...PEOPLE_OF_DEMO.filter(p => p.role !== 'admin').map(p => ({ user_id: p.id, display_name: p.name, role: p.role, district: p.district, extra_roles: p.extra, phone: p.phone })),
      ...OTHER_STAFF.map(([u, n, r, d]) => ({ user_id: u, display_name: n, role: r, district: d, extra_roles: [], phone: '' }))]
      .map(s => ({ church_id: CHURCH, staff_id: 'S' + s.user_id.slice(-4), status: 'active', created_at: now.toISOString(), code_issued_at: now.toISOString(), ...s }));
    const members = Object.fromEntries([...PEOPLE_OF_DEMO.map(p => [p.id, { church_id: CHURCH, user_id: p.id, role: p.role, district: p.district, extra_roles: p.extra, staff_id: 'S' + p.id.slice(-4) }]),
      ...OTHER_STAFF.map(([u, , r, d]) => [u, { church_id: CHURCH, user_id: u, role: r, district: d, extra_roles: [], staff_id: 'S' + u.slice(-4) }])]);
    return { recs, staff, members, codes: {}, audit: [] };
  }

  // ── 권한(서버 규칙 church_access와 같음)
  const rolesOf = m => [...new Set([m.role, ...(m.extra_roles || [])].filter(Boolean))];
  function accessRole(r, d, k, p, o, w, uid) {
    if (k === 'settings') return !w;
    if (k === 'reports') {
      if (w) return o === uid && p.authorId === uid && !!d && p.district === d && ((r === 'visitor' && p.type === 'visit') || (r === 'committee' && p.type === 'newcomer'));
      return o === uid || (r === 'visit_lead' && p.type === 'visit') || (r === 'district_pastor' && !!d && p.district === d) || (r === 'newcomer_pastor' && p.type === 'newcomer');
    }
    if (k === 'mentors') {
      if (r === 'newcomer_admin') return true; if (w) return false;
      return r === 'newcomer_pastor' || (['district_pastor', 'committee'].includes(r) && !!d && p.district === d);
    }
    const person = k === 'people' ? p : db.recs['people/' + p.personId]?.payload;
    if (!person || !person.district) return false;
    const nc = !!person.newcomer, same = !!d && person.district === d;
    if (w && ['visits', 'notes'].includes(k) && o === uid && p.authorId !== uid) return false;
    if (['newcomer_pastor', 'newcomer_admin'].includes(r)) { if (!nc) return false; if (!w) return ['people', 'progress', 'education', 'visits', 'notes'].includes(k); return (k === 'people' && r === 'newcomer_admin') || ['progress', 'education', 'notes'].includes(k); }
    if (r === 'district_pastor') { if (!same) return false; if (!w) return ['people', 'progress', 'education', 'visits', 'notes'].includes(k); return k === 'people' || k === 'notes' || (k === 'visits' && o === uid); }
    if (r === 'committee') { if (!(same && nc)) return false; if (!w) return ['people', 'progress', 'education', 'visits', 'notes'].includes(k); return ['progress', 'notes', 'education'].includes(k) || (k === 'visits' && o === uid); }
    if (r === 'visit_lead') { if (nc) return false; if (!w) return ['people', 'visits'].includes(k); return k === 'visits' && o === uid; }
    if (r === 'visitor') { if (!(same && !nc)) return false; if (!w) return ['people', 'visits'].includes(k); return k === 'visits' && o === uid; }
    return false;
  }
  function access(m, k, p, o, w) { if (!m) return false; if (m.role === 'admin') return true; return rolesOf(m).some(r => accessRole(r, m.district, k, p, o, w, m.user_id)); }
  function canSeeStaff(m, s) {
    if (!m) return false; if (m.role === 'admin') return true;
    const mine = rolesOf(m), theirs = [s.role, ...(s.extra_roles || [])];
    return theirs.some(r => (mine.includes('district_pastor') && m.district && m.district === s.district && ['visitor', 'committee'].includes(r)) || (mine.includes('visit_lead') && r === 'visitor'));
  }

  // ── 담당자 함수(staff-gateway)의 시연판: 등록·코드 발급·재발급·중지·변경과, 발급한 코드로 로그인
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const makeCode = () => { const b = new Uint8Array(20); if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b); else for (let i = 0; i < 20; i++) b[i] = Math.floor(Math.random() * 256); return [...b].map(x => ALPHA[x % 32]).join('').match(/.{5}/g).join('-'); };
  const norm = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nameKey = n => String(n || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
  const session = uid => ({ access_token: 'demo~' + uid, refresh_token: 'demo~' + uid, expires_at: 4102444800, user: { id: uid, email: uid === id(9) ? 'admin@demo.invalid' : '' } });
  function gateway(body, who) {
    const ok = b => [200, b], err = (s, e) => [s, { error: e }];
    if (body.action === 'login') {
      const s = db.staff.find(x => x.status === 'active' && nameKey(x.display_name) === nameKey(body.name) && db.codes[x.user_id] && db.codes[x.user_id] === norm(body.code));
      return s ? ok({ session: session(s.user_id), name: s.display_name }) : err(401, '이름 또는 코드가 맞지 않습니다. (시연: 위쪽 "인물 바꾸기"로 들어가세요)');
    }
    if (!db.members[who] || db.members[who].role !== 'admin') return err(403, '관리자만 사용할 수 있습니다.');
    const ROLES = ['newcomer_pastor', 'newcomer_admin', 'district_pastor', 'committee', 'visitor', 'visit_lead'], NEED = ['district_pastor', 'committee', 'visitor'];
    const extrasOf = (role, x) => [...new Set((x || []).map(String))].filter(r => ROLES.includes(r) && r !== role);
    const place = (roles, d) => roles.some(r => NEED.includes(r)) ? String(d || '').trim() : '';
    if (body.action === 'create') {
      const role = body.role, extras = extrasOf(role, body.extraRoles), district = place([role, ...extras], body.district);
      if (!ROLES.includes(role)) return err(400, '역할을 확인해 주세요.');
      if ([role, ...extras].some(r => NEED.includes(r)) && !district) return err(400, '이 역할은 교구를 정해야 합니다.');
      const uid = 'd' + Date.now().toString(16).slice(-7) + '-0000-4000-8000-' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0'), code = makeCode();
      db.members[uid] = { church_id: CHURCH, user_id: uid, role, district, extra_roles: extras, staff_id: 'S' + uid.slice(-4) };
      db.staff.unshift({ church_id: CHURCH, user_id: uid, display_name: String(body.name || '').trim(), role, district, extra_roles: extras, phone: String(body.phone || ''), staff_id: 'S' + uid.slice(-4), status: 'active', created_at: new Date().toISOString(), code_issued_at: new Date().toISOString() });
      db.codes[uid] = norm(code); db.audit.unshift({ at: new Date().toISOString(), action: 'create', target: uid });
      return ok({ userId: uid, code });
    }
    if (body.action === 'myRoles') {
      const extras = extrasOf('admin', body.extraRoles); Object.assign(db.members[who], { extra_roles: extras, district: place(extras, body.district) });
      return ok({ ok: true });
    }
    const s = db.staff.find(x => x.user_id === body.userId); if (!s) return err(404, '담당자를 찾을 수 없습니다.');
    const log = action => db.audit.unshift({ at: new Date().toISOString(), action, target: s.user_id });
    if (body.action === 'reissue') { const code = makeCode(); db.codes[s.user_id] = norm(code); s.code_issued_at = new Date().toISOString(); log('reissue'); return ok({ code }); }
    if (body.action === 'suspend') { s.status = 'suspended'; delete db.members[s.user_id]; log('suspend'); return ok({ ok: true }); }
    if (body.action === 'resume') { s.status = 'active'; db.members[s.user_id] = { church_id: CHURCH, user_id: s.user_id, role: s.role, district: s.district, extra_roles: s.extra_roles || [], staff_id: s.staff_id }; log('resume'); return ok({ ok: true }); }
    if (body.action === 'delete') { if (s.status !== 'suspended') return err(400, '먼저 "접근 중지"를 한 뒤 지울 수 있습니다.'); db.staff = db.staff.filter(x => x !== s); delete db.members[s.user_id]; delete db.codes[s.user_id]; log('delete'); return ok({ ok: true }); }
    if (body.action === 'update') {
      const role = body.role || s.role, extras = extrasOf(role, body.extraRoles !== undefined ? body.extraRoles : s.extra_roles), district = place([role, ...extras], body.district ?? s.district);
      Object.assign(s, { role, district, extra_roles: extras }, body.phone !== undefined ? { phone: body.phone } : {});
      if (db.members[s.user_id]) Object.assign(db.members[s.user_id], { role, district, extra_roles: extras });
      log('update'); return ok({ ok: true });
    }
    return err(400, '알 수 없는 요청입니다.');
  }

  // ── 저장: 한 묶음은 전부 되거나 전부 취소(서버 church_apply와 같음)
  function apply(m, changes) {
    const out = [], before = JSON.stringify(db.recs);
    try {
      for (const ch of changes) {
        const key = ch.kind + '/' + ch.id, old = db.recs[key];
        if ((old ? old.version : 0) !== (ch.expected || 0)) throw Error('CONFLICT: ' + key);
        if (old && ch.kind === 'reports' && m.role !== 'admin') throw Error('REPORT_LOCKED: approved reports cannot be changed');
        if (old && !access(m, ch.kind, old.payload, old.owner, true)) throw Error('Permission denied for ' + key);
        const owner = old ? old.owner : m.user_id;
        if (ch.delete) { if (m.role !== 'admin') throw Error('Only admin can delete'); delete db.recs[key]; continue; }
        if (!access(m, ch.kind, ch.payload, owner, true)) throw Error('Permission denied for ' + key);
        db.recs[key] = { kind: ch.kind, id: ch.id, payload: ch.payload, version: (old ? old.version : 0) + 1, owner };
        out.push({ kind: ch.kind, id: ch.id, version: db.recs[key].version });
      }
    } catch (e) { db.recs = JSON.parse(before); throw e; }
    save(); return out;
  }

  // ── 요청 가로채기: 시연 주소로 가는 요청만 여기서 답하고, 나머지(글꼴 등)는 원래대로 보냅니다.
  const realFetch = root.fetch ? root.fetch.bind(root) : null;
  const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  root.fetch = async function (url, opt = {}) {
    const u = String(url && url.url ? url.url : url);
    if (!u.startsWith(BASE)) return realFetch(url, opt);
    load();
    await new Promise(r => setTimeout(r, 80)); // 실제 서버처럼 아주 잠깐 기다림
    const p = new URL(u), body = opt.body ? JSON.parse(opt.body) : {}, auth = String((opt.headers || {}).Authorization || '').replace('Bearer ', '');
    const who = auth.startsWith('demo~') ? auth.slice(5) : null, m = who ? db.members[who] : null;
    try {
      if (p.pathname === '/functions/v1/staff-gateway') { const [s, b] = gateway(body, who); save(); return json(s, b); }
      if (p.pathname === '/auth/v1/token') {
        if (body.refresh_token && String(body.refresh_token).startsWith('demo~')) return json(200, session(body.refresh_token.slice(5)));
        return body.email === 'admin@demo.invalid' ? json(200, session(id(9))) : json(400, { error_description: 'Invalid login credentials' });
      }
      if (p.pathname === '/auth/v1/logout') return json(204, null);
      if (p.pathname === '/auth/v1/user') return json(200, { id: who });
      if (!who) return json(401, { message: 'JWT expired' });
      if (p.pathname === '/rest/v1/church_members') return json(200, m ? [m] : []);
      if (!m) return json(400, { message: 'Membership required' });
      if (p.pathname === '/rest/v1/church_records') return json(200, Object.values(db.recs).filter(r => access(m, r.kind, r.payload, r.owner, false)).map(r => ({ kind: r.kind, id: r.id, payload: JSON.parse(JSON.stringify(r.payload)), version: r.version })));
      if (p.pathname === '/rest/v1/rpc/church_apply') return json(200, apply(m, body.changes || []));
      if (p.pathname === '/rest/v1/staff_accounts') return json(200, db.staff.filter(s => canSeeStaff(m, s)));
      if (p.pathname === '/rest/v1/staff_audit') return json(200, m.role === 'admin' ? db.audit.slice(0, 30) : []);
      if (p.pathname.indexOf('/rest/v1/push_subscriptions') === 0) return json(200, []);
      return json(404, { message: 'not in demo: ' + p.pathname });
    } catch (e) { return json(400, { message: e.message }); }
  };

  // 시연 화면(demo-ui.js)이 씁니다.
  root.HamkkeDemo = {
    PEOPLE: PEOPLE_OF_DEMO, demoNow, jumpToSunday10, reset,
    signInAs(key) { const p = PEOPLE_OF_DEMO.find(x => x.key === key); if (!p) return; load(); ls.setItem('hamkke.session.v5', JSON.stringify({ ...session(p.id), displayName: p.name })); ls.setItem('demo.persona', key); },
    current() { return PEOPLE_OF_DEMO.find(x => x.key === ls.getItem('demo.persona')) || null; },
    _db: () => load(),
  };
})(window);
