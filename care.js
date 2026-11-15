/* 함께 돌봄 5.0 — 심방 계산(화면과 무관): 최근 연락, 재연락, 오래 연락 못 한 분, 주일 10시 보고 기간과 초안.
   시험: tests/web/care.test.cjs */
(function (root) {
  'use strict';
  const C = root.MinistryCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const DAY = 86400000;
  // 시험에서 시각을 바꿀 수 있게 합니다.
  const now = () => (root.HAMKKE_TEST_NOW ? new Date(root.HAMKKE_TEST_NOW) : new Date());
  const RESULTS = ['통화 완료', '방문 완료', '부재', '문자 남김', '번호 확인 필요', '연락 원치 않음'];
  const CONNECTED = ['통화 완료', '방문 완료'];
  const AFFILIATION = ['출석 상황 미확인', '본교회 출석', '타교회 출석 확인', '장기 미출석'];
  const CARE_NEED = ['특이사항 없음', '재연락', '방문 희망', '목회자 상담 요청', '건강 관련 돌봄', '기타'];

  function settings(state) {
    const s = (state.settings || []).find(x => x.id === 'care') || {};
    const longDays = Number(s.longDays);
    return { longDays: Number.isInteger(longDays) && longDays >= 7 && longDays <= 365 ? longDays : 60 };
  }
  // 성도별 연락 기록 묶음(최근 것이 앞). 기록 배열이 바뀌면(새 배열·건수 변화) 다시 만듭니다.
  // 성도 한 명마다 전체 기록을 다시 훑지 않게 해서, 기록이 수만 건이어도 화면이 느려지지 않습니다.
  const byPersonCache = new WeakMap();
  const newestFirst = (a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || ''));
  function byPerson(state) {
    const list = state.visits || [];
    const hit = byPersonCache.get(list);
    if (hit && hit.n === list.length) return hit.map;
    const map = new Map();
    for (const v of list) { const a = map.get(v.personId); if (a) a.push(v); else map.set(v.personId, [v]); }
    for (const a of map.values()) a.sort(newestFirst);
    byPersonCache.set(list, { n: list.length, map });
    return map;
  }
  const visitsOf = (state, personId) => (byPerson(state).get(personId) || []).slice();
  const lastVisit = (state, personId) => (byPerson(state).get(personId) || [])[0] || null;
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);

  // 심방 명단: 같은 교구의 새가족이 아닌 성도(서버가 이미 범위를 정해 보내 줌)
  const carePeople = state => state.people.filter(p => !p.newcomer);
  // 재연락: 가장 최근 기록에 다음 연락일이 있고, 그날이 지났거나 오늘인 분
  function dueRecontacts(state, today = C.iso(now())) {
    return carePeople(state).map(p => ({ p, v: lastVisit(state, p.id) })).filter(x => x.v?.nextDate && x.v.nextDate <= today)
      .sort((a, b) => a.v.nextDate.localeCompare(b.v.nextDate));
  }
  // 오래 연락 못 한 분: 기준 일수 동안 "연결된" 연락(통화·방문)이 없는 분. 한 번도 없으면 맨 앞.
  function longNoContact(state, today = C.iso(now())) {
    const { longDays } = settings(state);
    return carePeople(state).map(p => {
      const last = (byPerson(state).get(p.id) || []).find(v => CONNECTED.includes(v.result));
      return { p, last, days: last ? daysBetween(last.date, today) : null };
    }).filter(x => x.days === null || x.days >= longDays).sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9));
  }

  // ── 주일 10시 보고: 지난 주일 10:00 ~ 이번 주일 10:00 에 "기록한" 연락을 모읍니다.
  function lastSunday10(at = now()) {
    const d = new Date(at); d.setHours(10, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // 이번 주의 주일
    if (d > at) d.setDate(d.getDate() - 7);
    return d;
  }
  // n=0: 가장 최근에 끝난 기간(승인 대상), n=-1: 지금 모이는 중인 기간, n=1: 그 전 주…
  function reportWindow(n = 0, at = now()) {
    const end = lastSunday10(at); end.setDate(end.getDate() - 7 * n);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    return { start, end, key: C.iso(end), label: `${C.iso(start)} 10시 ~ ${C.iso(end)} 10시` };
  }
  const inWindow = (v, w) => { const t = new Date(v.createdAt || (v.date + 'T12:00:00')); return t >= w.start && t < w.end; };

  function visitDraft(state, me, w) {
    const name = id => state.people.find(p => p.id === id)?.name || '이름 없음';
    const rows = state.visits.filter(v => v.authorId === me.userId && inWindow(v, w)).sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || '')));
    return {
      type: 'visit', district: me.district, authorId: me.userId, authorName: me.name, weekKey: w.key, period: w.label,
      summary: { people: new Set(rows.map(v => v.personId)).size, attempts: rows.length,
        connected: rows.filter(v => CONNECTED.includes(v.result)).length, absent: rows.filter(v => v.result === '부재').length,
        followups: rows.filter(v => v.nextDate).length },
      rows: rows.map(v => ({ date: v.date, name: name(v.personId), result: v.result, memo: v.memo || '', nextDate: v.nextDate || '' })),
      prayers: rows.filter(v => v.prayer && v.prayerInReport !== false).map(v => ({ name: name(v.personId), text: v.prayer })),
    };
  }
  // 같은 주의 보고 중 가장 나중 것(수정본 포함)
  function latestReport(state, type, authorId, weekKey) {
    return state.reports.filter(r => r.type === type && r.authorId === authorId && r.weekKey === weekKey).sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)))[0] || null;
  }
  function makeReport(draft, note, previous, at = now()) {
    const rev = previous ? (previous.revision || 1) + 1 : 1;
    return { ...draft, id: `R-${draft.type}-${draft.authorId}-${draft.weekKey}${rev > 1 ? '-r' + rev : ''}`, note: String(note || '').trim().slice(0, 500),
      approvedAt: at.toISOString(), revision: rev, ...(previous ? { revisionOf: previous.id } : {}) };
  }

  const api = { RESULTS, CONNECTED, AFFILIATION, CARE_NEED, now, settings, visitsOf, lastVisit, daysBetween, carePeople, dueRecontacts, longNoContact, lastSunday10, reportWindow, inWindow, visitDraft, latestReport, makeReport };
  root.CareCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
