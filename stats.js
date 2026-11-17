/* 함께 돌봄 — 통계(인포그래픽): 심방 · 새가족 · 주간 보고를 기간별로 한눈에.
   계산(StatsCore)은 화면과 따로 두어 시험합니다(tests/web/stats.test.cjs).
   숫자는 각자 볼 수 있는 자료(서버 권한) 안에서만 셉니다. 사역자 이름이 나오는 표는 관리자·교구 목사·심방 총괄에게만 보입니다. */
(function (root) {
  'use strict';
  const C = root.MinistryCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const K = root.CareCore || (typeof require !== 'undefined' ? require('./care.js') : null);
  const N = root.NewcomerCore || (typeof require !== 'undefined' ? require('./newcomer.js') : null);
  const DAY = 86400000;

  // ── 기간
  const PERIODS = { month: '이번 달', q: '최근 3개월', year: '올해', all: '전체' };
  function range(period, now = K.now()) {
    const t = C.iso(now), d = new Date(now);
    if (period === 'month') return { from: t.slice(0, 8) + '01', to: t, label: PERIODS.month };
    if (period === 'year') return { from: t.slice(0, 4) + '-01-01', to: t, label: PERIODS.year };
    if (period === 'all') return { from: '0000-01-01', to: t, label: PERIODS.all };
    d.setDate(d.getDate() - 90); return { from: C.iso(d), to: t, label: PERIODS.q };
  }
  const inRange = (d, r) => C.validDate(d) && d >= r.from && d <= r.to;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  // 추이 칸: 넉 달 이하면 주(월요일 시작), 그보다 길면 달. 가장 최근 칸이 오른쪽.
  function buckets(r, now = K.now(), firstDate) {
    const to = C.iso(now);
    let from = r.from === '0000-01-01' ? (firstDate || to) : r.from;
    const span = (new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / DAY;
    if (span <= 120) {
      const out = []; let w = C.weekStart(to);
      while (w >= C.weekStart(from) && out.length < 18) { const s = new Date(w + 'T12:00:00'); s.setDate(s.getDate() + 6); out.unshift({ key: w, from: w, to: C.iso(s), label: Number(w.slice(5, 7)) + '/' + Number(w.slice(8, 10)) }); const p = new Date(w + 'T12:00:00'); p.setDate(p.getDate() - 7); w = C.iso(p); }
      return { unit: '주', list: out };
    }
    const out = []; let y = Number(to.slice(0, 4)), m = Number(to.slice(5, 7));
    while (out.length < 24) {
      const key = `${y}-${String(m).padStart(2, '0')}`; if (key < from.slice(0, 7)) break;
      const last = new Date(y, m, 0).getDate();
      out.unshift({ key, from: key + '-01', to: key + '-' + String(last).padStart(2, '0'), label: m + '월' });
      m--; if (!m) { m = 12; y--; }
    }
    return { unit: '달', list: out };
  }
  const countIn = (dates, list) => list.map(b => ({ ...b, value: dates.filter(d => d >= b.from && d <= b.to).length }));

  // ── 심방
  function visitStats(state, r, now = K.now()) {
    const care = state.people.filter(p => !p.newcomer), ids = new Set(care.map(p => p.id)), byId = new Map(care.map(p => [p.id, p]));
    const vis = state.visits.filter(v => ids.has(v.personId) && inRange(v.date, r));
    const connected = vis.filter(v => K.CONNECTED.includes(v.result));
    const reached = new Set(vis.map(v => v.personId));
    const districts = [...new Set(care.map(p => p.district))].sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true }));
    const byDistrict = districts.map(d => { const ps = care.filter(p => p.district === d); const got = ps.filter(p => reached.has(p.id)).length; return { label: d, value: pct(got, ps.length), note: `${got} / ${ps.length}명`, people: ps.length, reached: got }; });
    const byResult = K.RESULTS.map(x => ({ label: x, value: vis.filter(v => v.result === x).length })).filter(x => x.value);
    const first = state.visits.map(v => v.date).filter(C.validDate).sort()[0];
    const t = buckets(r, now, first);
    const workers = new Map();
    for (const v of vis) { const w = workers.get(v.authorId) || { id: v.authorId, name: v.authorName || '이름 없음', attempts: 0, connected: 0, people: new Set(), prayers: 0 }; w.attempts++; if (K.CONNECTED.includes(v.result)) w.connected++; w.people.add(v.personId); if (v.prayer) w.prayers++; workers.set(v.authorId, w); }
    return {
      people: care.length, attempts: vis.length, connected: connected.length, reached: reached.size, reachRate: pct(reached.size, care.length), connectRate: pct(connected.length, vis.length),
      long: K.longNoContact(state, C.iso(now)).length, prayers: vis.filter(v => v.prayer).length,
      byDistrict, byResult, trendUnit: t.unit, trend: countIn(vis.map(v => v.date), t.list),
      byWorker: [...workers.values()].map(w => ({ id: w.id, name: w.name, attempts: w.attempts, connected: w.connected, people: w.people.size, prayers: w.prayers })).sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name, 'ko')),
      districtOf: id => byId.get(id)?.district || '',
    };
  }

  // ── 새가족(인계받아 교구 성도가 된 분도 지나온 과정으로 셈)
  function settledAt(state, p) { const m = N.progressOf(state, p.id).milestones || {}; return C.validDate(m.settled?.completedAt) ? m.settled.completedAt : (p.handedOverAt ? String(p.handedOverAt).slice(0, 10) : ''); }
  function newcomerStats(state, r, now = K.now()) {
    const all = state.people.filter(p => C.validDate(p.registeredAt) && (p.newcomer || p.handedOverAt));
    const cur = all.filter(p => p.newcomer);
    const st = new Map(all.map(p => [p.id, N.stages(state, p, C.iso(now))]));
    const registered = all.filter(p => inRange(p.registeredAt, r));
    const settled = all.filter(p => inRange(settledAt(state, p), r));
    const weeks = settled.map(p => (new Date(settledAt(state, p) + 'T12:00:00') - new Date(p.registeredAt + 'T12:00:00')) / (7 * DAY)).filter(x => x >= 0);
    const c = N.counts(state, cur);
    // 단계 깔때기: 그 단계를 마친 분(기간 안에 등록한 분 기준, 없으면 지금 진행 중인 분 기준)
    const base = registered.length ? registered : all;
    const funnel = N.STAGES.map(s => { const n = base.filter(p => st.get(p.id).find(x => x.key === s.key)?.done).length; return { key: s.key, label: s.label, value: n, note: pct(n, base.length) + '%' }; });
    const late = N.STAGES.map(s => ({ label: s.label, value: cur.filter(p => st.get(p.id).find(x => x.key === s.key)?.overdue).length })).filter(x => x.value);
    const courses = N.courses(state);
    const edu = state.education.filter(e => e.course === 'welcome' && all.some(p => p.id === e.personId));
    const subjects = courses.welcome.map((name, i) => { const s = String(i + 1), done = new Set(edu.filter(e => e.subject === s && e.status === 'completed').map(e => e.personId)).size; return { label: `${i + 1}과 ${name}`, value: pct(done, all.length), note: `${done} / ${all.length}명` }; });
    const first = all.map(p => p.registeredAt).sort()[0];
    const t = buckets(r, now, first);
    return {
      total: all.length, active: c.all - c.settled - c.paused, waiting: c.waiting, fellowship: c.fellowship, paused: c.paused, handover: c.settled,
      registered: registered.length, settled: settled.length, avgWeeks: weeks.length ? Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length) : null,
      base: base === registered ? '이 기간 등록' : '전체', baseCount: base.length, funnel, late, subjects,
      absent: edu.filter(e => e.status === 'absent').length, makeup: edu.filter(e => e.status === 'makeup').length,
      trendUnit: t.unit, regTrend: countIn(registered.map(p => p.registeredAt), t.list), setTrend: countIn(settled.map(p => settledAt(state, p)), t.list),
      byDistrict: [...new Set(cur.map(p => p.district))].sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true })).map(d => ({ label: d, value: cur.filter(p => p.district === d).length })),
    };
  }

  // ── 주간 보고: 기간 안에 끝난 주(주일 10시 마감)마다, 승인했는지
  function reportStats(state, r, staff = [], now = K.now()) {
    const weeks = []; for (let n = 0; n < 60; n++) { const w = K.reportWindow(n, now); if (w.key < r.from) break; if (w.key <= r.to) weeks.unshift(w); }
    const latest = (type, author, key) => state.reports.some(x => x.type === type && x.authorId === author && x.weekKey === key);
    const people = type => {
      const role = type === 'visit' ? 'visitor' : 'committee';
      const fromStaff = staff.filter(s => s.status !== 'suspended' && [s.role, ...(s.extra_roles || [])].includes(role)).map(s => ({ id: s.user_id, name: s.display_name, district: s.district }));
      const seen = state.reports.filter(x => x.type === type).map(x => ({ id: x.authorId, name: x.authorName, district: x.district }));
      const map = new Map(); for (const p of [...fromStaff, ...seen]) if (!map.has(p.id)) map.set(p.id, p);
      return [...map.values()];
    };
    const sec = type => {
      const ps = people(type), done = ps.reduce((a, p) => a + weeks.filter(w => latest(type, p.id, w.key)).length, 0), expected = ps.length * weeks.length;
      return {
        people: ps.length, weeks: weeks.length, approved: done, expected, rate: pct(done, expected),
        trend: weeks.map(w => ({ key: w.key, label: Number(w.key.slice(5, 7)) + '/' + Number(w.key.slice(8, 10)), value: ps.filter(p => latest(type, p.id, w.key)).length, max: ps.length })),
        byPerson: ps.map(p => ({ name: p.name, district: p.district || '', value: weeks.filter(w => latest(type, p.id, w.key)).length, of: weeks.length })).sort((a, b) => String(a.district).localeCompare(String(b.district), 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko')),
      };
    };
    return { visit: sec('visit'), newcomer: sec('newcomer') };
  }

  const api = { PERIODS, range, buckets, visitStats, newcomerStats, reportStats, pct };
  root.StatsCore = api;
  if (typeof module !== 'undefined') module.exports = api;

  // ───────────────────────── 화면 ─────────────────────────
  if (!root.document || !root.UI) return;
  const { $, $$, esc, toast } = root.UI;
  const Pages = root.HamkkePages = root.HamkkePages || {};
  let period = 'q';
  const SEE = { visit: ['admin', 'district_pastor', 'visit_lead'], newcomer: ['admin', 'district_pastor', 'newcomer_pastor', 'newcomer_admin'], names: ['admin', 'district_pastor', 'visit_lead'] };
  const fmt = n => (n == null ? '—' : Number(n).toLocaleString('ko-KR'));

  // 숫자 칸 4개(같은 크기)
  const tiles = list => `<div class="st-tiles">${list.map(([v, label, sub, tone]) => `<div class="st-tile ${tone || ''}"><span class="st-label">${esc(label)}</span><b>${v}</b><span class="st-sub">${esc(sub || '')}</span></div>`).join('')}</div>`;
  // 가로 막대: 이름 | 막대 | 값 (한 줄, 같은 높이)
  function hbars(rows, { max, unit = '', tone = '' } = {}) {
    if (!rows.length) return '<p class="muted small">자료가 없습니다.</p>';
    const top = max || Math.max(1, ...rows.map(r => r.value));
    return `<div class="st-hbars ${tone}">${rows.map(r => `<div class="st-hrow" data-tip="${esc(r.label)} · ${esc(fmt(r.value) + unit)}${r.note ? ' (' + esc(r.note) + ')' : ''}">
      <span class="st-hlabel">${esc(r.label)}</span><span class="st-track"><i style="width:${Math.max(r.value ? 2 : 0, Math.round((r.value / top) * 100))}%"></i></span><span class="st-hval">${fmt(r.value)}${esc(unit)}</span></div>`).join('')}</div>`;
  }
  // 세로 막대(추이): 가장 높은 칸과 마지막 칸만 숫자를 붙이고, 나머지는 손을 대면 보임
  function vbars(rows, { unit = '건', of } = {}) {
    if (!rows.length) return '<p class="muted small">자료가 없습니다.</p>';
    const top = Math.max(1, ...rows.map(r => r.max || r.value)), hi = rows.reduce((a, r, i) => (r.value > rows[a].value ? i : a), 0), step = Math.ceil(rows.length / 6); // 칸이 많으면 아래 날짜는 건너뛰며 표시(좁은 화면에서도 날짜가 잘리지 않게)
    return `<div class="st-vbars" style="--n:${rows.length}">${rows.map((r, i) => `<div class="st-vcol" data-tip="${esc(r.label)} · ${fmt(r.value)}${esc(unit)}${r.max != null ? ' / ' + r.max + '명' : ''}">
      <span class="st-vval">${i === hi || i === rows.length - 1 ? fmt(r.value) : ''}</span><span class="st-vbar"><i style="height:${Math.max(r.value ? 3 : 0, Math.round((r.value / top) * 100))}%"></i></span><span class="st-vlabel">${(i % step === 0 && rows.length - 1 - i >= step) || i === rows.length - 1 ? esc(r.label) : ''}</span></div>`).join('')}</div>${of ? `<p class="st-note">${esc(of)}</p>` : ''}`;
  }
  // 둥근 비율(도넛 하나): 한 숫자를 크게
  const ring = (value, label) => `<div class="st-ring" role="img" aria-label="${esc(label)} ${value}%"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" class="t"/>${value > 0 ? `<circle cx="60" cy="60" r="50" class="v" pathLength="100" stroke-dasharray="${Math.min(100, value)} 100"/>` : ''}</svg><span><b>${value}%</b><small>${esc(label)}</small></span></div>`;
  const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const card = (title, sub, body, cls = '') => `<section class="card st-card ${cls}"><div class="st-head"><h2>${esc(title)}</h2>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}</div>${body}</section>`;

  function visitHTML(s, me) {
    return `<h2 class="st-sec" id="st-visit">심방</h2>
      ${tiles([[fmt(s.attempts), '연락', `통화·방문 ${fmt(s.connected)}번`], [fmt(s.reached), '연락한 성도', `돌봄 성도 ${fmt(s.people)}명 중`], [s.connectRate + '%', '연결 비율', '통화·방문 ÷ 전체 연락'], [fmt(s.long), '오래 연락 못 한 분', '지금 기준', s.long ? 'warn' : '']])}
      <div class="st-grid">
        ${card(`${s.trendUnit}별 연락`, '연락 기록 수', vbars(s.trend, { unit: '건' }), 'wide')}
        ${card('돌본 비율', '기간 안에 한 번 이상 연락', `<div class="st-ringrow">${ring(s.reachRate, '돌봄 성도')}<p class="small">돌봄 성도 <b>${fmt(s.people)}명</b> 가운데 <b>${fmt(s.reached)}명</b>에게 연락했습니다.</p></div>`)}
        ${card('교구별 돌본 비율', '연락한 성도 ÷ 교구 성도', hbars(s.byDistrict, { max: 100, unit: '%' }))}
        ${card('연락 결과', '기간 안 연락', hbars(s.byResult, { unit: '건' }), 'wide')}
      </div>
      ${SEE.names.includes(me.role) && s.byWorker.length ? card('사역자별 활동', '연락 많은 순', table(['사역자', '연락', '통화·방문', '성도', '기도제목'], s.byWorker.map(w => [w.name, w.attempts, w.connected, w.people, w.prayers]))) : ''}`;
  }
  function newcomerHTML(s) {
    return `<h2 class="st-sec" id="st-new">새가족</h2>
      ${tiles([[fmt(s.active), '진행 중', `매칭 대기 ${s.waiting} · 새사귐 ${s.fellowship}`], [fmt(s.registered), '이 기간 등록', `전체 ${fmt(s.total)}명`], [fmt(s.settled), '이 기간 정착', `인계 대기 ${s.handover}명`], [s.avgWeeks == null ? '—' : s.avgWeeks + '주', '정착까지 평균', '등록 → 정착']])}
      <div class="st-grid">
        ${card('정착 단계', `${s.base} ${s.baseCount}명 중 그 단계를 마친 분`, hbars(s.funnel.map(f => ({ label: f.label, value: f.value, note: f.note })), { max: Math.max(1, s.baseCount), unit: '명' }), 'wide')}
        ${card(`${s.trendUnit}별 등록`, '새가족 등록', vbars(s.regTrend, { unit: '명' }))}
        ${card(`${s.trendUnit}별 정착`, '정착 확인', vbars(s.setTrend, { unit: '명' }))}
        ${card('새가족교육 4과목 이수', `결석 ${s.absent}건 · 보강 ${s.makeup}건`, hbars(s.subjects, { max: 100, unit: '%' }))}
        ${card('늦어진 단계', '예정일이 지난 단계', s.late.length ? hbars(s.late, { unit: '명', tone: 'bad' }) : '<p class="st-good">늦어진 단계가 없습니다.</p>')}
      </div>`;
  }
  function reportHTML(s, me) {
    const sec = (title, x, who) => card(title, `${x.weeks}주 · ${who} ${x.people}명`, `<div class="st-ringrow">${ring(x.rate, '승인')}<p class="small">${x.weeks}주 동안 받아야 할 보고 <b>${x.expected}건</b> 가운데 <b>${x.approved}건</b>이 승인되었습니다.</p></div>
      ${vbars(x.trend, { unit: '명 승인' })}${SEE.names.includes(me.role) || me.role === 'newcomer_pastor' ? hbars(x.byPerson.map(p => ({ label: p.name + (p.district ? ' · ' + p.district : ''), value: p.value, note: `${p.value} / ${p.of}주` })), { max: Math.max(1, x.weeks), unit: '주' }) : ''}`);
    const parts = [];
    if (SEE.visit.includes(me.role)) parts.push(sec('심방 보고', s.visit, '심방사역자'));
    if (SEE.newcomer.includes(me.role) && me.role !== 'visit_lead') parts.push(sec('새가족 보고', s.newcomer, '새가족위원'));
    return `<h2 class="st-sec" id="st-report">주간 보고</h2><div class="st-grid two-col">${parts.join('')}</div>`;
  }

  Pages.stats = {
    label: '통계',
    render(ctx) {
      const me = ctx.me, r = range(period), state = ctx.state;
      const showV = SEE.visit.includes(me.role), showN = SEE.newcomer.includes(me.role);
      const v = showV ? visitStats(state, r) : null, n = showN ? newcomerStats(state, r) : null, rep = reportStats(state, r, ctx.cache.staff || []);
      const jump = [showV && ['st-visit', '심방'], showN && ['st-new', '새가족'], ['st-report', '주간 보고']].filter(Boolean);
      ctx.cache.statsExport = { r, v, n, rep, me };
      return `<div class="eyebrow">통계</div><h1 class="page-title">한눈에 보는 사역</h1>
        <p class="subtitle">${esc(r.label)} · ${esc(r.from === '0000-01-01' ? '처음부터' : r.from)} ~ ${esc(r.to)}${me.district && me.role === 'district_pastor' ? ' · ' + esc(me.district) : ''}. 숫자는 볼 수 있는 범위 안에서만 셉니다.</p>
        <div class="st-bar no-print"><div class="seg" role="group" aria-label="기간">${Object.entries(PERIODS).map(([k, l]) => `<button type="button" data-period="${k}" class="${k === period ? 'active' : ''}">${l}</button>`).join('')}</div>
          <div class="seg" role="group" aria-label="바로 가기">${jump.map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join('')}</div>
          <div class="acts"><button type="button" id="stXlsx">엑셀로 받기</button><button type="button" id="stPrint">인쇄</button></div></div>
        ${v ? visitHTML(v, me) : ''}${n ? newcomerHTML(n) : ''}${reportHTML(rep, me)}
        <div id="stTip" class="st-tip" role="tooltip" hidden></div>`;
    },
    async bind(ctx) {
      $$('[data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; ctx.render(); });
      $$('[data-jump]').forEach(b => b.onclick = () => document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      $('#stPrint').onclick = () => root.print();
      $('#stXlsx').onclick = () => exportXlsx(ctx.cache.statsExport);
      const tip = $('#stTip');
      const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.hidden = false; const w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(x - w / 2, root.innerWidth - w - 8)) + 'px'; tip.style.top = (y - 44) + 'px'; };
      $$('[data-tip]').forEach(el => {
        el.onmousemove = e => show(el, e.clientX, e.clientY); el.onmouseleave = () => { tip.hidden = true; };
        el.onclick = e => { show(el, e.clientX, e.clientY); clearTimeout(el._t); el._t = setTimeout(() => { tip.hidden = true; }, 2200); }; // 휴대폰: 손가락을 대면 잠깐 보임
      });
      // 사역자 이름·승인 여부는 담당자 목록에서(볼 수 있는 분만)
      if (!ctx.cache.staff && SEE.names.concat(['newcomer_pastor']).includes(ctx.me.role)) { try { ctx.cache.staff = await root.HamkkeStore.staffList(); } catch (_) { ctx.cache.staff = []; } ctx.render(); }
    },
  };
  function exportXlsx(x) {
    const X = root.XLSX; if (!X || !x) return toast('엑셀 도구를 불러오지 못했습니다.');
    const book = X.utils.book_new(), add = (name, rows) => X.utils.book_append_sheet(book, X.utils.aoa_to_sheet(rows), name);
    const head = [['기간', `${x.r.label} (${x.r.from === '0000-01-01' ? '처음' : x.r.from} ~ ${x.r.to})`], []];
    if (x.v) add('심방', [...head, ['연락', x.v.attempts], ['통화·방문', x.v.connected], ['연락한 성도', x.v.reached], ['돌봄 성도', x.v.people], ['돌본 비율(%)', x.v.reachRate], ['연결 비율(%)', x.v.connectRate], ['오래 연락 못 한 분', x.v.long], [],
      [x.v.trendUnit, '연락'], ...x.v.trend.map(t => [t.key, t.value]), [], ['교구', '돌본 비율(%)', '연락한 성도', '교구 성도'], ...x.v.byDistrict.map(d => [d.label, d.value, d.reached, d.people]), [],
      ['연락 결과', '건수'], ...x.v.byResult.map(d => [d.label, d.value]),
      ...(SEE.names.includes(x.me.role) ? [[], ['사역자', '연락', '통화·방문', '성도', '기도제목'], ...x.v.byWorker.map(w => [w.name, w.attempts, w.connected, w.people, w.prayers])] : [])]);
    if (x.n) add('새가족', [...head, ['진행 중', x.n.active], ['이 기간 등록', x.n.registered], ['이 기간 정착', x.n.settled], ['정착까지 평균(주)', x.n.avgWeeks ?? ''], ['결석', x.n.absent], ['보강', x.n.makeup], [],
      ['단계', '마친 분', '비율'], ...x.n.funnel.map(f => [f.label, f.value, f.note]), [], ['과목', '이수(%)', '인원'], ...x.n.subjects.map(s => [s.label, s.value, s.note]), [],
      [x.n.trendUnit, '등록', '정착'], ...x.n.regTrend.map((t, i) => [t.key, t.value, x.n.setTrend[i].value])]);
    add('주간보고', [...head, ['구분', '받아야 할 보고', '승인', '승인 비율(%)'], ['심방', x.rep.visit.expected, x.rep.visit.approved, x.rep.visit.rate], ['새가족', x.rep.newcomer.expected, x.rep.newcomer.approved, x.rep.newcomer.rate], [],
      ['주일', '심방 승인', '새가족 승인'], ...x.rep.visit.trend.map((t, i) => [t.key, t.value, x.rep.newcomer.trend[i]?.value ?? ''])]);
    try { X.writeFile(book, `함께돌봄-통계-${x.r.to}.xlsx`); } catch (e) { toast('이 화면에서는 파일을 받을 수 없습니다: ' + e.message); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
