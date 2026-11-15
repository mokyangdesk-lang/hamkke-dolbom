/* 함께 돌봄 5.0 — 심방 사역 화면: 오늘 할 일, 교구 성도, 문자 보내기, 주일 보고(사역자 승인 / 교구 목사 열람). */
(function (root) {
  'use strict';
  const { $, $$, esc, toast, dialog, closeDialog, ask, copyText } = root.UI;
  const C = root.MinistryCore, K = root.CareCore, M = root.Messages, store = root.HamkkeStore;
  const Pages = root.HamkkePages = root.HamkkePages || {};
  const uid = () => (root.crypto?.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const today = () => C.iso(K.now());
  const ago = d => { const n = K.daysBetween(d, today()); return n <= 0 ? '오늘' : n === 1 ? '어제' : n + '일 전'; };

  // 같은 교구 사역자끼리 명단 공유: 누가 언제 연락했는지 보여 겹치는 연락을 막습니다.
  function lastLine(state, p) {
    const v = K.lastVisit(state, p.id);
    return v ? `${esc(v.authorName || '')} · ${esc(ago(v.date))} · ${esc(v.result)}` : '연락 기록 없음';
  }
  const isMine = (me, p) => p.visitorId === me.userId;
  function personRow(ctx, p, extra = '') {
    return `<div class="row person"><div class="grow"><b>${esc(p.name)}</b> ${isMine(ctx.me, p) ? '<span class="chip">내 담당</span>' : ''}${extra}
      <div class="muted small">최근 연락: ${lastLine(ctx.state, p)}</div></div>
      <div class="acts">${p.phone ? `<a class="button" href="${M.telHref(p.phone)}">전화</a><button data-sms="${esc(p.id)}">문자</button>` : '<span class="muted small">전화번호 없음</span>'}<button class="primary" data-rec="${esc(p.id)}">기록</button></div></div>`;
  }
  function bindRows(ctx) {
    $$('[data-rec]').forEach(b => b.onclick = () => visitForm(ctx, b.dataset.rec));
    $$('[data-sms]').forEach(b => b.onclick = () => { flow = { step: 2, ids: [b.dataset.sms], tpl: '', text: '', i: 0 }; ctx.go('message'); });
  }

  // ── 연락 기록 창
  function visitForm(ctx, id) {
    const p = ctx.state.people.find(x => x.id === id); if (!p) return;
    const recent = K.visitsOf(ctx.state, id).slice(0, 3);
    const radios = K.RESULTS.map((r, i) => `<label class="check"><input type="radio" name="result" value="${r}" ${i === 0 ? 'checked' : ''}> ${r}</label>`).join('');
    const body = dialog(p.name + ' · 연락 기록', `<form id="visitForm" class="stack">
      <label>사역 날짜<input type="date" name="date" value="${today()}" max="${today()}" required></label>
      <fieldset class="field-set"><legend>연락 결과</legend><div class="choice-grid">${radios}</div></fieldset>
      <label>교회 출석 상황<select name="affiliation">${K.AFFILIATION.map(a => `<option ${a === (K.lastVisit(ctx.state, id)?.affiliation || '') ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label>돌봄 필요<select name="careNeed">${K.CARE_NEED.map(a => `<option>${a}</option>`).join('')}</select></label>
      <label>사역 내용 <span class="muted small">(짧게 · 건강·가정사 자세한 내용은 쓰지 않기)</span><textarea name="memo" maxlength="1000" rows="3"></textarea></label>
      <label>기도제목<textarea name="prayer" maxlength="500" rows="2"></textarea></label>
      <label class="check"><input type="checkbox" name="prayerInReport" checked> 기도제목을 주간 보고서에 넣기</label>
      <label>다음 연락 예정일 <span class="muted small">(있으면 "오늘 할 일"에 나타남)</span><input type="date" name="nextDate" min="${today()}"></label>
      ${recent.length ? `<details class="more"><summary>최근 연락 ${recent.length}건</summary>${recent.map(v => `<p class="small">${esc(v.date)} · ${esc(v.authorName || '')} · ${esc(v.result)}</p>`).join('')}</details>` : ''}
      <div class="acts"><button type="button" class="quiet" id="visitCancel">취소</button><button class="primary">저장</button></div></form>`);
    $('#visitCancel', body).onclick = closeDialog;
    $('#visitForm', body).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      if (!C.validDate(f.get('date')) || f.get('date') > today()) return toast('사역 날짜를 확인해 주세요.');
      const v = { id: uid(), personId: id, authorId: ctx.me.userId, authorName: ctx.me.name, createdAt: K.now().toISOString(), date: f.get('date'),
        result: f.get('result'), affiliation: f.get('affiliation'), careNeed: f.get('careNeed'), memo: String(f.get('memo') || '').trim(),
        prayer: String(f.get('prayer') || '').trim(), prayerInReport: f.get('prayerInReport') === 'on', nextDate: f.get('nextDate') || '' };
      closeDialog();
      await ctx.commit(s => { s.visits.push(v); }, '연락 기록을 저장했습니다.');
    };
  }

  // ── 오늘 할 일
  Pages.today = {
    label: '오늘 할 일',
    render(ctx) {
      const s = ctx.state, mineOnly = ctx.me.role === 'visitor';
      const scope = p => !mineOnly || isMine(ctx.me, p);
      const bdays = K.carePeople(s).map(p => ({ p, d: C.birthdayDistance(p, today()) })).filter(x => x.d !== null && x.d >= 0 && x.d <= 7 && scope(x.p)).sort((a, b) => a.d - b.d);
      const due = K.dueRecontacts(s).filter(x => scope(x.p));
      const long = K.longNoContact(s).filter(x => scope(x.p));
      const pending = ctx.me.role === 'visitor' && !K.latestReport(s, 'visit', ctx.me.userId, K.reportWindow(0).key) && K.visitDraft(s, ctx.me, K.reportWindow(0)).rows.length;
      const section = (title, hint, items) => `<section class="card"><div class="between"><h2>${title} <span class="chip">${items.length}</span></h2><span class="muted small">${hint}</span></div>
        ${items.length ? `<div class="list">${items.join('')}</div>` : '<p class="muted">없습니다.</p>'}</section>`;
      return `<div class="eyebrow">심방</div><h1 class="page-title">오늘 할 일</h1>
      <p class="subtitle">${esc(today())} · ${mineOnly ? '내 담당 성도 기준' : esc(ctx.me.district) + ' 전체'}</p>
      ${pending ? `<button type="button" class="notice-btn" data-go="report">승인할 주간 보고서가 있습니다 →</button>` : ''}
      ${section('생일', '오늘부터 7일 안', bdays.map(x => personRow(ctx, x.p, ` <span class="chip warn">${x.d === 0 ? '오늘 생일' : x.d + '일 뒤 생일'}</span>`)))}
      ${section('다시 연락할 분', '정해 둔 날이 된 분', due.map(x => personRow(ctx, x.p, ` <span class="chip">예정 ${esc(x.v.nextDate)}</span>`)))}
      ${section('오래 연락 못 한 분', `통화·방문이 ${K.settings(s).longDays}일 넘게 없는 분`, long.slice(0, 30).map(x => personRow(ctx, x.p, ` <span class="chip warn">${x.days !== null ? x.days + '일째' : K.lastVisit(s, x.p.id) ? '통화·방문 없음' : '연락 기록 없음'}</span>`)))}`;
    },
    bind(ctx) { bindRows(ctx); $$('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go)); },
  };

  // ── 교구 성도 (같은 교구 사역자와 공유)
  let peopleFilter = 'mine', peopleSearch = '';
  Pages.people = {
    label: '교구 성도',
    render(ctx) {
      const s = ctx.state, isVisitor = ctx.me.role === 'visitor';
      if (!isVisitor && peopleFilter === 'mine') peopleFilter = 'all';
      let list = K.carePeople(s);
      if (peopleFilter === 'mine') list = list.filter(p => isMine(ctx.me, p));
      if (peopleFilter === 'none') list = list.filter(p => !p.visitorId);
      if (peopleSearch) list = list.filter(p => [p.name, p.phone].some(v => String(v || '').includes(peopleSearch)));
      list.sort((a, b) => String(a.name).localeCompare(b.name, 'ko'));
      return `<div class="eyebrow">심방</div><h1 class="page-title">${esc(ctx.me.district)} 성도</h1>
      <p class="subtitle">같은 교구 심방사역자와 명단을 함께 봅니다. 누가 언제 연락했는지 보고 겹치지 않게 연락하세요.</p>
      <div class="filters"><input id="peopleSearch" placeholder="이름 · 전화번호 찾기" value="${esc(peopleSearch)}" aria-label="이름 또는 전화번호 찾기">
        <div class="seg" role="group" aria-label="보기">${(isVisitor ? [['mine', '내 담당'], ['all', '교구 전체'], ['none', '미배정']] : [['all', '교구 전체'], ['none', '미배정']]).map(([k, l]) => `<button type="button" data-f="${k}" class="${peopleFilter === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <section class="card">${list.length ? `<div class="list">${list.map(p => personRow(ctx, p)).join('')}</div>` : '<p class="muted">해당하는 분이 없습니다.</p>'}</section>`;
    },
    bind(ctx) {
      bindRows(ctx);
      $$('[data-f]').forEach(b => b.onclick = () => { peopleFilter = b.dataset.f; ctx.render(); });
      const q = $('#peopleSearch'); q.onchange = () => { peopleSearch = q.value.trim(); ctx.render(); };
    },
  };

  // ── 문자 보내기: 누구에게 → 어떤 문자 → 고치기·미리 보기 → 문자 앱 열기(한 명씩)
  let flow = { step: 1, ids: [], tpl: '', text: '', i: 0 };
  // 새가족위원·새가족팀은 새가족 명단과 새가족 예문을, 심방 쪽은 교구 성도와 심방 예문을 씁니다.
  const ministryOf = me => ['committee', 'newcomer_pastor', 'newcomer_admin'].includes(me.role) ? 'new' : 'visit';
  const msgPeople = ctx => ministryOf(ctx.me) === 'new' ? root.NewcomerCore.newcomers(ctx.state) : K.carePeople(ctx.state);
  Pages.message = {
    label: '문자',
    render(ctx) {
      const s = ctx.state, min = ministryOf(ctx.me), tpls = M.templatesFor(s, min), people = msgPeople(ctx).sort((a, b) => String(a.name).localeCompare(b.name, 'ko'));
      const chosen = flow.ids.map(id => s.people.find(p => p.id === id)).filter(Boolean);
      const steps = ['누구에게', '어떤 문자', '고치기 · 미리 보기', '보내기'];
      const head = `<div class="eyebrow">${min === 'new' ? '새가족' : '심방'}</div><h1 class="page-title">문자 보내기</h1>
        <ol class="flow steps">${steps.map((t, i) => `<li class="${i + 1 === flow.step ? 'now' : i + 1 < flow.step ? 'done' : ''}">${t}</li>`).join('')}</ol>`;
      if (flow.step === 1) {
        const quick = min === 'new' ? [['nc-active', '진행 중'], ['nc-waiting', '매칭 대기'], ['nc-fellowship', '새사귐 중']] : [['mine', '내 담당'], ['bday', '7일 안 생일'], ['due', '다시 연락할 분'], ['long', '오래 연락 못 한 분']];
        return head + `<section class="card"><h2>누구에게 보낼까요?</h2><div class="acts">${quick.map(([k, l]) => `<button type="button" data-quick="${k}">${l} 고르기</button>`).join('')}<button type="button" data-quick="clear" class="quiet">모두 해제</button></div>
          <div class="list" style="margin-top:12px">${people.map(p => `<label class="row pick"><input type="checkbox" name="to" value="${esc(p.id)}" ${flow.ids.includes(p.id) ? 'checked' : ''} ${p.phone ? '' : 'disabled'}><span class="grow"><b>${esc(p.name)}</b> <span class="muted small">${p.phone ? esc(p.phone) : '전화번호 없음'}</span></span></label>`).join('')}</div>
          <div class="acts sticky-acts"><button type="button" class="primary" id="toStep2">다음: 어떤 문자 (${flow.ids.length}명)</button></div></section>`;
      }
      if (flow.step === 2) return head + `<section class="card"><h2>${chosen.length}명에게 보낼 문자</h2><div class="tpl-grid">${tpls.map(t => `<button type="button" data-tpl="${t.key}" class="${flow.tpl === t.key ? 'active' : ''}"><b>${esc(t.label)}</b><span class="small muted">${esc(t.text.slice(0, 40))}…</span></button>`).join('')}</div>
        <div class="acts"><button type="button" class="quiet" data-step="1">← 받는 사람</button></div></section>`;
      if (flow.step === 3) {
        const sample = chosen[0];
        return head + `<section class="card"><h2>문구 고치기</h2><p class="muted small">{이름} 자리에 받는 분의 이름이 들어갑니다.</p>
          <textarea id="msgText" rows="6">${esc(flow.text)}</textarea>
          <h3>미리 보기 · ${esc(sample?.name || '')}님</h3><div class="sms-preview" id="msgPreview">${esc(M.fill(flow.text, sample))}</div>
          <div class="acts"><button type="button" class="quiet" data-step="2">← 예문</button><button type="button" class="primary" data-step="4">다음: 보내기</button></div></section>`;
      }
      const p = chosen[flow.i], last = flow.i >= chosen.length - 1, body = M.fill(flow.text, p), phone = M.isPhone();
      return head + `<section class="card"><div class="between"><h2>${flow.i + 1} / ${chosen.length} · ${esc(p?.name || '')}님</h2><span class="muted small">${esc(p?.phone || '')}</span></div>
        <div class="sms-preview">${esc(body)}</div>
        <div class="acts">${phone ? `<a class="button primary" id="openSms" href="${M.smsHref(p.phone, body)}">문자 앱 열기</a><button type="button" id="copyMsg">복사</button>` : `<button type="button" class="primary" id="copyMsg">문구 복사</button><a class="button" id="openSms" href="${M.smsHref(p.phone, body)}">문자 앱 열기</a>`}
          ${last ? '' : '<button type="button" id="nextPerson">다음 사람 →</button>'}</div>
        <p class="notice small">문자 앱을 열거나 복사한 것은 <b>보낸 기록이 아닙니다</b>. 실제로 연락이 되었다면 아래 "기록하기"로 남겨 주세요.${phone ? '' : ' 컴퓨터에서는 문자 앱이 열리지 않을 수 있어 복사가 먼저 나옵니다.'}</p>
        <div class="acts"><button type="button" class="quiet" data-step="3">← 문구</button><button type="button" data-rec="${esc(p?.id || '')}">기록하기</button>${last ? '<button type="button" id="msgDone">마치기</button>' : ''}</div></section>`;
    },
    bind(ctx) {
      const s = ctx.state;
      $$('input[name=to]').forEach(c => c.onchange = () => { flow.ids = $$('input[name=to]:checked').map(x => x.value); $('#toStep2').textContent = `다음: 어떤 문자 (${flow.ids.length}명)`; });
      $$('[data-quick]').forEach(b => b.onclick = () => {
        const k = b.dataset.quick, has = p => p.phone, N = root.NewcomerCore;
        const pick = k.startsWith('nc-') ? N.newcomers(s).filter(p => { const bk = N.bucket(s, p); return k === 'nc-active' ? !['settled', 'paused'].includes(bk) : bk === k.slice(3); })
          : k === 'mine' ? K.carePeople(s).filter(p => isMine(ctx.me, p)) : k === 'bday' ? K.carePeople(s).filter(p => { const d = C.birthdayDistance(p, today()); return d !== null && d >= 0 && d <= 7; })
          : k === 'due' ? K.dueRecontacts(s).map(x => x.p) : k === 'long' ? K.longNoContact(s).map(x => x.p) : [];
        flow.ids = k === 'clear' ? [] : [...new Set([...flow.ids, ...pick.filter(has).map(p => p.id)])]; ctx.render();
      });
      const t2 = $('#toStep2'); if (t2) t2.onclick = () => { if (!flow.ids.length) return toast('받는 분을 골라 주세요.'); flow.step = 2; ctx.render(); };
      $$('[data-tpl]').forEach(b => b.onclick = () => { const t = M.templatesFor(s, ministryOf(ctx.me)).find(x => x.key === b.dataset.tpl); flow.tpl = t.key; flow.text = t.text; flow.step = 3; ctx.render(); });
      $$('[data-step]').forEach(b => b.onclick = () => { const n = Number(b.dataset.step); if (n === 4 && !flow.text.trim()) return toast('문구를 입력해 주세요.'); flow.step = n; flow.i = 0; ctx.render(); });
      const ta = $('#msgText'); if (ta) ta.oninput = () => { flow.text = ta.value; $('#msgPreview').textContent = M.fill(flow.text, s.people.find(p => p.id === flow.ids[0])); };
      const cp = $('#copyMsg'); if (cp) cp.onclick = e => copyText(M.fill(flow.text, s.people.find(p => p.id === flow.ids[flow.i])), e.target);
      const nx = $('#nextPerson'); if (nx) nx.onclick = () => { flow.i++; ctx.render(); };
      const dn = $('#msgDone'); if (dn) dn.onclick = () => { flow = { step: 1, ids: [], tpl: '', text: '', i: 0 }; toast('문자 보내기를 마쳤습니다. 보낸 기록은 따로 남지 않습니다.'); ctx.render(); };
      $$('[data-rec]').forEach(b => b.onclick = () => b.dataset.rec && visitForm(ctx, b.dataset.rec));
      if (flow.step === 2 && !flow.ids.length) { flow.step = 1; ctx.render(); }
    },
  };

  // ── 보고서 문서(사역자 미리 보기·승인, 교구 목사 열람에 같이 씀)
  function reportDoc(r, draft) {
    const s = r.summary;
    return `<article class="report-doc"><header><div class="eyebrow">${draft ? '초안 · 아직 승인 전' : r.revision > 1 ? `수정본 ${r.revision}` : '승인함'}</div>
      <h2>심방 주간 보고</h2><p class="muted small">${esc(r.district)} · ${esc(r.authorName || '')} · ${esc(r.period)}${r.approvedAt ? ' · 승인 ' + esc(new Date(r.approvedAt).toLocaleString('ko-KR')) : ''}</p></header>
      <div class="stats"><div class="stat"><b>${s.people}</b>연락한 성도</div><div class="stat"><b>${s.attempts}</b>연락 시도</div><div class="stat"><b>${s.connected}</b>통화·방문</div><div class="stat"><b>${s.absent}</b>부재</div><div class="stat"><b>${s.followups}</b>다시 연락</div></div>
      ${r.rows.length ? `<div class="table-wrap"><table><thead><tr><th>날짜</th><th>성도</th><th>결과</th><th>내용</th><th>다음 연락</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.name)}</td><td>${esc(x.result)}</td><td>${esc(x.memo)}</td><td>${esc(x.nextDate)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">이 기간에 기록한 연락이 없습니다.</p>'}
      ${r.prayers.length ? `<h3>기도제목</h3><ul>${r.prayers.map(x => `<li><b>${esc(x.name)}</b> · ${esc(x.text)}</li>`).join('')}</ul>` : ''}
      ${r.note ? `<h3>덧붙이는 말</h3><p>${esc(r.note)}</p>` : ''}</article>`;
  }

  // 사역자: 주일 10시에 초안 → 확인 → 승인. 승인하면 그 순간 내용으로 고정됩니다.
  let reportPick = 0;
  Pages.report = {
    label: '주간 보고',
    render(ctx) {
      const s = ctx.state, weeks = [0, 1, 2, 3].map(n => K.reportWindow(n));
      const w = K.reportWindow(reportPick), done = K.latestReport(s, 'visit', ctx.me.userId, w.key), draft = K.visitDraft(s, ctx.me, w);
      const now = K.visitDraft(s, ctx.me, K.reportWindow(-1));
      return `<div class="eyebrow">심방</div><h1 class="page-title">주간 보고</h1>
      <ol class="flow"><li>주일 10시 초안 완성</li><li>내용 확인</li><li>승인</li><li>교구 목사님께 전달</li></ol>
      <div class="seg" role="group" aria-label="주간 선택">${weeks.map((x, i) => { const r = K.latestReport(s, 'visit', ctx.me.userId, x.key); return `<button type="button" data-week="${i}" class="${i === reportPick ? 'active' : ''}">${esc(x.key.slice(5))} 주일 ${r ? '✓' : ''}</button>`; }).join('')}</div>
      <section class="card">${done ? reportDoc(done) + `<div class="acts"><button type="button" id="revise">수정본 만들기</button></div>`
        : reportDoc(draft, true) + `<label>덧붙이는 말 (선택)<textarea id="reportNote" rows="2" maxlength="500"></textarea></label>
          <div class="acts"><button type="button" class="primary" id="approve">확인했습니다 · 승인</button></div>
          <p class="muted small">승인하면 고칠 수 없고, 고칠 때는 수정본을 새로 승인합니다. 승인 전 초안은 교구 목사님께 보이지 않습니다.</p>`}</section>
      <section class="card"><h2>이번 주 지금까지</h2><p class="muted small">${esc(K.reportWindow(-1).label)} 동안 기록한 연락 ${now.rows.length}건 · 다음 주일 10시에 초안이 됩니다.</p></section>`;
    },
    bind(ctx) {
      $$('[data-week]').forEach(b => b.onclick = () => { reportPick = Number(b.dataset.week); ctx.render(); });
      const w = K.reportWindow(reportPick);
      const a = $('#approve'); if (a) a.onclick = async () => {
        const draft = K.visitDraft(ctx.state, ctx.me, w), note = $('#reportNote').value;
        if (!await ask('보고서 승인', `${w.label} 보고서를 승인합니다. 승인 뒤에는 교구 목사님이 보실 수 있고, 고칠 때는 수정본을 냅니다.`, '승인')) return;
        const r = K.makeReport(draft, note, null);
        ctx.commit(s => { s.reports.push(r); }, '보고서를 승인했습니다.');
      };
      const rv = $('#revise'); if (rv) rv.onclick = async () => {
        const prev = K.latestReport(ctx.state, 'visit', ctx.me.userId, w.key), draft = K.visitDraft(ctx.state, ctx.me, w);
        const body = dialog('수정본 만들기', `<p class="small">지금 기록을 다시 모아 수정본을 만듭니다. 이전 보고서는 그대로 남고, 교구 목사님께는 "수정본"으로 표시됩니다.</p>${reportDoc({ ...draft, note: prev.note }, true)}
          <label>덧붙이는 말<textarea id="revNote" rows="2" maxlength="500">${esc(prev.note || '')}</textarea></label><div class="acts"><button type="button" class="quiet" id="revCancel">취소</button><button type="button" class="primary" id="revOk">수정본 승인</button></div>`);
        $('#revCancel', body).onclick = closeDialog;
        $('#revOk', body).onclick = () => { const r = K.makeReport(draft, $('#revNote', body).value, prev); closeDialog(); ctx.commit(s => { s.reports.push(r); }, '수정본을 승인했습니다.'); };
      };
    },
  };

  // 교구 목사: 사역자별 승인 여부와 보고서 보기(승인 전 초안은 서버가 보내지 않음)
  let pastorWeek = 0, openReport = '';
  Pages.reports = {
    label: '보고 받기',
    render(ctx) {
      const s = ctx.state, w = K.reportWindow(pastorWeek), weeks = [0, 1, 2, 3, 4, 5, 6, 7].map(n => K.reportWindow(n));
      const visitors = (ctx.cache.staff || []).filter(x => x.role === 'visitor' && x.district === ctx.me.district);
      if (openReport) {
        const r = s.reports.find(x => x.id === openReport);
        const doc = r?.type === 'newcomer' ? root.HamkkeNewcomer.reportDoc(r) : r ? reportDoc(r) : '';
        if (r) return `<div class="acts no-print"><button type="button" id="backReports">← 보고 목록</button><button type="button" id="printReport">인쇄 · PDF로 저장</button></div><section class="card">${doc}</section>`;
        openReport = '';
      }
      // 사역자(심방)·위원(새가족)별로 이 주의 가장 나중 보고(수정본 포함)
      const section = (type, role, title, empty, line) => {
        const staff = (ctx.cache.staff || []).filter(x => x.role === role && x.district === ctx.me.district);
        const latest = new Map();
        for (const r of s.reports.filter(r => r.type === type && r.weekKey === w.key)) { const old = latest.get(r.authorId); if (!old || String(r.approvedAt) > String(old.approvedAt)) latest.set(r.authorId, r); }
        const rows = [...staff.map(v => ({ name: v.display_name, r: latest.get(v.user_id) })), ...[...latest.values()].filter(r => !staff.some(v => v.user_id === r.authorId)).map(r => ({ name: r.authorName, r }))];
        return `<section class="card"><h2>${title}</h2><div class="list">${rows.length ? rows.map(({ name, r }) => `<div class="row"><div class="grow"><b>${esc(name)}</b> ${r ? `<span class="chip ok">승인${r.revision > 1 ? ' · 수정본' : ''}</span>` : '<span class="chip warn">대기</span>'}
          ${r ? `<div class="muted small">${line(r.summary)}</div>` : ''}</div>${r ? `<button type="button" data-ropen="${esc(r.id)}">보고서 보기</button>` : ''}</div>`).join('') : `<p class="muted">${empty}</p>`}</div></section>`;
      };
      return `<div class="eyebrow">교구</div><h1 class="page-title">보고 받기</h1>
      <p class="subtitle">${esc(ctx.me.district)}의 주간 보고입니다. 사역자·위원이 승인한 보고만 보입니다.</p>
      <label class="inline">주간<select id="pastorWeek">${weeks.map((x, i) => `<option value="${i}" ${i === pastorWeek ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      ${section('visit', 'visitor', '심방 보고', '이 교구에 등록된 심방사역자가 없습니다.', x => `연락 ${x.attempts}회 · 성도 ${x.people}명 · 통화·방문 ${x.connected}회`)}
      ${section('newcomer', 'committee', '새가족 보고 (파송 새가족위원)', '이 교구에서 파송한 새가족위원이 없습니다.', x => `진행 ${x.active}명 · 이번 주 진행 ${x.moved}명 · 늦어짐 ${x.late}`)}`;
    },
    async bind(ctx) {
      const sel = $('#pastorWeek'); if (sel) sel.onchange = () => { pastorWeek = Number(sel.value); ctx.render(); };
      $$('[data-ropen]').forEach(b => b.onclick = () => { openReport = b.dataset.ropen; ctx.render(); });
      const back = $('#backReports'); if (back) back.onclick = () => { openReport = ''; ctx.render(); };
      const pr = $('#printReport'); if (pr) pr.onclick = () => root.print();
      if (!ctx.cache.staff) { try { ctx.cache.staff = await store.staffList(); } catch (e) { ctx.cache.staff = []; } ctx.render(); }
    },
  };

  function startMessage(ctx, ids) { flow = { step: 2, ids, tpl: '', text: '', i: 0 }; ctx.go('message'); }
  root.HamkkeVisit = { visitForm, reportDoc, startMessage, resetFlow: () => { flow = { step: 1, ids: [], tpl: '', text: '', i: 0 }; } };
})(window);
