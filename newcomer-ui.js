/* 함께 돌봄 5.0 — 새가족 사역 화면: 현황판(9단계·다음 할 일), 자세히(단계 기록·새사귐 8주·소통 메모),
   4과목 출석, 한 명 등록, 교구 인계, 새가족 주간 보고(위원 승인 / 목사 열람). 권한은 서버가 다시 판정합니다. */
(function (root) {
  'use strict';
  const { $, $$, esc, toast, dialog, closeDialog, ask, matches, liveSearch } = root.UI;
  const C = root.MinistryCore, K = root.CareCore, N = root.NewcomerCore, M = root.Messages;
  const Pages = root.HamkkePages = root.HamkkePages || {};
  const uid = () => (root.crypto?.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const today = () => C.iso(K.now());
  const TEAM = ['newcomer_pastor', 'newcomer_admin', 'admin'];
  const canProgress = me => ['committee', ...TEAM].includes(me.role);         // 단계·새사귐 기록
  const canAttendance = me => ['committee', ...TEAM].includes(me.role);         // 4과목 출석(위원은 자기 교구)

  function dots(st) {
    return `<ol class="dots" aria-label="진행 단계">${st.map(s => `<li class="${s.done ? 'done' : s.overdue ? 'late' : ''}" title="${esc(s.label)}${s.detail ? ' · ' + esc(s.detail) : ''}"><span class="visually-hidden">${esc(s.label)} ${s.done ? '완료' : s.overdue ? '늦어짐' : '아직'}</span></li>`).join('')}</ol>`;
  }

  // ── 진행 그림: 단계마다 동그라미(완료 ✓ · 다음 · 늦어짐 · 아직), 날짜, 4과목·8주는 작은 점
  const md = d => C.validDate(d) ? Number(d.slice(5, 7)) + '.' + Number(d.slice(8)) : '';
  const lastDate = (s, pid, course) => s.education.filter(e => e.personId === pid && e.course === course && e.status === 'completed').map(e => e.date).sort().pop() || '';
  const pips = (n, set) => `<span class="pips" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${set.has(String(i + 1)) ? 'on' : ''}"></i>`).join('')}</span>`;
  function stepper(s, p, st = N.stages(s, p)) {
    const nx = N.nextStage(st), wel = C.completed(s, p.id, 'welcome'), fel = C.completed(s, p.id, 'fellowship'), m = N.progressOf(s, p.id).milestones || {};
    return `<ol class="stepper" aria-label="${esc(p.name)} 진행 과정">${st.map(x => {
      const cls = x.done ? 'done' : x.overdue ? 'late' : x === nx ? 'now' : 'todo', v = m[x.key] || {};
      const sub = x.key === 'registered' ? md(p.registeredAt)
        : x.key === 'education' ? (x.done ? md(lastDate(s, p.id, 'welcome')) : wel.size + '/4과목')
        : x.key === 'fellowship' ? (x.done ? md(lastDate(s, p.id, 'fellowship')) : fel.size + '/8주')
        : x.key === 'matching' ? x.detail
        : x.done ? md(v.completedAt) + (v.name ? ' · ' + v.name : '') : C.validDate(v.dueAt) ? '~' + md(v.dueAt) + (x.overdue ? ' 늦어짐' : '') : '';
      const state = x.done ? '완료' : x.overdue ? '늦어짐' : x === nx ? '다음 할 일' : '아직';
      return `<li class="${cls}"><span class="node" aria-hidden="true">${x.done ? '✓' : ''}</span><b>${esc(x.label)}</b>${x.key === 'education' ? pips(4, wel) : x.key === 'fellowship' ? pips(8, fel) : ''}<span class="sub">${esc(sub || (x === nx ? '다음' : ''))}</span><span class="visually-hidden">${state}</span></li>`;
    }).join('')}</ol>`;
  }

  // ── 현황판(새가족 카드): 이름·표·한 줄 정보·아이콘 → 다음 할 일 → 펼치면 진행 그림·회차·문자 예문
  let boardFilter = 'active', boardSearch = '', boardDistrict = '', boardView = 'card';
  // 한눈에 보는 진행 점검: 환영 전화 · 단톡방 · 교육 · 도우미 · 새사귐 · 프렌즈 · 사랑방 · 정착
  const CHECK = [['welcomeCall', '환영 전화'], ['groupInvite', '단톡방'], ['education', '교육'], ['matching', '도우미'], ['fellowship', '새사귐'], ['friends', '프렌즈'], ['loveGroup', '사랑방'], ['settled', '정착']];
  function checkItems(s, p, st = N.stages(s, p)) {
    const m = N.progressOf(s, p.id).milestones || {};
    return CHECK.map(([key, short]) => {
      const x = st.find(y => y.key === key), v = m[key] || {};
      const info = key === 'education' ? C.welcomeCompleted(s, p.id) + '/4'
        : key === 'fellowship' ? C.completed(s, p.id, 'fellowship').size + '/8'
        : key === 'matching' ? (x.done ? x.detail : x.detail === '매칭 대기' ? '대기' : '')
        : x.done ? md(v.completedAt) + (v.name ? ' ' + v.name : '') : C.validDate(v.dueAt) ? '~' + md(v.dueAt) : '';
      return { key, short, info, done: x.done, late: x.overdue, manual: !!x.manual };
    });
  }
  const checkCls = c => c.done ? 'done' : c.late ? 'late' : 'todo';
  const checkMark = c => c.done ? '✓' : c.late ? '!' : '·';
  function checkRow(ctx, p, st, paused) {
    const can = canProgress(ctx.me) && !paused;
    return `<div class="nc-check" aria-label="진행 점검">${checkItems(ctx.state, p, st).map(c => {
      const inner = `<i aria-hidden="true">${checkMark(c)}</i>${esc(c.short)}${c.info ? `<small>${esc(c.info)}</small>` : ''}`;
      const title = `${c.short} ${c.done ? '완료' : c.late ? '예정일 지남' : '아직'}${c.info ? ' · ' + c.info : ''}`;
      return c.manual && can ? `<button type="button" class="ck ${checkCls(c)}" data-mark="${c.key}" data-pid="${esc(p.id)}" title="${esc(title)} · 눌러서 기록">${inner}</button>` : `<span class="ck ${checkCls(c)}" title="${esc(title)}">${inner}</span>`;
    }).join('')}</div>`;
  }
  function boardTable(ctx, list) {
    const s = ctx.state, can = canProgress(ctx.me);
    return `<div class="table-wrap"><table class="nc-table"><thead><tr><th>교구</th><th>이름</th><th>등록</th>${CHECK.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${list.map(p => {
      const paused = N.progressOf(s, p.id).status === 'paused';
      return `<tr${paused ? ' class="paused"' : ''}><td>${esc(p.district || '')}</td><td><button type="button" class="name-link" data-open="${esc(p.id)}">${esc(p.name)}</button>${paused ? ' <span class="chip">중단</span>' : ''}</td><td>${esc(md(p.registeredAt))}</td>${checkItems(s, p).map(c => {
        const txt = `<i aria-hidden="true">${checkMark(c)}</i>${c.info ? esc(c.info) : ''}`;
        return `<td class="ck-cell ${checkCls(c)}">${c.manual && can && !paused ? `<button type="button" class="ck-btn" data-mark="${c.key}" data-pid="${esc(p.id)}" title="${esc(c.short)} 기록">${txt}</button>` : txt}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>
      <p class="muted small">✓ 완료(날짜) · ! 예정일 지남 · · 아직. ${can ? '칸을 누르면 그 단계를 기록합니다.' : ''}</p>`;
  }
  let onlyRequests = false;
  const openSteps = new Set(); // 펼쳐 둔 "전체 진행 과정"은 다시 그려도 펼친 채로
  const SVG = {
    tel: '<path d="M5 4h3.2l1.6 4-2 1.3a10 10 0 0 0 6.9 6.9l1.3-2 4 1.6V19a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/>',
    sms: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z"/>',
    rec: '<path d="M14.5 4.5l5 5L9 20H4v-5Z"/><path d="M12.5 6.5l5 5"/>',
    open: '<path d="M9 5l7 7-7 7"/>',
  };
  const ico = k => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SVG[k]}</svg>`;
  const dotDate = d => C.validDate(d) ? d.replace(/-/g, '.') : '';
  // 다음 단계에 어울리는 문자 예문
  const NEXT_TPL = { welcomeCall: 'welcome', groupInvite: 'welcome', education: 'education', matching: 'mentor', fellowship: 'mentor', friends: 'friends', loveGroup: 'lovegroup', settled: 'graduate' };
  const missedEdu = (s, p) => s.education.some(e => e.personId === p.id && e.status === 'absent' && !C.completed(s, p.id, e.course).has(String(e.subject)));
  const isLate = (s, p) => N.progressOf(s, p.id).status !== 'paused' && N.stages(s, p).some(x => x.overdue);

  Pages.board = {
    get label() { return root.UI && root.HamkkeApp?.ctx().me.role === 'committee' ? '새가족 현황판' : '새가족 현황'; },
    render(ctx) {
      const s = ctx.state, me = ctx.me, team = TEAM.includes(me.role);
      let list = N.newcomers(s);
      const c = N.counts(s, list), reqs = N.openRequests(s, me), reqIds = new Set(reqs.map(n => n.personId));
      const late = list.filter(p => !['settled', 'paused'].includes(N.bucket(s, p)) && isLate(s, p)).length;
      if (boardDistrict) list = list.filter(p => p.district === boardDistrict);
      if (boardFilter === 'late') list = list.filter(p => !['settled', 'paused'].includes(N.bucket(s, p)) && isLate(s, p));
      else if (boardFilter !== 'all') list = list.filter(p => { const b = N.bucket(s, p); return boardFilter === 'active' ? !['settled', 'paused'].includes(b) : b === boardFilter; });
      if (onlyRequests) list = list.filter(p => reqIds.has(p.id));
      if (boardSearch) list = list.filter(p => matches(p, boardSearch));
      list.sort((a, b) => String(a.registeredAt || '').localeCompare(String(b.registeredAt || '')) || String(a.name).localeCompare(b.name, 'ko'));
      const districts = [...new Set(N.newcomers(s).map(p => p.district))].sort((a, b) => a.localeCompare(b, 'ko'));
      const filters = [['active', '진행 중', c.active], ['late', '확인일 지남', late], ['waiting', '매칭 대기', c.waiting], ['fellowship', '새사귐 중', c.fellowship], ['settled', '정착·인계 대기', c.settled], ['paused', '중단', c.paused], ['all', '전체', c.all]];
      const canAdd = me.role === 'newcomer_admin' || me.role === 'admin';
      return `<div class="page-head"><div><div class="eyebrow">진행 중 ${c.active}명${late ? ` · <span class="danger">늦어짐 ${late}</span>` : ''}</div>
          <h1 class="page-title">${me.role === 'committee' ? esc(me.district) + ' 새가족 현황판' : '새가족 현황'}</h1></div>
        ${canAdd ? '<button type="button" class="primary" id="ncAdd">+ 새가족 추가</button>' : ''}</div>
      ${reqs.length ? `<button type="button" class="notice-btn" id="reqBtn">${onlyRequests ? '모든 새가족 보기' : `확인 요청 메모 ${reqs.length}건 보기 →`}</button>` : ''}
      <div class="seg wrap" role="group" aria-label="상태">${filters.map(([k, l, n]) => `<button type="button" data-bf="${k}" class="${boardFilter === k ? 'active' : ''}">${l} <b>${n}</b></button>`).join('')}</div>
      <div class="filters"><input id="boardSearch" placeholder="이름 · 전화번호 찾기" value="${esc(boardSearch)}" aria-label="찾기">
        ${team ? `<select id="boardDistrict" aria-label="교구"><option value="">모든 교구</option>${districts.map(d => `<option ${d === boardDistrict ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>` : ''}
        <div class="seg" role="group" aria-label="보기"><button type="button" data-bview="card" class="${boardView === 'card' ? 'active' : ''}">카드</button><button type="button" data-bview="table" class="${boardView === 'table' ? 'active' : ''}">표로 한눈에</button></div></div>
      ${canAdd ? registerForm(ctx) : ''}
      ${!list.length ? '<section class="card nc-list"><p class="muted nc-empty">해당하는 새가족이 없습니다.</p></section>'
        : boardView === 'table' ? `<section class="card">${boardTable(ctx, list)}</section>` : `<section class="card nc-list">${list.map(p => card(ctx, p, reqIds.has(p.id))).join('')}</section>`}`;
    },
    bind(ctx) {
      $$('[data-bf]').forEach(b => b.onclick = () => { boardFilter = b.dataset.bf; ctx.render(); });
      $$('[data-bview]').forEach(b => b.onclick = () => { boardView = b.dataset.bview; ctx.render(); });
      liveSearch('boardSearch', v => { boardSearch = v; }, ctx.render);
      const d = $('#boardDistrict'); if (d) d.onchange = () => { boardDistrict = d.value; ctx.render(); };
      const r = $('#reqBtn'); if (r) r.onclick = () => { onlyRequests = !onlyRequests; ctx.render(); };
      const add = $('#ncAdd'); if (add) add.onclick = () => { const dt = $('details.card.more'); dt.open = true; dt.scrollIntoView({ block: 'center' }); dt.querySelector('input[name=name]')?.focus(); };
      bindRows(ctx); bindRegister(ctx);
    },
  };

  function card(ctx, p, hasReq) {
    const s = ctx.state, me = ctx.me, st = N.stages(s, p), nx = N.nextStage(st), wk = N.weeksSince(p), notes = N.notesFor(s, p.id).length;
    const status = N.progressOf(s, p.id).status, done = st.filter(x => x.done).length, names = N.courses(s);
    const wel = C.completed(s, p.id, 'welcome'), fel = C.completed(s, p.id, 'fellowship');
    const mentor = p.mentorId ? s.mentors.find(m => m.id === p.mentorId)?.name : '';
    const meta = [`등록 ${dotDate(p.registeredAt) || '-'}`, wk ? wk + '주째' : '', `${done}/${st.length} 단계`, p.district, mentor ? '양육도우미 ' + mentor : ''].filter(Boolean).join(' · ');
    const tags = [st.some(x => x.overdue) && status !== 'paused' ? '<span class="chip warn">확인일 지남</span>' : '', status === 'paused' ? '<span class="chip">중단</span>' : '', hasReq ? '<span class="chip warn">확인 요청</span>' : '', notes ? `<span class="chip">메모 ${notes}</span>` : ''].join('');
    const phone = !!p.phone, tplKey = missedEdu(s, p) ? 'absent' : nx ? NEXT_TPL[nx.key] : 'graduate';
    const due = nx && nx.manual ? (N.progressOf(s, p.id).milestones || {})[nx.key]?.dueAt : '';
    const eduRow = (course, label, n, set, text) => `<div class="edu-row"><b>${label}</b><div class="edu-btns ${course}">${Array.from({ length: n }, (_, i) => `<button type="button" data-cedu="${course}" data-pid="${esc(p.id)}" data-sub="${i + 1}" class="${set.has(String(i + 1)) ? 'on' : ''}" aria-pressed="${set.has(String(i + 1))}" title="${esc(text(i))}">${course === 'welcome' ? `${i + 1}. ${esc(text(i))}` : `${i + 1}주`}</button>`).join('')}</div></div>`;
    return `<article class="nc-card">
      <div class="nc-top"><span class="av" aria-hidden="true">${esc(String(p.name || '?').trim().charAt(0))}</span>
        <div class="nc-main"><div class="nc-title"><button type="button" class="name-link" data-open="${esc(p.id)}">${esc(p.name)}</button>${p.office ? `<span class="muted">${esc(p.office)}</span>` : ''}${tags}</div>
          <div class="nc-meta">${esc(meta)}</div></div>
        <div class="nc-icons">${phone ? `<a class="ib" href="${M.telHref(p.phone)}" title="전화" aria-label="${esc(p.name)}님께 전화">${ico('tel')}</a><button type="button" class="ib" data-nsms="${esc(p.id)}" title="문자" aria-label="${esc(p.name)}님께 문자">${ico('sms')}</button>`
          : `<button type="button" class="ib" disabled title="전화번호 없음" aria-label="전화번호 없음">${ico('tel')}</button><button type="button" class="ib" disabled title="전화번호 없음" aria-label="전화번호 없음">${ico('sms')}</button>`}
          <button type="button" class="ib" data-nrec="${esc(p.id)}" title="연락 기록" aria-label="${esc(p.name)}님 연락 기록">${ico('rec')}</button><button type="button" class="ib" data-open="${esc(p.id)}" title="자세히" aria-label="${esc(p.name)}님 자세히">${ico('open')}</button></div></div>
      <div class="nc-next"><span>다음: <b>${esc(nx ? nx.label : '교구 인계 대기')}</b>${due ? ' · ~' + esc(dotDate(due)) : nx?.detail ? ' · ' + esc(nx.detail) : ''}${nx ? ' · ' + esc(nx.who) : ''}</span>
        ${nx?.manual && canProgress(me) && status !== 'paused' ? `<button type="button" class="primary" data-next="${esc(p.id)}" data-key="${nx.key}">${esc(nx.label)} 완료</button>` : ''}</div>
      ${checkRow(ctx, p, st, status === 'paused')}
      <details class="nc-steps" data-steps="${esc(p.id)}" ${openSteps.has(p.id) ? 'open' : ''}><summary>전체 진행 과정 · ${done}/${st.length} 단계</summary>
        ${stepper(s, p, st)}
        ${canAttendance(me) ? eduRow('welcome', '새가족교육', 4, wel, i => names.welcome[i]) : ''}
        ${canProgress(me) && p.mentorId && wel.size === 4 ? eduRow('fellowship', '새사귐반', 8, fel, i => names.fellowship[i]) : ''}
        ${phone ? `<div class="edu-row"><b>문자</b><div class="edu-btns tpls">${M.templatesFor(s, 'new').map(t => `<button type="button" class="tpl-chip ${t.key === tplKey ? 'next' : ''}" data-ctpl="${t.key}" data-pid="${esc(p.id)}" title="${t.key === tplKey ? '지금 단계에 보낼 문자' : ''}">${esc(t.label)}</button>`).join('')}</div></div>` : ''}
      </details></article>`;
  }
  // 4과목·새사귐 회차: 누르면 오늘 날짜로 이수, 이수한 것을 다시 누르면 취소(물어봄)
  async function toggleEdu(ctx, p, course, sub, after) {
    const s = ctx.state, names = N.courses(s), done = C.completed(s, p.id, course).has(String(sub));
    const title = course === 'welcome' ? names.welcome[sub - 1] : sub + '주 ' + names.fellowship[sub - 1];
    if (done && !(await ask('이수 취소', `${p.name}님의 "${title}" 이수 기록을 취소할까요?`, '취소하기', true))) return;
    if (await ctx.commit(st2 => C.upsertEducation(st2, { id: uid(), personId: p.id, course, subject: String(sub), status: done ? 'absent' : 'completed', date: today(), recordedBy: ctx.me.name }), done ? '이수 기록을 취소했습니다.' : `"${title}" 이수를 기록했습니다.`)) after?.();
  }
  function bindRows(ctx) {
    $$('[data-open]').forEach(b => b.onclick = () => detail(ctx, b.dataset.open));
    $$('[data-next]').forEach(b => b.onclick = () => { const p = ctx.state.people.find(x => x.id === b.dataset.next); stageDialog(ctx, p, b.dataset.key, 'done', closeDialog); });
    // 점검 칸을 눌러 어느 단계든 기록(이미 한 단계는 날짜·사랑방 이름을 고침)
    $$('[data-mark]').forEach(b => b.onclick = () => { const p = ctx.state.people.find(x => x.id === b.dataset.pid); stageDialog(ctx, p, b.dataset.mark, 'done', closeDialog, false); });
    $$('[data-nrec]').forEach(b => b.onclick = () => root.HamkkeVisit.visitForm(ctx, b.dataset.nrec));
    $$('[data-nsms]').forEach(b => b.onclick = () => root.HamkkeVisit.startMessage(ctx, [b.dataset.nsms]));
    $$('[data-steps]').forEach(d => d.ontoggle = () => { if (d.open) openSteps.add(d.dataset.steps); else openSteps.delete(d.dataset.steps); });
    $$('[data-cedu]').forEach(b => b.onclick = () => { const p = ctx.state.people.find(x => x.id === b.dataset.pid); if (p) toggleEdu(ctx, p, b.dataset.cedu, Number(b.dataset.sub)); });
    $$('[data-ctpl]').forEach(b => b.onclick = () => root.HamkkeVisit.startMessage(ctx, [b.dataset.pid], b.dataset.ctpl, 'new'));
  }

  // ── 한 명 등록(새가족 관리자): 엑셀과 같은 검사(교구 이름, 같은 분 경고)를 거칩니다.
  function registerForm(ctx) {
    const g = C.groups(ctx.state);
    return `<details class="card more"><summary>새가족 한 명 등록</summary><form id="ncRegister" class="form-grid">
      <label>이름<input name="name" required maxlength="40"></label><label>휴대전화<input name="phone" inputmode="tel"></label>
      <label>교구<select name="district">${g.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></label>
      <label>등록일<input type="date" name="registeredAt" value="${today()}"></label><label>생년월일<input type="date" name="birthDate"></label>
      <div id="ncWarn" class="warn-list small"></div><div class="acts"><button class="primary">등록</button></div></form></details>`;
  }
  function bindRegister(ctx) {
    const f = $('#ncRegister'); if (!f) return;
    let confirmed = '';
    f.onsubmit = async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(f));
      const row = { 새가족ID: 'N' + today().replace(/-/g, '').slice(2) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), 이름: d.name, 휴대전화: d.phone, 교구: d.district, 등록일: d.registeredAt, 생년월일: d.birthDate };
      const pv = C.previewImport(ctx.state, { 새가족명단: [row] }, { allow: ['새가족명단'] });
      if (pv.errors.length) return toast(pv.errors[0].replace(/^새가족명단 2행: /, ''));
      const key = d.name + '|' + d.phone;
      if (pv.warnings.length && confirmed !== key) { confirmed = key; $('#ncWarn').innerHTML = pv.warnings.map(w => `<p>${esc(w.replace(/^새가족명단 2행: /, ''))} 다른 분이 맞으면 한 번 더 "등록"을 누르세요.</p>`).join(''); return; }
      if (await ctx.commit(s => C.applyImport(s, pv), d.name + '님을 등록했습니다.')) confirmed = '';
    };
  }

  // ── 자세히: 단계 기록, 새사귐 8주, 상태, 소통 메모
  function detail(ctx, pid) {
    const s = ctx.state, p = s.people.find(x => x.id === pid); if (!p) return;
    const me = ctx.me, st = N.stages(s, p), pr = N.progressOf(s, pid), names = N.courses(s), edit = canProgress(me);
    const fel = C.completed(s, pid, 'fellowship'), wel = C.completed(s, pid, 'welcome');
    const notes = N.notesFor(s, pid);
    const body = dialog(p.name + ' · 새가족 과정', `
      <p class="muted small">${esc(p.district)} · 등록 ${esc(p.registeredAt || '-')}${N.weeksSince(p) ? ' · ' + N.weeksSince(p) + '주차' : ''} · ${esc(N.STATUS[pr.status] || '진행 중')}</p>
      ${stepper(s, p, st)}
      ${canAttendance(me) ? `<div class="edu-quick"><b>새가족교육</b>${names.welcome.map((n, i) => `<button type="button" data-edu="welcome" data-sub="${i + 1}" class="${wel.has(String(i + 1)) ? 'on' : ''}" aria-pressed="${wel.has(String(i + 1))}">${i + 1}. ${esc(n)}</button>`).join('')}</div>` : ''}
      ${edit && p.mentorId && wel.size === 4 ? `<div class="edu-quick"><b>새사귐반</b>${names.fellowship.map((n, i) => `<button type="button" data-edu="fellowship" data-sub="${i + 1}" class="${fel.has(String(i + 1)) ? 'on' : ''}" aria-pressed="${fel.has(String(i + 1))}" title="${esc(n)}">${i + 1}주</button>`).join('')}</div>` : ''}
      <p class="muted small">${canAttendance(me) || edit ? '단추를 누르면 오늘 날짜로 이수가 기록됩니다. 이수한 단추를 다시 누르면 취소할 수 있습니다.' : ''}</p>
      <ol class="stage-list">${st.map(x => `<li class="${x.done ? 'done' : x.overdue ? 'late' : ''}"><div class="grow"><b>${esc(x.label)}</b> <span class="muted small">${esc(x.detail || '')}${x.overdue ? ' · 늦어짐' : ''}</span>
        <div class="muted small">기록: ${esc(x.who)}</div></div>
        ${edit && N.MANUAL.includes(x.key) && pr.status !== 'paused' ? `<div class="acts">${x.done ? `<button type="button" data-undo="${x.key}" class="quiet">완료 취소</button>` : `<button type="button" class="primary" data-done="${x.key}">완료</button><button type="button" data-due="${x.key}">예정일</button>`}</div>` : ''}</li>`).join('')}</ol>
      <details class="more" ${wel.size === 4 ? 'open' : ''}><summary>새가족교육 ${wel.size}/4 · 새사귐반 ${fel.size}/8주</summary>
        <p class="small muted">4과목: ${names.welcome.map((n, i) => `${wel.has(String(i + 1)) ? '✓' : '○'} ${esc(n)}`).join(' · ')}</p>
        ${wel.size === 4 ? `<form id="felForm" class="fel-grid">${names.fellowship.map((n, i) => `<label class="check"><input type="checkbox" name="w${i + 1}" ${fel.has(String(i + 1)) ? 'checked disabled' : ''} ${edit && p.mentorId ? '' : 'disabled'}> ${i + 1}주 · ${esc(n)}</label>`).join('')}
          ${edit && p.mentorId ? `<label>이수 날짜<input type="date" name="date" value="${today()}" max="${today()}"></label><div class="acts"><button class="primary">체크한 주 저장</button></div>` : `<p class="muted small">${p.mentorId ? '' : '양육도우미 매칭 뒤에 기록합니다.'}</p>`}</form>` : '<p class="muted small">4과목을 모두 마치면 새사귐반을 기록할 수 있습니다.</p>'}</details>
      ${edit ? `<div class="acts"><button type="button" id="toggleStatus">${pr.status === 'paused' ? '다시 진행' : '중단으로 표시'}</button></div>` : ''}
      <h3>소통 메모</h3><p class="notice small">새가족위원 · 교구 목사 · 새가족팀이 함께 봅니다. <b>건강·가정사 등 민감한 내용은 쓰지 마세요.</b></p>
      <div class="note-list">${notes.length ? notes.map(n => `<div class="note ${n.request && !n.resolvedAt ? 'req' : ''}"><div class="muted small">${esc(n.authorName || '')} · ${esc(new Date(n.createdAt).toLocaleString('ko-KR'))}${n.request ? (n.resolvedAt ? ` · 확인함(${esc(n.resolvedBy || '')})` : ' · 확인 요청') : ''}</div><p>${esc(n.text)}</p>
        ${n.request && !n.resolvedAt && n.authorId !== me.userId ? `<button type="button" data-resolve="${esc(n.id)}">확인했습니다</button>` : ''}</div>`).join('') : '<p class="muted small">아직 메모가 없습니다.</p>'}</div>
      <form id="noteForm" class="stack"><label class="visually-hidden" for="noteText">메모</label><textarea id="noteText" name="text" rows="2" maxlength="300" placeholder="예: 사랑방 배정 부탁드립니다"></textarea>
        <label class="check"><input type="checkbox" name="request"> 확인 요청으로 남기기(받는 분 화면에 표시)</label><div class="acts"><button class="primary">메모 남기기</button></div></form>`);
    const again = () => { closeDialog(); detail(ctx, pid); };
    const save = async (fn, msg) => { closeDialog(); if (await ctx.commit(fn, msg)) detail(root.HamkkeApp.ctx(), pid); };
    $$('[data-done]', body).forEach(b => b.onclick = () => stageDialog(ctx, p, b.dataset.done, 'done', again));
    $$('[data-due]', body).forEach(b => b.onclick = () => stageDialog(ctx, p, b.dataset.due, 'due', again));
    $$('[data-undo]', body).forEach(b => b.onclick = async () => { if (await ask('완료 취소', '이 단계의 완료 기록을 지울까요?', '취소하기', true)) save(st2 => N.setMilestone(st2, pid, b.dataset.undo, { completedAt: '' }), '완료 기록을 지웠습니다.'); });
    const ts = $('#toggleStatus', body); if (ts) ts.onclick = () => save(st2 => N.setStatus(st2, pid, pr.status === 'paused' ? 'active' : 'paused'), '상태를 바꾸었습니다.');
    const ff = $('#felForm', body); if (ff && edit && p.mentorId) ff.onsubmit = e => {
      e.preventDefault(); const f = new FormData(ff), date = f.get('date'), weeks = [1, 2, 3, 4, 5, 6, 7, 8].filter(i => f.get('w' + i) === 'on' && !fel.has(String(i)));
      if (!weeks.length) return toast('새로 체크한 주가 없습니다.');
      save(st2 => { for (const i of weeks) C.upsertEducation(st2, { id: uid(), personId: pid, course: 'fellowship', subject: String(i), status: 'completed', date, recordedBy: me.name }); }, `새사귐반 ${weeks.length}주를 기록했습니다.`);
    };
    $$('[data-edu]', body).forEach(b => b.onclick = async () => {
      const course = b.dataset.edu, sub = b.dataset.sub, done = (course === 'welcome' ? wel : fel).has(sub);
      const title = course === 'welcome' ? names.welcome[sub - 1] : sub + '주 ' + names.fellowship[sub - 1];
      if (done && !(await ask('이수 취소', `${p.name}님의 "${title}" 이수 기록을 취소할까요?`, '취소하기', true))) return;
      save(st2 => C.upsertEducation(st2, { id: uid(), personId: pid, course, subject: sub, status: done ? 'absent' : 'completed', date: today(), recordedBy: me.name }), done ? '이수 기록을 취소했습니다.' : `"${title}" 이수를 기록했습니다.`);
    });
    $$('[data-resolve]', body).forEach(b => b.onclick = () => save(st2 => N.resolveNote(st2.notes.find(n => n.id === b.dataset.resolve), me), '확인했습니다.'));
    $('#noteForm', body).onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { const n = N.makeNote(pid, me, f.get('text'), f.get('request') === 'on'); save(st2 => { st2.notes.push(n); }, '메모를 남겼습니다.'); } catch (err) { toast(err.message); }
    };
  }
  function stageDialog(ctx, p, key, mode, back, reopen = true) {
    const label = N.STAGES.find(x => x.key === key).label, cur = (N.progressOf(ctx.state, p.id).milestones || {})[key] || {};
    const body = dialog(`${p.name} · ${label}`, `<form id="stageForm" class="stack">
      ${mode === 'done' && C.validDate(cur.completedAt) ? `<p class="muted small">이미 ${esc(cur.completedAt)}에 기록되어 있습니다. 고치려면 바꾸고 저장하세요.</p>` : ''}
      <label>${mode === 'done' ? '한 날짜' : '예정일'}<input type="date" name="d" value="${mode === 'done' ? (C.validDate(cur.completedAt) ? cur.completedAt : today()) : ''}" ${mode === 'done' ? `max="${today()}"` : `min="${today()}"`} required></label>
      ${key === 'loveGroup' && mode === 'done' ? `<label>사랑방 이름<input name="name" maxlength="40" value="${esc(cur.name || '')}" placeholder="예: 5-3 사랑방"></label>` : ''}
      ${key === 'settled' && mode === 'done' ? '<p class="notice small">정착을 확인하면 교구 목사님 화면의 "인계 대기"에 나타납니다. 교구 목사님이 받으시면 새가족 목록에서 빠지고 심방 명단으로 옮겨집니다.</p>' : ''}
      <div class="acts"><button type="button" class="quiet" id="stageBack">뒤로</button><button class="primary">저장</button></div></form>`);
    $('#stageBack', body).onclick = back;
    $('#stageForm', body).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), patch = mode === 'done' ? { completedAt: f.get('d'), ...(f.get('name') ? { name: String(f.get('name')).trim() } : {}) } : { dueAt: f.get('d') };
      closeDialog();
      if (await ctx.commit(s => N.setMilestone(s, p.id, key, patch), mode === 'done' ? `${label} 완료를 기록했습니다.` : '예정일을 정했습니다.') && reopen) detail(root.HamkkeApp.ctx(), p.id);
    };
  }

  // ── 4과목 출석 (새가족 담당 목사·새가족 관리자·최고 관리자·새가족위원)
  let attSubject = '1', attDate = '', lastAbsent = [];
  Pages.attendance = {
    label: '4과목 출석',
    render(ctx) {
      const s = ctx.state, names = N.courses(s).welcome, date = attDate || today();
      const list = N.newcomers(s).filter(p => N.progressOf(s, p.id).status !== 'paused' && C.welcomeCompleted(s, p.id) < 4).sort((a, b) => String(a.name).localeCompare(b.name, 'ko'));
      const doneSet = p => C.completed(s, p.id, 'welcome');
      return `<div class="eyebrow">새가족</div><h1 class="page-title">새가족교육 4과목 출석</h1>
      <ol class="flow"><li>과목 고르기</li><li>출석·결석·보강 표시</li><li>저장</li></ol>
      <p class="subtitle">순서와 상관없이 네 과목을 모두 들으면 이수입니다. 4과목을 마친 분은 "양육도우미 매칭"에 나타납니다.</p>
      <section class="card"><div class="form-grid"><label>과목<select id="attSubject">${names.map((n, i) => `<option value="${i + 1}" ${String(i + 1) === attSubject ? 'selected' : ''}>${i + 1}. ${esc(n)}</option>`).join('')}</select></label>
        <label>날짜<input type="date" id="attDate" value="${date}" max="${today()}"></label></div>
        ${lastAbsent.length ? `<div class="notice"><b>결석 ${lastAbsent.length}명</b>을 저장했습니다. 안부 문자를 보내 보세요. <button type="button" class="primary" id="absentSms">결석한 분께 문자</button></div>` : ''}
        ${list.length ? `<form id="attForm"><div class="list">${list.map(p => { const has = doneSet(p).has(attSubject); return `<div class="row"><div class="grow"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.district)} · ${doneSet(p).size}/4</span>${has ? ' <span class="chip ok">이 과목 이수</span>' : ''}</div>
          ${has ? '' : `<div class="seg" role="radiogroup" aria-label="${esc(p.name)} 출석">${[['', '—'], ['completed', '출석'], ['absent', '결석'], ['makeup', '보강']].map(([v, l]) => `<label class="seg-opt"><input type="radio" name="a-${esc(p.id)}" value="${v}" ${v === '' ? 'checked' : ''}> ${l}</label>`).join('')}</div>`}</div>`; }).join('')}</div>
          <p class="muted small">보강은 빠진 과목을 다음 순서에 들은 경우입니다. 보강도 이수로 세려면 "출석"으로 표시해 주세요.</p>
          <div class="acts"><button class="primary">출석 저장</button></div></form>` : '<p class="muted">4과목을 듣고 있는 새가족이 없습니다.</p>'}</section>`;
    },
    bind(ctx) {
      $('#attSubject').onchange = e => { attSubject = e.target.value; ctx.render(); };
      $('#attDate').onchange = e => { attDate = e.target.value; };
      const as = $('#absentSms'); if (as) as.onclick = () => { const ids = lastAbsent; lastAbsent = []; root.HamkkeVisit.startMessage(ctx, ids, 'absent', 'new'); };
      const f = $('#attForm'); if (!f) return;
      f.onsubmit = e => {
        e.preventDefault(); const date = $('#attDate').value, data = new FormData(f);
        if (!C.validDate(date) || date > today()) return toast('날짜를 확인해 주세요.');
        const marks = [...data.entries()].filter(([k, v]) => k.startsWith('a-') && v).map(([k, v]) => [k.slice(2), v]);
        if (!marks.length) return toast('표시한 분이 없습니다.');
        const absent = marks.filter(([, v]) => v === 'absent').map(([pid]) => pid);
        ctx.commit(s => { for (const [pid, status] of marks) C.upsertEducation(s, { id: uid(), personId: pid, course: 'welcome', subject: attSubject, status, date, recordedBy: ctx.me.name }); lastAbsent = absent; }, `${marks.length}명의 출석을 저장했습니다.`);
      };
    },
  };

  // ── 교구 목사: 인계 받기 + 우리 교구 새가족(읽기) + 확인 요청
  Pages.handover = {
    get label() { return root.HamkkeApp?.ctx().me.role === 'admin' ? '새가족 인계' : '새가족'; },
    render(ctx) {
      const s = ctx.state, ready = N.handoverReady(s).filter(p => p.district === ctx.me.district), reqs = N.openRequests(s, ctx.me);
      const list = N.newcomers(s).filter(p => !ready.includes(p));
      return `<div class="eyebrow">교구</div><h1 class="page-title">${esc(ctx.me.district)} 새가족</h1>
      <ol class="flow"><li>위원이 정착 확인</li><li>인계 받기</li><li>심방 배정에서 주 담당 정하기</li></ol>
      <section class="card"><h2>인계 대기 <span class="chip">${ready.length}</span></h2>${ready.length ? `<div class="list">${ready.map(p => { const st = N.stages(s, p); return `<div class="row"><div class="grow"><b>${esc(p.name)}</b> <span class="muted small">등록 ${esc(p.registeredAt || '-')} · 정착 확인 ${esc(N.progressOf(s, p.id).milestones.settled.completedAt)}</span>${dots(st)}
        <div class="muted small">${st.filter(x => x.done && x.detail).map(x => esc(x.label + ' ' + x.detail)).join(' · ')}</div></div><button class="primary" data-accept="${esc(p.id)}">인계 받기</button></div>`; }).join('')}</div>` : '<p class="muted">인계를 기다리는 분이 없습니다.</p>'}</section>
      ${reqs.length ? `<section class="card"><h2>확인 요청 메모 <span class="chip warn">${reqs.length}</span></h2><div class="list">${reqs.map(n => { const p = s.people.find(x => x.id === n.personId); return `<div class="row"><div class="grow"><b>${esc(p?.name || '')}</b> <span class="muted small">${esc(n.authorName || '')}</span><p class="small">${esc(n.text)}</p></div><button data-open="${esc(n.personId)}">열기</button></div>`; }).join('')}</div></section>` : ''}
      <h2 class="section-title">과정 중인 새가족 <span class="chip">${list.length}</span></h2><section class="card nc-list">${list.length ? list.map(p => card(ctx, p, reqs.some(n => n.personId === p.id))).join('') : '<p class="muted nc-empty">없습니다.</p>'}</section>`;
    },
    bind(ctx) {
      bindRows(ctx);
      $$('[data-accept]').forEach(b => b.onclick = async () => {
        const p = ctx.state.people.find(x => x.id === b.dataset.accept);
        if (!await ask('인계 받기', `${p.name}님을 ${ctx.me.district} 성도로 받습니다. 새가족 목록에서 빠지고 심방 명단에 들어갑니다.`, '인계 받기')) return;
        if (await ctx.commit(s => N.acceptHandover(s, p.id, ctx.me), `${p.name}님을 인계 받았습니다. 심방 배정에서 주 담당을 정해 주세요.`)) { }
      });
    },
  };

  // ── 새가족 주간 보고: 위원이 주일 10시에 승인 → 파송 교구 목사 + 새가족 담당 목사
  function reportDoc(r, draft) {
    const s = r.summary;
    return `<article class="report-doc"><header><div class="eyebrow">${draft ? '초안 · 아직 승인 전' : r.revision > 1 ? `수정본 ${r.revision}` : '승인함'}</div>
      <h2>새가족 주간 보고</h2><p class="muted small">${esc(r.district)} · ${esc(r.authorName || '')} · ${esc(r.period)}${r.approvedAt ? ' · 승인 ' + esc(new Date(r.approvedAt).toLocaleString('ko-KR')) : ''}</p></header>
      <div class="stats"><div class="stat"><b>${s.active}</b>진행 중</div><div class="stat"><b>${s.moved}</b>이번 주 진행</div><div class="stat"><b>${s.waiting}</b>매칭 대기</div><div class="stat"><b>${s.fellowship}</b>새사귐 중</div><div class="stat"><b>${s.settled}</b>정착·인계 대기</div><div class="stat ${s.late ? 'warn' : ''}"><b>${s.late}</b>늦어짐</div><div class="stat"><b>${s.requests}</b>확인 요청</div></div>
      ${r.rows.length ? `<div class="table-wrap"><table><thead><tr><th>새가족</th><th>다음 단계</th><th>이번 주</th><th>살필 것</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.name)}${x.status !== '진행 중' ? ` (${esc(x.status)})` : ''}</td><td>${esc(x.stage)}</td><td class="long">${esc(x.changes.join(', ') || '-')}</td><td class="long">${esc(x.overdue.length ? x.overdue.join(', ') + ' 늦어짐' : '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">새가족이 없습니다.</p>'}
      ${r.note ? `<h3>덧붙이는 말</h3><p>${esc(r.note)}</p>` : ''}</article>`;
  }
  let nPick = 0;
  Pages.nreport = {
    label: '주간 보고',
    render(ctx) {
      const s = ctx.state, weeks = [0, 1, 2, 3].map(n => K.reportWindow(n)), w = K.reportWindow(nPick);
      const done = K.latestReport(s, 'newcomer', ctx.me.userId, w.key), draft = N.newcomerDraft(s, ctx.me, w);
      return `<div class="eyebrow">새가족</div><h1 class="page-title">새가족 주간 보고</h1>
      <ol class="flow"><li>주일 10시 초안 완성</li><li>내용 확인</li><li>승인</li><li>교구 목사님 · 새가족 담당 목사님께 전달</li></ol>
      <div class="seg" role="group" aria-label="주간 선택">${weeks.map((x, i) => `<button type="button" data-week="${i}" class="${i === nPick ? 'active' : ''}">${esc(x.key.slice(5))} 주일 ${K.latestReport(s, 'newcomer', ctx.me.userId, x.key) ? '✓' : ''}</button>`).join('')}</div>
      <section class="card">${done ? reportDoc(done) + '<div class="acts"><button type="button" id="nrevise">수정본 만들기</button></div>'
        : reportDoc(draft, true) + `<label>덧붙이는 말 (선택)<textarea id="nNote" rows="2" maxlength="500"></textarea></label><div class="acts"><button type="button" class="primary" id="napprove">확인했습니다 · 승인</button></div>
        <p class="muted small">이름과 진행 단계만 담습니다. 승인 전 초안은 목사님들께 보이지 않습니다.</p>`}</section>`;
    },
    bind(ctx) {
      $$('[data-week]').forEach(b => b.onclick = () => { nPick = Number(b.dataset.week); ctx.render(); });
      const w = K.reportWindow(nPick);
      const a = $('#napprove'); if (a) a.onclick = async () => {
        const draft = N.newcomerDraft(ctx.state, ctx.me, w), note = $('#nNote').value;
        if (!await ask('보고서 승인', `${w.label} 새가족 보고서를 승인합니다.`, '승인')) return;
        ctx.commit(s => { s.reports.push(K.makeReport(draft, note, null)); }, '보고서를 승인했습니다.');
      };
      const rv = $('#nrevise'); if (rv) rv.onclick = async () => {
        const prev = K.latestReport(ctx.state, 'newcomer', ctx.me.userId, w.key);
        if (!await ask('수정본 만들기', '지금 기록으로 수정본을 만들어 승인합니다. 이전 보고서는 그대로 남습니다.', '수정본 승인')) return;
        ctx.commit(s => { s.reports.push(K.makeReport(N.newcomerDraft(s, ctx.me, w), prev.note, prev)); }, '수정본을 승인했습니다.');
      };
    },
  };
  // 새가족 담당 목사: 모든 교구의 승인된 새가족 보고
  let npWeek = 0, npOpen = '';
  Pages.nreports = {
    get label() { return root.HamkkeApp?.ctx().me.role === 'admin' ? '새가족 보고 받기' : '보고 받기'; },
    render(ctx) {
      const s = ctx.state, w = K.reportWindow(npWeek), weeks = [0, 1, 2, 3, 4, 5, 6, 7].map(n => K.reportWindow(n));
      if (npOpen) { const r = s.reports.find(x => x.id === npOpen); if (r) return `<div class="acts no-print"><button type="button" id="npBack">← 보고 목록</button><button type="button" id="npPrint">인쇄 · PDF로 저장</button></div><section class="card">${reportDoc(r)}</section>`; npOpen = ''; }
      const latest = new Map();
      for (const r of s.reports.filter(r => r.type === 'newcomer' && r.weekKey === w.key)) { const k = r.authorId; if (!latest.has(k) || String(r.approvedAt) > String(latest.get(k).approvedAt)) latest.set(k, r); }
      const list = [...latest.values()].sort((a, b) => a.district.localeCompare(b.district, 'ko'));
      return `<div class="eyebrow">새가족</div><h1 class="page-title">새가족 보고 받기</h1><p class="subtitle">각 교구 새가족위원이 승인한 보고만 보입니다.</p>
      <label class="inline">주간<select id="npWeek">${weeks.map((x, i) => `<option value="${i}" ${i === npWeek ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      <section class="card">${list.length ? `<div class="list">${list.map(r => `<div class="row"><div class="grow"><b>${esc(r.district)}</b> · ${esc(r.authorName)} <span class="chip ok">승인${r.revision > 1 ? ' · 수정본' : ''}</span><div class="muted small">진행 ${r.summary.active} · 이번 주 진행 ${r.summary.moved} · 늦어짐 ${r.summary.late}</div></div><button data-npopen="${esc(r.id)}">보고서 보기</button></div>`).join('')}</div>` : '<p class="muted">이 주에 승인된 보고가 아직 없습니다.</p>'}</section>`;
    },
    bind(ctx) {
      const sel = $('#npWeek'); if (sel) sel.onchange = () => { npWeek = Number(sel.value); ctx.render(); };
      $$('[data-npopen]').forEach(b => b.onclick = () => { npOpen = b.dataset.npopen; ctx.render(); });
      const bk = $('#npBack'); if (bk) bk.onclick = () => { npOpen = ''; ctx.render(); };
      const pr = $('#npPrint'); if (pr) pr.onclick = () => root.print();
    },
  };

  root.HamkkeNewcomer = { detail, reportDoc, dots, stepper };
})(window);
