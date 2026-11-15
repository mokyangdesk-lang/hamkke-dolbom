/* 함께 돌봄 5.0 — 새가족 계산(화면과 무관): 9단계, 다음 할 일, 늦어짐, 인계, 소통 메모, 주간 보고 초안.
   위원은 인적사항(people)을 바꾸지 않고 진행 기록(progress)만 씁니다. 시험: tests/web/newcomer.test.cjs */
(function (root) {
  'use strict';
  const C = root.MinistryCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const K = root.CareCore || (typeof require !== 'undefined' ? require('./care.js') : null);
  const STAGES = [
    { key: 'registered', label: '등록', who: '새가족 관리자' },
    { key: 'welcomeCall', label: '환영 전화', who: '새가족위원', manual: true },
    { key: 'groupInvite', label: '교구 단톡방 초대', who: '새가족위원', manual: true },
    { key: 'education', label: '새가족교육 4과목', who: '새가족 담당 목사' },
    { key: 'matching', label: '양육도우미 매칭', who: '새가족 관리자' },
    { key: 'fellowship', label: '새사귐반 8주', who: '새가족위원(도우미에게 듣고 체크)' },
    { key: 'friends', label: '교구 프렌즈', who: '새가족위원', manual: true },
    { key: 'loveGroup', label: '사랑방', who: '새가족위원', manual: true },
    { key: 'settled', label: '정착 · 교구 인계', who: '새가족위원 → 교구 목사', manual: true },
  ];
  const MANUAL = STAGES.filter(s => s.manual).map(s => s.key);
  const DEFAULT_COURSES = {
    welcome: ['예수 그리스도', '구원의 확신', '교회의 승리', '예배의 기쁨'],
    fellowship: ['첫 만남 및 오리엔테이션', '1과 천국이라고 부르는 나라', '2과 하나님은 어떤 분이신가?', '3과 예수님은 어떤 분이신가?', '4과 하나님의 말씀', '5과 구원과 상급', '6과 확신있는 신앙생활', '7과 승리하는 신앙생활'],
  };
  const STATUS = { active: '진행 중', paused: '중단', settled: '정착' };

  function courses(state) {
    const s = (state.settings || []).find(x => x.id === 'courses') || {};
    const ok = (a, n) => Array.isArray(a) && a.length === n && a.every(x => String(x).trim());
    return { welcome: ok(s.welcome, 4) ? s.welcome : DEFAULT_COURSES.welcome, fellowship: ok(s.fellowship, 8) ? s.fellowship : DEFAULT_COURSES.fellowship };
  }
  const newcomers = state => state.people.filter(p => p.newcomer);
  const progressOf = (state, pid) => state.progress.find(x => x.id === pid) || { id: pid, personId: pid, status: 'active', milestones: {} };
  function ensureProgress(state, pid) {
    let r = state.progress.find(x => x.id === pid);
    if (!r) { r = { id: pid, personId: pid, status: 'active', milestones: {} }; state.progress.push(r); }
    r.milestones = r.milestones || {};
    return r;
  }

  function stages(state, p, today = C.iso(K.now())) {
    const pr = progressOf(state, p.id), m = pr.milestones || {};
    const w = C.welcomeCompleted(state, p.id), f = C.completed(state, p.id, 'fellowship').size;
    return STAGES.map(st => {
      const x = { ...st, done: false, overdue: false, detail: '' };
      if (st.key === 'registered') { x.done = true; x.detail = p.registeredAt || ''; }
      else if (st.key === 'education') { x.done = w === 4; x.detail = w + '/4과목'; }
      else if (st.key === 'matching') { x.done = !!p.mentorId; x.detail = p.mentorId ? (state.mentors.find(mm => mm.id === p.mentorId)?.name || '') : (w === 4 ? '매칭 대기' : ''); }
      else if (st.key === 'fellowship') { x.done = f === 8; x.detail = f + '/8주'; }
      else {
        const v = m[st.key] || {};
        x.done = C.validDate(v.completedAt); x.detail = x.done ? v.completedAt + (v.name ? ' · ' + v.name : '') : v.dueAt ? '예정 ' + v.dueAt : '';
        x.overdue = !x.done && C.validDate(v.dueAt) && v.dueAt < today; // 예정일을 직접 정한 항목만 늦어짐으로 봄
      }
      return x;
    });
  }
  const nextStage = list => list.find(s => !s.done) || null;
  const weeksSince = (p, today = C.iso(K.now())) => C.validDate(p.registeredAt) && p.registeredAt <= today ? Math.floor(K.daysBetween(p.registeredAt, today) / 7) + 1 : null;

  function bucket(state, p) {
    const pr = progressOf(state, p.id);
    if (pr.status === 'paused') return 'paused';
    const st = stages(state, p);
    if (st.find(s => s.key === 'settled').done) return 'settled';
    if (st.find(s => s.key === 'education').done && !p.mentorId) return 'waiting';
    if (p.mentorId && !st.find(s => s.key === 'fellowship').done) return 'fellowship';
    return 'active';
  }
  function counts(state, list = newcomers(state)) {
    // active = 진행 중 전체(매칭 대기·새사귐 중 포함), settled = 정착(인계 대기), paused = 중단
    const c = { all: list.length, active: 0, waiting: 0, fellowship: 0, settled: 0, paused: 0 };
    for (const p of list) { const b = bucket(state, p); if (b === 'waiting' || b === 'fellowship') c[b]++; if (b === 'settled' || b === 'paused') c[b]++; else c.active++; }
    return c;
  }

  // 위원이 남기는 단계 기록(완료일, 예정일, 사랑방 이름)
  function setMilestone(state, pid, key, patch) {
    if (!MANUAL.includes(key)) throw Error('이 단계는 여기서 기록하지 않습니다.');
    for (const d of ['completedAt', 'dueAt']) if (patch[d] && !C.validDate(patch[d])) throw Error('날짜를 확인해 주세요.');
    if (key === 'settled' && patch.completedAt) {
      const p = state.people.find(x => x.id === pid), st = stages(state, p);
      if (!st.filter(s => s.key !== 'settled').every(s => s.done)) throw Error('앞의 단계를 모두 마친 뒤 정착을 확인할 수 있습니다.');
    }
    const r = ensureProgress(state, pid), cur = r.milestones[key] || {};
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] === '' || next[k] == null) delete next[k];
    r.milestones[key] = next;
    if (key === 'settled') r.status = next.completedAt ? 'settled' : (r.status === 'settled' ? 'active' : r.status);
    return r;
  }
  function setStatus(state, pid, status) { if (!['active', 'paused'].includes(status)) throw Error('상태를 확인해 주세요.'); const r = ensureProgress(state, pid); r.status = status; return r; }

  // 인계: 위원이 정착을 확인한 분을 교구 목사가 받습니다. 받으면 새가족 목록에서 빠지고 심방 명단에 들어갑니다.
  const handoverReady = state => newcomers(state).filter(p => C.validDate(progressOf(state, p.id).milestones?.settled?.completedAt));
  function acceptHandover(state, pid, me, at = K.now()) {
    const p = state.people.find(x => x.id === pid);
    if (!p || !p.newcomer) throw Error('인계할 새가족을 찾을 수 없습니다.');
    if (!handoverReady(state).some(x => x.id === pid)) throw Error('새가족위원이 정착을 확인한 뒤 인계할 수 있습니다.');
    p.newcomer = false; p.handedOverAt = at.toISOString(); p.handedOverBy = me.name || '';
    return p;
  }

  // 소통 메모: 위원·교구 목사·새가족팀이 함께 봅니다. 확인 요청은 받는 쪽이 확인하면 닫힙니다.
  const notesFor = (state, pid) => state.notes.filter(n => n.personId === pid).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const openRequests = (state, me) => state.notes.filter(n => n.request && !n.resolvedAt && n.authorId !== me.userId && state.people.some(p => p.id === n.personId && p.newcomer));
  function makeNote(pid, me, text, request, at = K.now()) {
    text = String(text || '').trim();
    if (!text) throw Error('메모 내용을 입력해 주세요.');
    if (text.length > 300) throw Error('메모는 300자 안으로 짧게 써 주세요.');
    return { id: 'NT-' + at.getTime().toString(36) + Math.random().toString(36).slice(2, 7), personId: pid, authorId: me.userId, authorName: me.name, authorRole: me.role, text, request: !!request, createdAt: at.toISOString() };
  }
  function resolveNote(note, me, at = K.now()) { if (note.authorId === me.userId) throw Error('내가 남긴 요청은 받는 분이 확인합니다.'); note.resolvedAt = at.toISOString(); note.resolvedBy = me.name; return note; }

  // 새가족 주간 보고 초안: 지난 주일 10시 ~ 이번 주일 10시. 이름·단계만 담고 민감한 내용은 넣지 않습니다.
  function newcomerDraft(state, me, w) {
    const from = C.iso(w.start), to = C.iso(w.end);
    const inRange = d => C.validDate(d) && d >= from && d < to;
    const list = newcomers(state).filter(p => p.district === me.district).sort((a, b) => String(a.name).localeCompare(b.name, 'ko'));
    const rows = list.map(p => {
      const st = stages(state, p), m = progressOf(state, p.id).milestones || {};
      const changes = MANUAL.filter(k => inRange(m[k]?.completedAt)).map(k => STAGES.find(s => s.key === k).label);
      const edu = state.education.filter(e => e.personId === p.id && e.status === 'completed' && inRange(e.date));
      const wel = edu.filter(e => e.course === 'welcome').length, fel = edu.filter(e => e.course === 'fellowship').length;
      if (wel) changes.push(`새가족교육 ${wel}과목 이수`); if (fel) changes.push(`새사귐 ${fel}주`);
      const nx = nextStage(st);
      return { name: p.name, stage: nx ? nx.label : '정착 · 인계 대기', status: STATUS[progressOf(state, p.id).status] || '진행 중', changes, overdue: st.filter(s => s.overdue).map(s => s.label) };
    });
    const c = counts(state, list);
    return {
      type: 'newcomer', district: me.district, authorId: me.userId, authorName: me.name, weekKey: w.key, period: w.label,
      summary: { all: c.all, active: c.all - c.settled - c.paused, waiting: c.waiting, fellowship: c.fellowship, settled: c.settled, paused: c.paused,
        moved: rows.filter(r => r.changes.length).length, late: rows.filter(r => r.overdue.length).length,
        requests: state.notes.filter(n => n.request && !n.resolvedAt && list.some(p => p.id === n.personId)).length },
      rows,
    };
  }

  const api = { STAGES, MANUAL, DEFAULT_COURSES, STATUS, courses, newcomers, progressOf, ensureProgress, stages, nextStage, weeksSince, bucket, counts, setMilestone, setStatus, handoverReady, acceptHandover, notesFor, openRequests, makeNote, resolveNote, newcomerDraft };
  root.NewcomerCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
