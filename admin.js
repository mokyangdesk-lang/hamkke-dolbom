/* 함께 돌봄 5.0 — 관리 화면: 담당자, 교구 설정, 명단 올리기, 양육도우미 매칭, 심방 배정.
   어떤 계정이 무엇을 할 수 있는지는 서버가 다시 판정합니다. */
(function (root) {
  'use strict';
  const { $, $$, esc, ROLE, toast, dialog, closeDialog, ask, copyText } = root.UI;
  const store = root.HamkkeStore, C = root.MinistryCore;
  const Pages = root.HamkkePages = root.HamkkePages || {};
  const ISSUABLE = ['visitor', 'committee', 'district_pastor', 'newcomer_admin', 'newcomer_pastor'];
  const NEEDS_DISTRICT = ['visitor', 'committee', 'district_pastor'];
  const ACTION = { create: '등록', reissue: '코드 다시 발급', suspend: '접근 중지', resume: '다시 허용', update: '교구·역할 변경', login: '로그인' };
  const date = v => String(v || '').slice(0, 10);
  const uid = () => (root.crypto?.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  async function loadStaff(ctx, force) {
    if (!force && ctx.cache.staff) return ctx.cache.staff;
    try { ctx.cache.staff = await store.staffList(); } catch (e) { ctx.cache.staff = []; toast('담당자 목록을 불러오지 못했습니다: ' + e.message); }
    return ctx.cache.staff;
  }
  const districtOptions = (ctx, role, selected) => {
    const g = C.groups(ctx.state).filter(x => role !== 'visitor' || x.visitors);
    return g.map(x => `<option ${x.name === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  };

  // 접속 코드는 이 창에서 한 번만 보여 줍니다. 닫으면 화면에서도 지워집니다.
  // 코드 안내 문자: 역할에 맞는 주소 + 이름 + 코드. 문자 앱으로 넘겨줄 뿐, 코드는 어디에도 저장하지 않습니다.
  function codeMessage(name, role, code) {
    const base = root.location.origin + root.location.pathname.replace(/[^/]*$/, '');
    const q = role === 'visitor' ? '?for=visit' : role === 'committee' ? '?for=new' : '';
    return `[함께 돌봄] ${name}님 접속 안내\n주소: ${base}${q}\n이름: ${name}\n코드: ${code}\n코드는 본인만 보관해 주세요. 사용 안내: ${base}guide/`;
  }
  // 주소만 다시 보내는 안내(코드 없음). 담당자 목록의 "문자" 버튼에서 씁니다.
  function linkMessage(name, role) {
    const base = root.location.origin + root.location.pathname.replace(/[^/]*$/, '');
    const q = role === 'visitor' ? '?for=visit' : role === 'committee' ? '?for=new' : '';
    return `[함께 돌봄] ${name}님, 접속 주소를 다시 보내 드립니다.\n주소: ${base}${q}\n사용 안내(홈 화면 추가 방법): ${base}guide/\n로그인은 이름과 받으신 코드로 하시면 됩니다. 코드를 잊으셨으면 말씀해 주세요.`;
  }
  function showCode(title, name, code, role, phone) {
    const M = root.Messages, msg = codeMessage(name, role, code);
    const body = dialog(title, `<p><b>${esc(name)}</b>님의 접속 코드입니다. <b>이 창을 닫으면 다시 볼 수 없습니다.</b></p>
      <div class="code-box"><span class="code">${esc(code)}</span><button type="button" id="copyCode">복사</button></div>
      <div class="acts">${phone ? `<a class="button primary" id="smsCode" href="${esc(M.smsHref(phone, msg))}">문자로 보내기 · ${esc(phone)}</a>` : '<span class="muted small">휴대전화를 넣어 두면 여기서 바로 문자로 보낼 수 있습니다.</span>'}<button type="button" id="copyMsg">안내 문구 복사</button></div>
      <p class="notice">코드는 본인에게만 전해 주세요(단톡방에 올리지 마세요). 문자 앱이 열려도 실제로 보냈는지는 문자 앱에서 확인해 주세요. 잃어버리면 새로 발급하며, 그때 이 코드는 쓸 수 없게 됩니다.</p>
      <div class="acts"><button type="button" class="primary" id="codeDone">전달했습니다 · 닫기</button></div>`);
    $('#copyCode', body).onclick = e => copyText(code, e.target);
    $('#copyMsg', body).onclick = e => copyText(msg, e.target);
    $('#codeDone', body).onclick = closeDialog;
  }

  // ── 1. 담당자 관리 (전체 관리자)
  Pages.staff = {
    label: '담당자',
    render(ctx) {
      const g = C.groups(ctx.state);
      return `<div class="eyebrow">관리</div><h1 class="page-title">담당자 관리</h1>
      <ol class="flow"><li>이름</li><li>역할</li><li>교구</li><li>코드 발급</li><li>본인에게 전달</li></ol>
      ${g.length ? '' : '<p class="notice">먼저 <button type="button" class="link" data-go="groups">교구 설정</button>을 저장해 주세요. 교구 이름이 정해져야 담당자를 등록할 수 있습니다.</p>'}
      <section class="card"><h2>새 담당자 등록</h2>
        <form id="staffCreate" class="form-grid" novalidate>
          <label>이름<input name="name" id="createName" maxlength="40" autocomplete="off" placeholder="예: 홍길동"></label>
          <label>휴대전화 <span class="muted small">(코드 문자용, 선택)</span><input name="phone" inputmode="tel" autocomplete="off" maxlength="20" placeholder="010-0000-0000"></label>
          <label>역할<select name="role" id="createRole">${ISSUABLE.map(r => `<option value="${r}">${ROLE[r]}</option>`).join('')}</select></label>
          <label id="createDistrictWrap">교구<select name="district" id="createDistrict">${districtOptions(ctx, 'visitor')}</select></label>
          <p id="createDistrictNote" class="muted small" hidden>새가족팀은 교구 없이 모든 교구의 새가족을 봅니다.</p>
          <div class="acts"><button class="primary" ${g.length ? '' : 'disabled'}>등록하고 코드 발급</button></div>
        </form></section>
      <section class="card"><div class="between"><h2>등록된 담당자</h2>
        <label class="inline">보기<select id="staffFilter"><option value="">전체</option><option value="new">새가족팀</option>${g.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></label></div>
        <div id="staffList" class="list">불러오는 중…</div></section>
      <section class="card"><h2>최근 변경 이력</h2><div id="staffLog" class="muted small">불러오는 중…</div></section>`;
    },
    async bind(ctx) {
      $$('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
      const role = $('#createRole'), dsel = $('#createDistrict');
      const syncRole = () => { const need = NEEDS_DISTRICT.includes(role.value); $('#createDistrictWrap').hidden = !need; $('#createDistrictNote').hidden = need; dsel.innerHTML = districtOptions(ctx, role.value); };
      role.onchange = syncRole; syncRole();
      $('#staffCreate').onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        f.name = String(f.name || '').trim();
        if (!f.name) { toast('이름을 입력해 주세요. 담당자 본인이 로그인할 때 쓰는 이름입니다.'); $('#createName').focus(); return; }
        if (NEEDS_DISTRICT.includes(f.role) && !f.district) { toast('교구를 골라 주세요. 교구가 없으면 먼저 "교구 설정"을 저장해 주세요.'); return; }
        if (!NEEDS_DISTRICT.includes(f.role)) f.district = '';
        const btn = $('button.primary', e.target); btn.disabled = true;
        try { const r = await store.staff({ action: 'create', name: f.name, role: f.role, district: f.district, phone: f.phone || '' }); e.target.reset(); syncRole(); await loadStaff(ctx, true); list(); showCode('코드 발급', f.name, r.code, f.role, f.phone); }
        catch (err) { toast(err.message); } finally { btn.disabled = false; }
      };
      const list = () => {
        const filter = $('#staffFilter').value, rows = (ctx.cache.staff || []).filter(r => !filter || (filter === 'new' ? !r.district : r.district === filter));
        $('#staffList').innerHTML = rows.length ? rows.map(r => `<div class="row"><div class="grow"><b>${esc(r.display_name)}</b> <span class="chip ${r.status === 'active' ? 'ok' : 'warn'}">${r.status === 'active' ? '사용 중' : '접근 중지'}</span>
          <div class="muted small">${esc(ROLE[r.role] || r.role)} · ${esc(r.district || '모든 교구 새가족')} · 코드 발급 ${esc(date(r.code_issued_at))}${r.phone ? ' · ' + esc(r.phone) : ''}</div></div>
          <div class="acts">${r.phone ? `<a class="button" href="${esc(root.Messages.smsHref(r.phone, linkMessage(r.display_name, r.role)))}" title="주소 안내 문자(코드 없음)">주소 문자</a>` : ''}<button data-st="edit" data-id="${r.user_id}">교구·역할·전화</button><button data-st="reissue" data-id="${r.user_id}">코드 다시 발급</button>
          <button data-st="${r.status === 'active' ? 'suspend' : 'resume'}" data-id="${r.user_id}" class="${r.status === 'active' ? 'danger' : ''}">${r.status === 'active' ? '접근 중지' : '다시 허용'}</button></div></div>`).join('')
          : '<p class="muted">아직 등록된 담당자가 없습니다.</p>';
        $$('[data-st]').forEach(b => b.onclick = () => act(b.dataset.st, rows.find(x => x.user_id === b.dataset.id)));
      };
      const act = async (a, r) => {
        try {
          if (a === 'edit') return editDialog(ctx, r, async () => { await loadStaff(ctx, true); list(); });
          if (a === 'reissue') {
            if (!await ask('코드 다시 발급', `${r.display_name}님의 지금 코드는 바로 쓸 수 없게 되고, 로그인해 있는 기기도 끊깁니다. 새 코드를 발급할까요?`, '새로 발급')) return;
            const x = await store.staff({ action: 'reissue', userId: r.user_id }); showCode('코드 다시 발급', r.display_name, x.code, r.role, r.phone);
          } else if (a === 'suspend') {
            if (!await ask('접근 중지', `${r.display_name}님은 지금부터 어떤 기기에서도 자료를 볼 수 없습니다. 기록은 지워지지 않습니다.`, '접근 중지', true)) return;
            await store.staff({ action: 'suspend', userId: r.user_id }); toast('접근을 중지했습니다.');
          } else { await store.staff({ action: 'resume', userId: r.user_id }); toast('다시 허용했습니다. 기존 코드로 로그인할 수 있습니다.'); }
          await loadStaff(ctx, true); list(); log();
        } catch (err) { toast(err.message); }
      };
      const log = async () => {
        try {
          const rows = await store.auditLog(), name = id => (ctx.cache.staff || []).find(s => s.user_id === id)?.display_name || '';
          $('#staffLog').innerHTML = rows.length ? rows.map(l => `<p>${esc(new Date(l.at).toLocaleString('ko-KR'))} · ${esc(ACTION[l.action] || l.action)} · ${esc(name(l.target))}</p>`).join('') : '이력이 없습니다.';
        } catch (e) { $('#staffLog').textContent = '이력을 불러오지 못했습니다.'; }
      };
      $('#staffFilter').onchange = list;
      await loadStaff(ctx); list(); log();
    },
  };

  function editDialog(ctx, r, done) {
    const body = dialog(r.display_name + ' · 교구·역할 바꾸기', `<form id="editForm" class="stack">
      <label>역할<select name="role" id="editRole">${ISSUABLE.map(x => `<option value="${x}" ${x === r.role ? 'selected' : ''}>${ROLE[x]}</option>`).join('')}</select></label>
      <label id="editDistrictWrap">교구<select name="district" id="editDistrict"></select></label>
      <p id="editNote" class="muted small" hidden>새가족팀은 교구 없이 모든 교구의 새가족을 봅니다.</p>
      <label>휴대전화 <span class="muted small">(코드 문자용)</span><input name="phone" id="editPhone" inputmode="tel" maxlength="20" value="${esc(r.phone || '')}" placeholder="010-0000-0000"></label>
      <p class="notice small">바꾸면 바로 다음 화면부터 새 범위의 자료만 보입니다. 코드는 그대로입니다.</p>
      <div class="acts"><button type="button" class="quiet" id="editCancel">취소</button><button class="primary">바꾸기</button></div></form>`);
    const role = $('#editRole', body), sync = () => { const need = NEEDS_DISTRICT.includes(role.value); $('#editDistrictWrap', body).hidden = !need; $('#editNote', body).hidden = need; $('#editDistrict', body).innerHTML = districtOptions(ctx, role.value, r.district); };
    role.onchange = sync; sync();
    $('#editCancel', body).onclick = closeDialog;
    $('#editForm', body).onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try { await store.staff({ action: 'update', userId: r.user_id, role: f.role, district: NEEDS_DISTRICT.includes(f.role) ? f.district : '', phone: f.phone || '' }); closeDialog(); toast('바꾸었습니다.'); await done(); }
      catch (err) { toast(err.message); }
    };
  }

  // ── 2. 교구 설정 (전체 관리자)
  Pages.groups = {
    label: '교구 설정',
    render(ctx) {
      const g = C.groups(ctx.state);
      const used = name => ctx.state.people.some(p => p.district === name) || (ctx.cache.staff || []).some(s => s.district === name);
      return `<div class="eyebrow">관리</div><h1 class="page-title">교구 설정</h1>
      <p class="subtitle">명단·담당자·권한이 모두 이 교구 이름을 씁니다. 엑셀의 교구 칸도 이 이름과 똑같아야 합니다.</p>
      <section class="card"><form id="groupsForm">
        ${g.length ? `<div class="list">${g.map((x, i) => `<div class="row"><div class="grow"><b>${esc(x.name)}</b></div>
          <label class="inline check"><input type="checkbox" name="v${i}" ${x.visitors ? 'checked' : ''}> 심방사역자 있음</label>
          <button type="button" data-del="${i}" ${used(x.name) ? 'disabled title="이 교구에 성도나 담당자가 있어 지울 수 없습니다"' : ''}>지우기</button></div>`).join('')}</div>`
          : `<p>아직 교구가 없습니다.</p><button type="button" id="defaults" class="primary">기본 9개 교구 넣기 (1~8교구, 청장년교구)</button>`}
        <div class="acts" style="margin-top:16px"><input id="newGroup" placeholder="새 교구 이름 (예: 9교구)" style="max-width:260px"><button type="button" id="addGroup">추가</button></div>
        <div class="acts"><button class="primary" ${g.length ? '' : 'disabled'}>저장</button></div>
      </form><p class="muted small">이름을 바꾸는 기능은 없습니다. 이름이 바뀌면 그 교구의 권한이 끊기기 때문입니다. 새로 추가한 뒤 성도와 담당자를 옮기고, 비게 되면 지워 주세요.</p></section>`;
    },
    async bind(ctx) {
      let draft = C.groups(ctx.state);
      const save = list => ctx.commit(s => {
        const rec = s.settings.find(x => x.id === 'groups');
        if (rec) rec.districts = list; else s.settings.push({ id: 'groups', districts: list });
      }, '교구 설정을 저장했습니다.');
      const d = $('#defaults'); if (d) d.onclick = () => save(C.DEFAULT_GROUPS.map(x => ({ ...x })));
      $('#addGroup').onclick = () => {
        const name = $('#newGroup').value.trim();
        if (!name) return toast('교구 이름을 입력해 주세요.');
        if (draft.some(x => x.name === name)) return toast('이미 있는 이름입니다.');
        save([...draft, { name, visitors: true }]);
      };
      $$('[data-del]').forEach(b => b.onclick = async () => { const x = draft[Number(b.dataset.del)]; if (await ask('교구 지우기', `'${x.name}'를 목록에서 지울까요?`, '지우기', true)) save(draft.filter(y => y !== x)); });
      $('#groupsForm').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); save(draft.map((x, i) => ({ name: x.name, visitors: f.get('v' + i) === 'on' }))); };
      if (!ctx.cache.staff && ctx.me.role === 'admin') { await loadStaff(ctx); ctx.render(); }
    },
  };

  // ── 3. 명단 올리기 (전체 관리자: 성도·새가족·양육도우미 / 새가족 관리자: 새가족·양육도우미)
  let preview = null;
  const allowSheets = role => role === 'admin' ? ['성도명단', '새가족명단', '양육도우미명단'] : ['새가족명단', '양육도우미명단'];
  const HEADERS = { 성도명단: Object.keys(C.SHEETS.성도명단.map), 새가족명단: Object.keys(C.SHEETS.새가족명단.map).filter(x => x !== '섬김이ID'), 양육도우미명단: Object.keys(C.SHEETS.양육도우미명단.map).filter(x => x !== '섬김이ID') };
  function downloadTemplate(role) {
    const X = root.XLSX, book = X.utils.book_new();
    for (const s of allowSheets(role)) X.utils.book_append_sheet(book, X.utils.aoa_to_sheet([HEADERS[s]]), s);
    X.utils.book_append_sheet(book, X.utils.aoa_to_sheet([['항목', '안내'],
      ['시트', '시트 이름과 첫 줄(열 이름)을 바꾸지 마세요.'], ['ID', '사람마다 고유한 ID를 정하고, 다시 올릴 때도 같은 ID를 쓰세요. 같은 ID는 수정, 새 ID는 신규입니다.'],
      ['빈칸', '빈칸은 기존 값을 지우지 않습니다.'], ['교구', "앱의 '교구 설정'에 있는 이름과 똑같이 쓰세요. 예: 1교구"],
      ['날짜', 'YYYY-MM-DD 형식. 예: 2026-11-15'], ['생일기준', '양력 또는 음력. 음력이면 올해생일 칸에 올해 양력 날짜를 쓰세요.'],
      ['양육도우미', '양육교육이수: 이수/미이수, 활동상태: 활동중/활동중지, 배정가능인원: 0 이상 숫자'],
      ['같은 분 확인', '이름이나 전화번호가 같은 기록이 있으면 경고가 뜹니다. 자동으로 합치지 않습니다.']]), '작성안내');
    X.writeFile(book, '함께돌봄-명단양식.xlsx');
  }
  Pages.imports = {
    label: '명단 올리기',
    render(ctx) {
      const sheets = allowSheets(ctx.me.role), p = preview;
      const created = p ? p.items.filter(x => !x.existing).length : 0, updated = p ? p.items.length - created : 0;
      return `<div class="eyebrow">관리</div><h1 class="page-title">명단 올리기</h1>
      <ol class="flow"><li>양식 받기</li><li>엑셀 채우기</li><li>파일 고르기</li><li>미리 보기 확인</li><li>적용</li></ol>
      <section class="card"><p>읽는 시트: <b>${sheets.join(' · ')}</b>. 같은 ID는 수정하고, 빈칸은 기존 값을 지우지 않습니다.</p>
        ${C.groups(ctx.state).length ? '' : '<p class="notice">교구 설정이 아직 없어 교구 이름을 검사하지 못합니다. 먼저 교구 설정을 저장하는 것을 권합니다.</p>'}
        <div class="acts"><button type="button" id="tpl">빈 양식 받기</button><label class="button">엑셀 파일 고르기<input id="importFile" type="file" accept=".xlsx,.xls" class="visually-hidden"></label></div></section>
      ${p ? `<section class="card"><h2>미리 보기</h2>
        <div class="stats"><div class="stat"><b>${created}</b>신규</div><div class="stat"><b>${updated}</b>수정</div><div class="stat ${p.errors.length ? 'bad' : ''}"><b>${p.errors.length}</b>오류</div><div class="stat ${p.warnings.length ? 'warn' : ''}"><b>${p.warnings.length}</b>확인 필요</div></div>
        ${p.errors.length ? `<h3>고쳐야 할 것</h3><ul class="error-list">${p.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><p class="muted small">엑셀을 고친 뒤 다시 골라 주세요.</p>` : ''}
        ${p.warnings.length ? `<h3>같은 분일 수 있는 기록</h3><ul class="warn-list">${p.warnings.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
          <label class="check"><input type="checkbox" id="warnOk"> 확인했습니다. 다른 분이 맞습니다(같은 분이면 엑셀의 ID를 고쳐 다시 올리세요).</label>` : ''}
        <div class="table-wrap"><table><thead><tr><th>시트</th><th>ID</th><th>이름</th><th>교구</th><th>구분</th></tr></thead><tbody>
        ${p.items.slice(0, 200).map(x => `<tr><td>${esc(x.sheet)}</td><td>${esc(x.item.id)}</td><td>${esc(x.item.name || '')}</td><td>${esc(x.item.district || '')}</td><td>${x.existing ? '수정' : '신규'}</td></tr>`).join('')}</tbody></table></div>
        ${p.items.length > 200 ? `<p class="muted small">처음 200줄만 보입니다(전체 ${p.items.length}줄).</p>` : ''}
        <div class="acts"><button type="button" id="cancelImport" class="quiet">취소</button><button type="button" id="applyImport" class="primary" ${p.errors.length || !p.items.length || p.warnings.length ? 'disabled' : ''}>확인한 명단 적용</button></div></section>` : ''}`;
    },
    bind(ctx) {
      $('#tpl').onclick = () => { try { downloadTemplate(ctx.me.role); } catch (e) { toast('양식을 만들지 못했습니다: ' + e.message); } };
      $('#importFile').onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024) throw Error('10MB 이하 파일을 골라 주세요.');
          const book = root.XLSX.read(await file.arrayBuffer(), { type: 'array' }), sheets = {};
          for (const name of book.SheetNames) sheets[name] = root.XLSX.utils.sheet_to_json(book.Sheets[name], { defval: '', raw: false });
          if (!Object.keys(sheets).some(n => C.SHEETS[n] || n === '섬김이명단')) throw Error('성도명단·새가족명단·양육도우미명단 시트가 없습니다. 빈 양식을 받아 써 주세요.');
          preview = C.previewImport(ctx.state, sheets, { allow: allowSheets(ctx.me.role) });
          ctx.render();
        } catch (err) { toast(err.message); }
      };
      const ok = $('#warnOk'); if (ok) ok.onchange = () => { $('#applyImport').disabled = !ok.checked || !!preview.errors.length; };
      const c = $('#cancelImport'); if (c) c.onclick = () => { preview = null; ctx.render(); };
      const a = $('#applyImport'); if (a) a.onclick = async () => { const p = preview; if (await ctx.commit(s => C.applyImport(s, p), `${p.items.length}건을 적용했습니다.`)) { preview = null; ctx.render(); } };
    },
  };

  // ── 4. 양육도우미 매칭 (새가족 관리자, 전체 관리자)
  let pick = '';
  Pages.matching = {
    label: '양육도우미 매칭',
    render(ctx) {
      const s = ctx.state, waiting = C.waitingForMatch(s), p = waiting.find(x => x.id === pick);
      const cands = p ? C.mentorCandidates(s, p) : [];
      const matched = s.people.filter(x => x.newcomer && x.mentorId);
      const mentorName = id => s.mentors.find(m => m.id === id)?.name || id;
      return `<div class="eyebrow">새가족</div><h1 class="page-title">양육도우미 매칭</h1>
      <ol class="flow"><li>4과목 마친 새가족 고르기</li><li>같은 교구 도우미 고르기</li><li>매칭</li></ol>
      <div class="two">
        <section class="card"><h2>매칭을 기다리는 분 <span class="chip">${waiting.length}</span></h2>
          ${waiting.length ? `<div class="list">${waiting.map(x => `<label class="row pick ${x.id === pick ? 'on' : ''}"><input type="radio" name="wait" value="${esc(x.id)}" ${x.id === pick ? 'checked' : ''}><span class="grow"><b>${esc(x.name)}</b><span class="muted small"> · ${esc(x.district)} · 등록 ${esc(x.registeredAt || '-')}</span></span></label>`).join('')}</div>`
            : '<p class="muted">지금 기다리는 분이 없습니다. 4과목을 모두 마친 분이 여기에 나타납니다.</p>'}</section>
        <section class="card"><h2>${p ? esc(p.name) + '님의 양육도우미' : '양육도우미'}</h2>
          ${!p ? '<p class="muted">왼쪽에서 새가족을 고르세요.</p>' : cands.length ? `<div class="list">${cands.map(m => `<label class="row pick"><input type="radio" name="mentor" value="${esc(m.id)}"><span class="grow"><b>${esc(m.name)}</b><span class="muted small"> · ${esc(m.district)} · 맡은 분 ${C.mentorLoad(s, m)}/${Number(m.capacity || 0)}</span></span></label>`).join('')}</div>
            <div class="acts"><button type="button" id="doMatch" class="primary">매칭하기</button></div>`
            : `<p class="notice">${esc(p.district)}에 남은 자리가 있는, 교육을 마친 활동 중 도우미가 없습니다. 양육도우미명단을 올리거나 배정가능인원을 늘려 주세요.</p>`}</section>
      </div>
      <section class="card"><h2>양육도우미 현황</h2><div class="table-wrap"><table><thead><tr><th>이름</th><th>교구</th><th>교육</th><th>활동</th><th>맡은 분</th></tr></thead><tbody>
        ${s.mentors.length ? s.mentors.slice().sort((a, b) => String(a.district).localeCompare(b.district, 'ko') || String(a.name).localeCompare(b.name, 'ko')).map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.district)}</td><td>${m.trained ? '이수' : '미이수'}</td><td>${m.active ? '활동중' : '중지'}</td><td>${C.mentorLoad(s, m)} / ${Number(m.capacity || 0)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">양육도우미명단을 먼저 올려 주세요.</td></tr>'}</tbody></table></div></section>
      <section class="card"><h2>매칭된 분</h2>${matched.length ? `<div class="list">${matched.map(x => `<div class="row"><span class="grow"><b>${esc(x.name)}</b><span class="muted small"> · ${esc(x.district)} · ${esc(mentorName(x.mentorId))} · 새사귐 ${C.completed(s, x.id, 'fellowship').size}/8주</span></span><button data-unmatch="${esc(x.id)}">매칭 풀기</button></div>`).join('')}</div>` : '<p class="muted">아직 없습니다.</p>'}</section>`;
    },
    bind(ctx) {
      $$('input[name=wait]').forEach(r => r.onchange = () => { pick = r.value; ctx.render(); });
      const b = $('#doMatch');
      if (b) b.onclick = () => {
        const m = $('input[name=mentor]:checked'); if (!m) return toast('양육도우미를 골라 주세요.');
        const id = pick;
        ctx.commit(s => { s.people.find(x => x.id === id).mentorId = m.value; }, '매칭했습니다.').then(okd => { if (okd) pick = ''; });
      };
      $$('[data-unmatch]').forEach(b => b.onclick = async () => {
        const p = ctx.state.people.find(x => x.id === b.dataset.unmatch);
        if (await ask('매칭 풀기', `${p.name}님의 양육도우미 매칭을 풀까요? 새사귐 기록은 지워지지 않습니다.`, '풀기', true)) ctx.commit(s => { s.people.find(x => x.id === p.id).mentorId = ''; }, '매칭을 풀었습니다.');
      });
    },
  };

  // ── 5. 심방 배정 (교구 목사: 자기 교구 / 전체 관리자: 교구 골라서)
  let assignDistrict = '', onlyUnassigned = false;
  Pages.assign = {
    label: '심방 배정',
    render(ctx) {
      const isAdmin = ctx.me.role === 'admin', g = C.groups(ctx.state).filter(x => x.visitors);
      const district = isAdmin ? (assignDistrict || g[0]?.name || '') : ctx.me.district;
      const people = ctx.state.people.filter(p => !p.newcomer && p.district === district).sort((a, b) => String(a.name).localeCompare(b.name, 'ko'));
      const visitors = (ctx.cache.staff || []).filter(s => s.role === 'visitor' && s.district === district && s.status === 'active');
      const vname = id => (ctx.cache.staff || []).find(s => s.user_id === id)?.display_name;
      const shown = onlyUnassigned ? people.filter(p => !vname(p.visitorId)) : people;
      const unassigned = people.filter(p => !vname(p.visitorId)).length;
      const noVisitors = !isAdmin && !C.groups(ctx.state).find(x => x.name === district)?.visitors;
      return `<div class="eyebrow">심방</div><h1 class="page-title">심방 배정</h1>
      <ol class="flow"><li>성도 고르기</li><li>심방사역자 고르기</li><li>배정</li></ol>
      <p class="subtitle">같은 교구 심방사역자는 서로의 명단을 함께 봅니다. 배정은 "주 담당"을 정하는 것입니다.</p>
      ${noVisitors ? '<p class="notice">이 교구에는 심방사역자가 없습니다. 목사님이 직접 돌보시는 교구입니다.</p>' : ''}
      ${isAdmin ? `<label class="inline">교구<select id="assignDistrict">${g.map(x => `<option ${x.name === district ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      <div class="stats"><div class="stat"><b>${people.length}</b>${esc(district)} 성도</div><div class="stat ${unassigned ? 'warn' : ''}"><b>${unassigned}</b>미배정</div><div class="stat"><b>${visitors.length}</b>심방사역자</div></div>
      <section class="card"><div class="between"><label class="check inline"><input type="checkbox" id="onlyUn" ${onlyUnassigned ? 'checked' : ''}> 미배정만 보기</label>
        <div class="acts"><select id="assignTo" style="max-width:220px">${visitors.length ? visitors.map(v => `<option value="${v.user_id}">${esc(v.display_name)}</option>`).join('') : '<option value="">심방사역자 없음</option>'}</select><button type="button" id="doAssign" class="primary" ${visitors.length ? '' : 'disabled'}>선택한 분 배정</button></div></div>
        ${shown.length ? `<div class="list">${shown.map(p => `<label class="row pick"><input type="checkbox" name="who" value="${esc(p.id)}"><span class="grow"><b>${esc(p.name)}</b><span class="muted small"> · 주 담당 ${esc(vname(p.visitorId) || '미배정')}</span></span></label>`).join('')}</div>`
          : `<p class="muted">${people.length ? '모두 배정되었습니다.' : '이 교구의 성도 명단이 아직 없습니다. 전체 관리자가 성도명단을 올리면 나타납니다.'}</p>`}</section>`;
    },
    async bind(ctx) {
      const d = $('#assignDistrict'); if (d) d.onchange = () => { assignDistrict = d.value; ctx.render(); };
      $('#onlyUn').onchange = e => { onlyUnassigned = e.target.checked; ctx.render(); };
      $('#doAssign').onclick = () => {
        const ids = $$('input[name=who]:checked').map(x => x.value), to = $('#assignTo').value;
        if (!ids.length) return toast('배정할 성도를 골라 주세요.');
        ctx.commit(s => { for (const p of s.people) if (ids.includes(p.id)) p.visitorId = to; }, `${ids.length}명을 배정했습니다.`);
      };
      if (!ctx.cache.staff) { await loadStaff(ctx); ctx.render(); }
    },
  };

  // ── 6. 문자 예문과 기준 (전체 관리자). 교회 공통으로 쓰입니다.
  let tplMinistry = 'visit';
  Pages.templates = {
    label: '문자 예문·기준',
    render(ctx) {
      const M = root.Messages, K = root.CareCore, tpls = M.templatesFor(ctx.state, tplMinistry);
      return `<div class="eyebrow">관리</div><h1 class="page-title">문자 예문 · 기준</h1>
      <p class="subtitle">사역자들이 문자를 쓸 때 고르는 교회 공통 예문입니다. {이름} 자리에 받는 분 이름이 들어갑니다. 건강·가정사 같은 내용은 예문에 넣지 마세요.</p>
      <div class="seg" role="group" aria-label="사역"><button type="button" data-min="visit" class="${tplMinistry === 'visit' ? 'active' : ''}">심방 예문</button><button type="button" data-min="new" class="${tplMinistry === 'new' ? 'active' : ''}">새가족 예문</button></div>
      <section class="card"><form id="tplForm" class="stack">${tpls.map(t => `<label>${esc(t.label)}<textarea name="${esc(t.key)}" rows="3" maxlength="600">${esc(t.text)}</textarea></label>`).join('')}
        <div class="acts"><button type="button" id="tplReset" class="quiet">기본 예문으로 되돌리기</button><button class="primary">예문 저장</button></div></form></section>
      <section class="card"><h2>오래 연락 못 한 분 기준</h2><form id="careForm" class="acts"><label class="inline">통화·방문이 <input name="longDays" type="number" min="7" max="365" value="${K.settings(ctx.state).longDays}" style="width:110px"> 일 넘게 없으면 "오래 연락 못 한 분"에 표시</label><button class="primary">저장</button></form></section>`;
    },
    bind(ctx) {
      $$('[data-min]').forEach(b => b.onclick = () => { tplMinistry = b.dataset.min; ctx.render(); });
      const put = (s, id, patch) => { const r = s.settings.find(x => x.id === id); if (r) Object.assign(r, patch); else s.settings.push({ id, ...patch }); };
      $('#tplForm').onsubmit = e => {
        e.preventDefault(); const f = new FormData(e.target), M = root.Messages;
        const list = M.templatesFor(ctx.state, tplMinistry).map(t => ({ key: t.key, label: t.label, text: String(f.get(t.key) || '').trim() || t.text }));
        ctx.commit(s => put(s, 'messages', { [tplMinistry]: list }), '예문을 저장했습니다.');
      };
      $('#tplReset').onclick = async () => { if (await ask('기본 예문으로', '이 사역의 예문을 처음 기본 예문으로 되돌릴까요?', '되돌리기')) ctx.commit(s => put(s, 'messages', { [tplMinistry]: null }), '기본 예문으로 되돌렸습니다.'); };
      $('#careForm').onsubmit = e => {
        e.preventDefault(); const n = Number(new FormData(e.target).get('longDays'));
        if (!Number.isInteger(n) || n < 7 || n > 365) return toast('7에서 365 사이의 숫자를 넣어 주세요.');
        ctx.commit(s => put(s, 'care', { longDays: n }), '기준을 저장했습니다.');
      };
    },
  };

  // ── 7. 화면 테마 (전체 관리자): 색·글꼴·글자 크기. 교회의 모든 사용자에게 같이 적용됩니다.
  let themeDraft = null;
  Pages.theme = {
    label: '화면·테마',
    render(ctx) {
      const T = root.HamkkeTheme, saved = T.fromState(ctx.state), d = themeDraft || saved;
      const changed = JSON.stringify(d) !== JSON.stringify(saved);
      return `<div class="eyebrow">관리</div><h1 class="page-title">화면 · 테마</h1>
      <p class="subtitle">교회의 모든 사용자 화면에 같이 적용됩니다. 고르면 바로 미리 보이고, "저장"을 눌러야 모두에게 적용됩니다.</p>
      <section class="card"><h2>색</h2><div class="swatches">${Object.entries(T.PALETTES).map(([k, p]) => `<button type="button" class="swatch ${d.palette === k ? 'on' : ''}" data-palette="${k}" aria-pressed="${d.palette === k}">
        <span class="chipset"><i style="background:${p.light}"></i><i style="background:color-mix(in oklab, ${p.light} 22%, #fff)"></i><i style="background:${p.dark}"></i></span><b>${esc(p.name)}</b></button>`).join('')}</div></section>
      <section class="card"><h2>글꼴</h2><div class="fontlist">${Object.entries(T.FONTS).map(([k, f]) => `<button type="button" class="fontopt ${d.font === k ? 'on' : ''}" data-font="${k}" aria-pressed="${d.font === k}">
        <span class="sample" style="font-family:${f.family ? f.family + ',' : ''} system-ui">함께 돌봄 가나다 123</span><span class="muted small">${esc(f.name)} · ${esc(f.note)}</span></button>`).join('')}</div>
        <p class="muted small">웹 글꼴은 처음 한 번 인터넷에서 받아 옵니다. 받지 못하면 기기 기본 글꼴로 보입니다.</p></section>
      <section class="card"><h2>밝기</h2><div class="seg" role="group" aria-label="밝기">${Object.entries(T.MODES).map(([k, n]) => `<button type="button" data-mode="${k}" class="${d.mode === k ? 'active' : ''}">${esc(n)}</button>`).join('')}</div>
        <p class="muted small">"기기 설정 따라"를 고르면 각 기기의 어두운 모드 설정에 맞춰 바뀝니다. 처음에는 "밝게"가 읽기 편합니다.</p></section>
      <section class="card"><h2>글자 크기</h2><div class="seg" role="group" aria-label="글자 크기">${Object.entries(T.SIZES).map(([k, s]) => `<button type="button" data-size="${k}" class="${d.size === k ? 'active' : ''}">${esc(s.name)}</button>`).join('')}</div>
        <p class="muted small">어르신 사역자가 많으면 "크게" 이상을 권합니다. 각 기기의 확대 기능도 함께 쓸 수 있습니다.</p></section>
      <section class="card"><h2>미리 보기</h2><div class="preview-card"><div class="eyebrow">심방</div><h3 style="margin:4px 0 10px">오늘 할 일</h3>
        <div class="row"><div class="grow"><b>가상김성도</b> <span class="chip">내 담당</span> <span class="chip warn">오늘 생일</span><div class="muted small">최근 연락: 시험심방 · 3일 전 · 통화 완료</div></div><div class="acts"><button type="button">문자</button><button type="button" class="primary">기록</button></div></div></div>
        <div class="acts" style="margin-top:16px"><button type="button" id="themeReset" class="quiet" ${changed ? '' : 'disabled'}>되돌리기</button><button type="button" id="themeSave" class="primary" ${changed ? '' : 'disabled'}>모두에게 적용(저장)</button></div></section>`;
    },
    bind(ctx) {
      const T = root.HamkkeTheme, saved = T.fromState(ctx.state);
      const pick = patch => { themeDraft = T.normalize({ ...(themeDraft || saved), ...patch }); T.apply(themeDraft, false); ctx.render(); };
      $$('[data-palette]').forEach(b => b.onclick = () => pick({ palette: b.dataset.palette }));
      $$('[data-font]').forEach(b => b.onclick = () => pick({ font: b.dataset.font }));
      $$('[data-size]').forEach(b => b.onclick = () => pick({ size: b.dataset.size }));
      $$('[data-mode]').forEach(b => b.onclick = () => pick({ mode: b.dataset.mode }));
      $('#themeReset').onclick = () => { themeDraft = null; T.apply(saved); ctx.render(); };
      $('#themeSave').onclick = async () => {
        const t = themeDraft;
        if (await ctx.commit(s => { const r = s.settings.find(x => x.id === 'theme'); if (r) Object.assign(r, t); else s.settings.push({ id: 'theme', ...t }); }, '테마를 저장했습니다. 다른 기기는 새로고침하면 바뀝니다.')) { themeDraft = null; T.apply(t); }
      };
    },
  };

  root.HamkkeAdmin = { showCode, downloadTemplate, uid };
})(window);
