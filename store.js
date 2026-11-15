/* 함께 돌봄 5.0 — 서버(Supabase) 연결. 서버가 원본이고, 이 기기에는 로그인 상태와 서버 주소만 남깁니다.
   - 로그인: 이름 + 관리자가 발급한 코드(staff-gateway). 관리자는 이메일 로그인도 가능.
   - 로그인은 이 기기에서 유지됩니다(로그아웃 전까지). 재발급·접근 중지되면 서버가 즉시 막습니다.
   - 저장: 바뀐 기록만 보내고, 다른 기기가 먼저 고쳤으면 저장 전체를 취소합니다. */
(function (global) {
  'use strict';
  const KINDS = ['people', 'progress', 'education', 'visits', 'notes', 'reports', 'mentors', 'settings'];
  const SERVER_KEY = 'hamkke.server.v5', SESSION_KEY = 'hamkke.session.v5';
  const ls = () => { try { return global.localStorage; } catch (_) { return null; } };
  const readJSON = k => { try { return JSON.parse(ls()?.getItem(k) || 'null'); } catch (_) { return null; } };
  const writeJSON = (k, v) => { try { v == null ? ls()?.removeItem(k) : ls()?.setItem(k, JSON.stringify(v)); } catch (_) { } };
  const copy = x => JSON.parse(JSON.stringify(x));
  const empty = () => Object.fromEntries(KINDS.map(k => [k, []]));

  let session = readJSON(SESSION_KEY) || {}, member = null, baseline = null, busy = false;
  const listeners = new Set();
  const emit = (type, data) => { for (const fn of listeners) try { fn(type, data); } catch (e) { console.error(e); } };

  // 서버 주소·공개 키·교회 ID: 배포 때 config.js에 넣거나, 처음 설정 화면에서 이 기기에 저장합니다.
  function server() {
    const built = global.HAMKKE_CONFIG || {};
    if (built.url && built.key && built.churchId) return { ...built, builtIn: true };
    return readJSON(SERVER_KEY) || {};
  }
  function setServer(url, key, churchId) {
    url = String(url || '').trim().replace(/\/+$/, ''); key = String(key || '').trim(); churchId = String(churchId || '').trim();
    if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(url)) throw Error('서버 주소는 https:// 로 시작해야 합니다.');
    if (!key) throw Error('공개 키를 입력해 주세요.');
    if (key.startsWith('sb_secret_')) throw Error('비밀 키는 앱에 넣을 수 없습니다. 공개 키(Publishable 또는 anon)를 넣어 주세요.');
    try { const part = key.split('.')[1]; if (part && JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') throw Error('service_role'); }
    catch (e) { if (e.message === 'service_role') throw Error('비밀 키(service_role)는 앱에 넣을 수 없습니다.'); }
    if (!/^[0-9a-f-]{36}$/i.test(churchId)) throw Error('교회 ID를 확인해 주세요.');
    writeJSON(SERVER_KEY, { url, key, churchId });
  }
  const hasServer = () => { const s = server(); return !!(s.url && s.key && s.churchId); };

  function friendly(msg, status) {
    if (/CONFLICT/.test(msg)) return '다른 기기에서 같은 기록을 먼저 고쳤습니다. 저장하지 않았습니다. 새로고침한 뒤 다시 입력해 주세요.';
    if (/MENTOR_CAPACITY/.test(msg)) return '이 양육도우미는 맡을 수 있는 인원이 다 찼습니다. 다른 도우미를 골라 주세요.';
    if (/MENTOR_INVALID/.test(msg)) return '같은 교구의, 교육을 마치고 활동 중인 양육도우미만 고를 수 있습니다. 맡은 분이 있는 도우미는 먼저 배정을 정리해 주세요.';
    if (/WELCOME_REQUIRED/.test(msg)) return '새가족교육 4과목을 모두 마친 뒤 양육도우미를 정할 수 있습니다.';
    if (/REPORT_LOCKED/.test(msg)) return '승인한 보고서는 고칠 수 없습니다. 수정본으로 다시 승인해 주세요.';
    if (/Permission denied/.test(msg)) return '이 기록을 바꿀 권한이 없습니다.';
    if (/Membership required/.test(msg) || status === 401) return '로그인이 끝났거나 접근이 중지되었습니다. 다시 로그인해 주세요.';
    if (/Only admin can delete/.test(msg)) return '삭제는 전체 관리자만 할 수 있습니다.';
    return msg;
  }

  function remember(s) { session = s || {}; writeJSON(SESSION_KEY, s && s.access_token ? s : null); }

  async function request(path, options = {}, skipRefresh = false) {
    const s = server();
    if (!s.url) throw Error('서버 정보가 없습니다. 관리자에게 문의해 주세요.');
    if (!skipRefresh && session.refresh_token && session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
      const r = await global.fetch(s.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: s.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!r.ok) { signOutLocal(); throw Error('로그인이 끝났습니다. 다시 로그인해 주세요.'); }
      remember(await r.json());
    }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 30000) : null;
    try {
      const r = await global.fetch(s.url + path, { ...options, signal: ctl?.signal, headers: { apikey: s.key, Authorization: 'Bearer ' + (session.access_token || s.key), 'Content-Type': 'application/json', ...(options.headers || {}) } });
      const x = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = x?.message || x?.error || x?.msg || x?.error_description || ('HTTP ' + r.status);
        const text = friendly(String(msg), r.status);
        if (/Membership required/.test(msg) || (r.status === 401 && session.access_token)) { signOutLocal(); emit('signedout', text); }
        const e = Error(text); e.status = r.status; throw e;
      }
      return x;
    } catch (e) {
      if (e.name === 'AbortError') throw Error('서버 응답이 늦습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      if (e instanceof TypeError) throw Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function loadMember() {
    const s = server();
    const rows = await request('/rest/v1/church_members?select=church_id,user_id,role,district,staff_id&church_id=eq.' + encodeURIComponent(s.churchId));
    if (!rows.length) { signOutLocal(); throw Error('이 교회의 사용 권한이 없거나 접근이 중지되었습니다. 관리자에게 문의해 주세요.'); }
    member = rows[0];
    return member;
  }

  async function codeLogin(name, code) {
    const s = server();
    if (!hasServer()) throw Error('서버 정보가 없습니다. 관리자에게 문의해 주세요.');
    const r = await global.fetch(s.url + '/functions/v1/staff-gateway', { method: 'POST', headers: { apikey: s.key, Authorization: 'Bearer ' + s.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', churchId: s.churchId, name, code }) }).catch(() => { throw Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); });
    const x = await r.json().catch(() => null);
    if (!r.ok || !x?.session) throw Error(x?.error || '이름 또는 코드를 확인해 주세요.');
    remember({ ...x.session, displayName: x.name || String(name).trim() });
    baseline = null;
    return loadMember();
  }

  async function emailLogin(email, password) {
    if (!hasServer()) throw Error('서버 정보를 먼저 입력해 주세요.');
    const x = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }, true);
    remember({ ...x, displayName: '관리자' });
    baseline = null;
    return loadMember();
  }

  function signOutLocal() { remember(null); member = null; baseline = null; }
  async function signOut() {
    try { if (session.access_token) await request('/auth/v1/logout', { method: 'POST' }, true); } catch (_) { }
    signOutLocal();
  }

  async function load() {
    if (!session.access_token) throw Error('로그인이 필요합니다.');
    if (!member) await loadMember();
    const s = server(), state = empty(), next = new Map();
    for (let offset = 0; ; ) {
      const rows = await request('/rest/v1/church_records?church_id=eq.' + encodeURIComponent(s.churchId) + '&select=kind,id,payload,version&order=kind.asc,id.asc&limit=1000&offset=' + offset);
      for (const r of rows) if (KINDS.includes(r.kind)) { state[r.kind].push(r.payload); next.set(r.kind + '/' + r.id, { payload: copy(r.payload), version: r.version }); }
      if (rows.length < 1000) break;
      offset += rows.length;
    }
    baseline = next;
    return state;
  }

  // 화면에 없는 기록은 삭제로 보지 않습니다(걸러 본 화면 때문에 서버 자료가 지워지지 않게).
  function diff(state) {
    const changes = [], seen = new Set();
    for (const kind of KINDS) for (const p of state[kind] || []) {
      if (!p?.id) throw Error('고유번호가 없는 기록이 있습니다.');
      const k = kind + '/' + p.id;
      if (seen.has(k)) throw Error('같은 고유번호가 두 번 있습니다: ' + p.id);
      seen.add(k);
      const old = baseline.get(k);
      if (!old || JSON.stringify(old.payload) !== JSON.stringify(p)) changes.push({ kind, id: p.id, payload: p, expected: old?.version || 0 });
    }
    return changes;
  }

  async function save(state) {
    if (!baseline) throw Error('먼저 서버 자료를 불러와 주세요.');
    if (busy) throw Error('이전 저장이 끝나지 않았습니다. 잠시 후 다시 눌러 주세요.');
    const changes = diff(state);
    if (!changes.length) return 0;
    busy = true;
    try {
      const result = await request('/rest/v1/rpc/church_apply', { method: 'POST', body: JSON.stringify({ c: server().churchId, changes }) });
      const sent = new Map(changes.map(x => [x.kind + '/' + x.id, x.payload]));
      for (const r of result || []) baseline.set(r.kind + '/' + r.id, { payload: copy(sent.get(r.kind + '/' + r.id)), version: r.version });
      return changes.length;
    } finally { busy = false; }
  }

  // 명시적 삭제(전체 관리자만, 서버가 다시 확인). 보통 저장(save)은 절대 지우지 않습니다.
  async function remove(items) {
    if (!baseline) throw Error('먼저 서버 자료를 불러와 주세요.');
    const changes = items.map(({ kind, id }) => ({ kind, id, delete: true, expected: baseline.get(kind + '/' + id)?.version || 0 })).filter(c => c.expected);
    for (let i = 0; i < changes.length; i += 4000) {
      const part = changes.slice(i, i + 4000);
      await request('/rest/v1/rpc/church_apply', { method: 'POST', body: JSON.stringify({ c: server().churchId, changes: part }) });
      for (const c of part) baseline.delete(c.kind + '/' + c.id);
    }
    return changes.length;
  }
  // 백업 파일에서 다시 넣기: 서버에 없는 기록만 새로 만듭니다(있는 기록은 덮어쓰지 않음).
  async function restore(records) {
    if (!baseline) throw Error('먼저 서버 자료를 불러와 주세요.');
    const changes = records.filter(r => KINDS.includes(r.kind) && r.payload?.id === r.id && !baseline.has(r.kind + '/' + r.id)).map(r => ({ kind: r.kind, id: r.id, payload: r.payload, expected: 0 }));
    for (let i = 0; i < changes.length; i += 4000) {
      const part = changes.slice(i, i + 4000);
      const res = await request('/rest/v1/rpc/church_apply', { method: 'POST', body: JSON.stringify({ c: server().churchId, changes: part }) });
      for (const r of res || []) baseline.set(r.kind + '/' + r.id, { payload: copy(part.find(x => x.kind === r.kind && x.id === r.id).payload), version: r.version });
    }
    return changes.length;
  }
  const staff = body => request('/functions/v1/staff-gateway', { method: 'POST', body: JSON.stringify({ churchId: server().churchId, ...body }) });
  const staffList = () => request('/rest/v1/staff_accounts?church_id=eq.' + encodeURIComponent(server().churchId) + '&select=user_id,display_name,role,district,status,code_issued_at,phone&order=created_at.desc');
  const auditLog = () => request('/rest/v1/staff_audit?church_id=eq.' + encodeURIComponent(server().churchId) + '&select=at,action,target&order=at.desc&limit=30');

  const status = () => ({
    signedIn: !!session.access_token, role: member?.role || null, district: member?.district || '',
    userId: session.user?.id || member?.user_id || null, name: session.displayName || '', churchId: server().churchId || null,
    builtInServer: !!server().builtIn, hasServer: hasServer(), busy,
  });

  global.HamkkeStore = { KINDS, empty, server, setServer, hasServer, codeLogin, emailLogin, signOut, load, save, diff, remove, restore, staff, staffList, auditLog, status, loadMember, request,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
})(typeof window !== 'undefined' ? window : globalThis);
