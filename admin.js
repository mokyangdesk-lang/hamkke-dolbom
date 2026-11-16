/* 함께 돌봄 5.0 — 관리 화면: 담당자, 교구 설정, 명단 올리기, 양육도우미 매칭, 심방 배정.
   어떤 계정이 무엇을 할 수 있는지는 서버가 다시 판정합니다. */
(function (root) {
  'use strict';
  const { $, $$, esc, ROLE, toast, dialog, closeDialog, ask, copyText, matches, liveSearch } = root.UI;
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
        if (!$('#staffFilter') || !$('#staffList')) return; // 불러오는 사이 다른 화면으로 옮긴 경우
        const filter = $('#staffFilter').value, rows = (ctx.cache.staff || []).filter(r => !filter || (filter === 'new' ? !r.district : r.district === filter));
        $('#staffList').innerHTML = rows.length ? rows.map(r => `<div class="row"><div class="grow"><b>${esc(r.display_name)}</b> <span class="chip ${r.status === 'active' ? 'ok' : 'warn'}">${r.status === 'active' ? '사용 중' : '접근 중지'}</span>
          <div class="muted small">${esc(ROLE[r.role] || r.role)} · ${esc(r.district || '모든 교구 새가족')} · 코드 발급 ${esc(date(r.code_issued_at))}${r.phone ? ' · ' + esc(r.phone) : ''}</div></div>
          <div class="acts">${r.phone ? `<a class="button" href="${esc(root.Messages.smsHref(r.phone, linkMessage(r.display_name, r.role)))}" title="주소 안내 문자(코드 없음)">주소 문자</a>` : '<button type="button" disabled title="전화번호가 없어 문자를 보낼 수 없습니다">주소 문자</button>'}<button data-st="edit" data-id="${r.user_id}">교구·역할·전화</button><button data-st="reissue" data-id="${r.user_id}">코드 다시 발급</button>
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
          if (!$('#staffLog')) return; // 불러오는 사이 다른 화면으로 옮긴 경우
          $('#staffLog').innerHTML = rows.length ? rows.map(l => `<p>${esc(new Date(l.at).toLocaleString('ko-KR'))} · ${esc(ACTION[l.action] || l.action)} · ${esc(name(l.target))}</p>`).join('') : '이력이 없습니다.';
        } catch (e) { const el = $('#staffLog'); if (el) el.textContent = '이력을 불러오지 못했습니다.'; }
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

  // ── 3. 명단 올리기 (전체 관리자: 돌봄 성도·새가족·양육도우미 / 새가족 관리자: 새가족·양육도우미)
  // 양식은 종류별로 따로 받습니다. 파일 안의 시트 이름이 달라도 첫 줄(열 이름)로 어떤 명단인지 알아봅니다.
  let preview = null, applied = null;
  const TEMPLATES = {
    성도명단: { title: '돌봄 성도', file: '함께돌봄-돌봄성도-양식.xlsx', id: '이름-생년월일 (자동)', note: '교적 프로그램에서 내려받은 엑셀을 그대로 올려도 됩니다. 소속(교구) 칸에 따라 교구별로 자동으로 나뉩니다. 각 교구 심방사역자와 교구 목사에게 그 교구 성도만 보입니다. 전체 교적 엑셀 한 파일을 올리셔도 됩니다.' },
    새가족명단: { title: '새가족', file: '함께돌봄-새가족-양식.xlsx', id: '이름-생년월일 (자동)', note: '교적 양식과 같습니다. 최초입력일을 등록일로 씁니다. 소속(교구) 칸에 따라 그 교구에서 파송한 새가족위원과 새가족팀이 봅니다.' },
    양육도우미명단: { title: '양육도우미', file: '함께돌봄-양육도우미-양식.xlsx', id: '양육도우미ID', note: '새가족 관리자가 4과목을 마친 새가족과 매칭할 때 씁니다.' },
  };
  const allowSheets = role => role === 'admin' ? ['성도명단', '새가족명단', '양육도우미명단'] : ['새가족명단', '양육도우미명단'];
  const HEADERS = { 성도명단: Object.keys(C.SHEETS.성도명단.map), 새가족명단: Object.keys(C.SHEETS.새가족명단.map).filter(x => x !== '섬김이ID'), 양육도우미명단: Object.keys(C.SHEETS.양육도우미명단.map).filter(x => x !== '섬김이ID') };
  const GUIDE_ROWS = {
    성도명단: [['1행', '교구 이름(예: 5교구). 소속 칸이 비어 있으면 이 교구로 들어갑니다.'], ['전체 교적 엑셀', '"5교구" 제목 줄 → 명단 → "6교구" 제목 줄 → 명단처럼 여러 교구가 이어져 있어도 교구별로 나눠 읽습니다.'], ['소속(주요항목)', '"5교구", "5교구 3구역"처럼 적으면 교구를 알아봅니다.'], ['같은 분 구분', '이름 + 생년월일로 자동으로 구분합니다(예: 홍길동-19500315). 생년월일이 없으면 이름 + 핸드폰 뒤 4자리. 둘 다 없으면 올릴 수 없습니다.'], ['꼭 필요한 칸', '이름, 생년월일 또는 핸드폰, 소속(또는 1행 교구)'], ['나머지 칸', '교회직분·성별·신급·인도자 등은 있으면 함께 저장하고, 비어 있어도 됩니다. 나이·최종수정일은 쓰지 않습니다.'], ['양/음', '양 또는 음']],
    새가족명단: [['1행', '교구 이름(예: 5교구). 그 교구에서 파송한 새가족위원이 맡습니다.'], ['같은 분 구분', '이름 + 생년월일로 자동으로 구분합니다(예: 김새가족-19900101). 생년월일이 없으면 이름 + 핸드폰 뒤 4자리.'], ['최초입력일', '새가족 등록일로 씁니다(몇 주차인지 계산).'], ['나머지 칸', '돌봄 성도 양식과 같습니다.']],
    양육도우미명단: [['양육도우미ID', '사람마다 다른 번호(예: M3-01).'], ['양육교육이수', '이수 / 미이수'], ['활동상태', '활동중 / 활동중지'], ['배정가능인원', '동시에 맡을 수 있는 새가족 수(숫자)']],
  };
  function downloadTemplate(sheet) {
    const X = root.XLSX, book = X.utils.book_new(), t = TEMPLATES[sheet];
    X.utils.book_append_sheet(book, X.utils.aoa_to_sheet(sheet === '양육도우미명단' ? [HEADERS[sheet]] : [['1교구'], C.REGISTRY_HEADERS]), sheet);
    X.utils.book_append_sheet(book, X.utils.aoa_to_sheet([['항목', '안내'], ...GUIDE_ROWS[sheet],
      [sheet === '양육도우미명단' ? '첫 줄' : '2행', sheet === '양육도우미명단' ? '첫 줄(열 이름)은 바꾸지 마세요. 둘째 줄부터 한 사람씩 적습니다.' : '2행(열 이름)은 바꾸지 마세요. 3행부터 한 사람씩 적습니다.'], ['다시 올릴 때', '같은 분(같은 ID)은 수정, 새로운 분은 추가됩니다. 빈칸은 기존 값을 지우지 않습니다. 명단에서 빠진 분을 지우지도 않습니다.'],
      ['날짜', 'YYYY-MM-DD 형식. 예: 2026-11-15'], ['같은 분 확인', '이름이나 전화번호가 같은 기록이 있으면 경고가 뜹니다. 자동으로 합치지 않습니다.']]), '작성안내');
    X.writeFile(book, t.file);
  }
  // 시트 이름이 달라도 첫 줄의 ID 칸으로 어떤 명단인지 알아봅니다.
  function detectSheets(book, kindForRegistry = '성도명단') {
    const X = root.XLSX, sheets = {};
    for (const name of book.SheetNames) {
      if (name === '작성안내') continue;
      const aoa = X.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: '' });
      if (C.registryHeaderRow(aoa) >= 0) {
        const kind = ['성도명단', '새가족명단'].includes(name) ? name : kindForRegistry;
        sheets[kind] = [...(sheets[kind] || []), ...C.fromRegistry(aoa, kind === '새가족명단')];
        continue;
      }
      const rows = X.utils.sheet_to_json(book.Sheets[name], { defval: '', raw: false });
      const head = X.utils.sheet_to_json(book.Sheets[name], { header: 1 })[0] || [];
      const kind = C.SHEETS[name] ? name : name === '섬김이명단' ? '양육도우미명단' : head.includes('새가족ID') ? '새가족명단' : head.includes('성도ID') ? '성도명단' : (head.includes('양육도우미ID') || head.includes('섬김이ID')) ? '양육도우미명단' : null;
      if (kind) sheets[kind] = [...(sheets[kind] || []), ...rows];
    }
    return sheets;
  }
  const byDistrict = p => { const m = new Map(); for (const x of p.items) if (x.item.district && x.sheet !== '양육도우미명단') m.set(x.item.district, (m.get(x.item.district) || 0) + 1);
    return [...m].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ko', { numeric: true })).map(([d, n]) => `${esc(d)} <b>${n}</b>명`).join(' · '); };
  Pages.imports = {
    label: '명단 올리기',
    render(ctx) {
      const sheets = allowSheets(ctx.me.role), p = preview;
      const by = k => p ? p.items.filter(x => x.sheet === k) : [];
      return `<div class="eyebrow">관리</div><h1 class="page-title">명단 올리기</h1>
      <ol class="flow"><li>엑셀 올리기</li><li>교구별로 나뉜 것 확인</li><li>적용</li></ol>
      ${C.groups(ctx.state).length ? '' : '<p class="notice">교구 설정이 아직 없어 교구 이름을 검사하지 못합니다. 먼저 "교구 설정"을 저장해 주세요.</p>'}
      <div class="two">${sheets.map((k, i) => `<section class="card"><h2>${esc(TEMPLATES[k].title)} 명단</h2><p class="muted small">${esc(TEMPLATES[k].note)}</p><p class="small">같은 분 구분: <b>${esc(TEMPLATES[k].id)}</b></p>
        <div class="acts"><button type="button" data-tpl-sheet="${k}" class="quiet">${esc(TEMPLATES[k].title)} 양식 받기</button><label class="button primary">${esc(TEMPLATES[k].title)} 엑셀 올리기<input ${i === 0 ? 'id="importFile"' : ''} data-upkind="${k}" type="file" accept=".xlsx,.xls" class="visually-hidden"></label></div></section>`).join('')}</div>
      ${applied ? `<section class="card"><h2>적용했습니다</h2><p>${applied.map(([k, n]) => `${esc(TEMPLATES[k].title)} ${n}명`).join(' · ')}</p>
        <div class="acts">${applied.some(([k]) => k === '성도명단') ? '<button type="button" data-go-roster="care">돌봄 성도 명단 보기</button>' : ''}${applied.some(([k]) => k === '새가족명단') ? '<button type="button" data-go-roster="new">새가족 명단 보기</button>' : ''}${applied.some(([k]) => k === '양육도우미명단') ? '<button type="button" data-go="matching">양육도우미 보기</button>' : ''}</div></section>` : ''}
      ${p ? `<section class="card"><h2>미리 보기</h2>
        <div class="stats">${sheets.filter(k => by(k).length).map(k => `<div class="stat"><b>${by(k).length}</b>${esc(TEMPLATES[k].title)} (신규 ${by(k).filter(x => !x.existing).length})</div>`).join('')}<div class="stat ${p.errors.length ? 'bad' : ''}"><b>${p.errors.length}</b>오류</div><div class="stat ${p.warnings.length ? 'warn' : ''}"><b>${p.warnings.length}</b>확인 필요</div></div>
        ${byDistrict(p) ? `<h3>교구별로 나뉜 인원</h3><p>${byDistrict(p)}</p><p class="muted small">적용하면 각 교구 심방사역자와 교구 목사에게 그 교구 성도만 보입니다.</p>` : ''}
        ${p.errors.length ? `<h3>고쳐야 할 것</h3><ul class="error-list">${p.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><p class="muted small">엑셀을 고친 뒤 다시 골라 주세요.</p>` : ''}
        ${p.warnings.length ? `<h3>같은 분일 수 있는 기록</h3><ul class="warn-list">${p.warnings.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
          <label class="check"><input type="checkbox" id="warnOk"> 확인했습니다. 다른 분이 맞습니다(같은 분이면 엑셀의 ID를 고쳐 다시 올리세요).</label>` : ''}
        <div class="table-wrap"><table><thead><tr><th>명단</th><th>ID</th><th>이름</th><th>교구</th><th>구분</th></tr></thead><tbody>
        ${p.items.slice(0, 200).map(x => `<tr><td>${esc(TEMPLATES[x.sheet]?.title || x.sheet)}</td><td>${esc(x.item.id)}</td><td>${esc(x.item.name || '')}</td><td>${esc(x.item.district || '')}</td><td>${x.existing ? '수정' : '신규'}</td></tr>`).join('')}</tbody></table></div>
        ${p.items.length > 200 ? `<p class="muted small">처음 200줄만 보입니다(전체 ${p.items.length}줄).</p>` : ''}
        <div class="acts"><button type="button" id="cancelImport" class="quiet">취소</button><button type="button" id="applyImport" class="primary" ${p.errors.length || !p.items.length || p.warnings.length ? 'disabled' : ''}>확인한 명단 적용</button></div></section>` : ''}`;
    },
    bind(ctx) {
      $$('[data-tpl-sheet]').forEach(b => b.onclick = () => { try { downloadTemplate(b.dataset.tplSheet); } catch (e) { toast('양식을 만들지 못했습니다: ' + e.message); } });
      $$('[data-go-roster]').forEach(b => b.onclick = () => { rosterKind = b.dataset.goRoster; applied = null; ctx.go(ctx.me.role === 'admin' ? 'roster' : 'board'); });
      $$('[data-go]').forEach(b => b.onclick = () => { applied = null; ctx.go(b.dataset.go); });
      $$('[data-upkind]').forEach(inp => inp.onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024) throw Error('10MB 이하 파일을 골라 주세요.');
          const sheets = detectSheets(root.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }), inp.dataset.upkind);
          if (!Object.keys(sheets).length) throw Error('명단을 찾지 못했습니다. 교적 양식(이름·생년월일·핸드폰 칸)이나 양육도우미 양식을 써 주세요.');
          preview = C.previewImport(ctx.state, sheets, { allow: allowSheets(ctx.me.role) }); applied = null;
          ctx.render();
        } catch (err) { toast(err.message); }
      });
      const ok = $('#warnOk'); if (ok) ok.onchange = () => { $('#applyImport').disabled = !ok.checked || !!preview.errors.length; };
      const c = $('#cancelImport'); if (c) c.onclick = () => { preview = null; ctx.render(); };
      const a = $('#applyImport'); if (a) a.onclick = async () => {
        const p = preview, counts = Object.keys(TEMPLATES).map(k => [k, p.items.filter(x => x.sheet === k).length]).filter(x => x[1]);
        if (await ctx.commit(s => C.applyImport(s, p), `${p.items.length}건을 적용했습니다.`)) { preview = null; applied = counts; ctx.render(); }
      };
    },
  };

  // ── 3-1. 성도 명단 보기 (전체 관리자): 돌봄 성도 / 새가족, 교구별, 찾기
  let rosterKind = 'care', rosterDistrict = '', rosterSearch = '';
  Pages.roster = {
    label: '성도 명단',
    render(ctx) {
      const s = ctx.state, N = root.NewcomerCore, g = C.groups(s);
      const all = s.people.filter(p => rosterKind === 'new' ? p.newcomer : !p.newcomer);
      let list = all.filter(p => (!rosterDistrict || p.district === rosterDistrict) && (!rosterSearch || matches(p, rosterSearch)));
      list.sort((a, b) => String(a.district).localeCompare(String(b.district), 'ko', { numeric: true }) || String(a.name).localeCompare(b.name, 'ko'));
      const count = d => all.filter(p => p.district === d).length;
      const nextOf = p => { const st = N ? N.nextStage(N.stages(s, p)) : null; return st ? st.label : '정착 · 인계 대기'; };
      return `<div class="eyebrow">관리</div><h1 class="page-title">성도 명단</h1>
      <p class="subtitle">"명단 올리기"로 올린 명단입니다. 교구 칸에 따라 교구별로 나뉘어, 그 교구 사역자에게만 보입니다.</p>
      <div class="seg" role="group" aria-label="명단 종류"><button type="button" data-rk="care" class="${rosterKind === 'care' ? 'active' : ''}">돌봄 성도 <b>${s.people.filter(p => !p.newcomer).length}</b></button><button type="button" data-rk="new" class="${rosterKind === 'new' ? 'active' : ''}">새가족 <b>${s.people.filter(p => p.newcomer).length}</b></button></div>
      <div class="filters"><select id="rosterDistrict" aria-label="교구" style="max-width:220px"><option value="">모든 교구</option>${g.map(x => `<option value="${esc(x.name)}" ${x.name === rosterDistrict ? 'selected' : ''}>${esc(x.name)} (${count(x.name)})</option>`).join('')}</select>
        <input id="rosterSearch" placeholder="이름 · 전화번호 · ID로 찾기" value="${esc(rosterSearch)}" aria-label="찾기"></div>
      <section class="card">${list.length ? `<div class="table-wrap"><table><thead><tr><th>교구</th><th>이름</th><th>직분</th><th>ID</th><th>휴대전화</th>${rosterKind === 'new' ? '<th>등록일</th><th>다음 단계</th>' : '<th>최근 연락</th>'}</tr></thead><tbody>
        ${list.slice(0, 500).map(p => `<tr><td>${esc(p.district || '-')}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.office || '')}</td><td class="muted small">${esc(p.id)}</td><td>${esc(p.phone || '')}</td>${rosterKind === 'new' ? `<td>${esc(p.registeredAt || '')}</td><td>${esc(nextOf(p))}</td>` : `<td>${esc(root.CareCore?.lastVisit(s, p.id)?.date || '기록 없음')}</td>`}</tr>`).join('')}</tbody></table></div>
        ${list.length > 500 ? `<p class="muted small">처음 500명만 보입니다(전체 ${list.length}명). 교구나 찾기로 좁혀 주세요.</p>` : ''}`
        : `<p class="muted">${all.length ? '찾는 분이 없습니다.' : '아직 올린 명단이 없습니다. "명단 올리기"에서 양식을 받아 올려 주세요.'}</p>`}</section>`;
    },
    bind(ctx) {
      $$('[data-rk]').forEach(b => b.onclick = () => { rosterKind = b.dataset.rk; ctx.render(); });
      $('#rosterDistrict').onchange = e => { rosterDistrict = e.target.value; ctx.render(); };
      liveSearch('rosterSearch', v => { rosterSearch = v; }, ctx.render);
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

  // ── 5. 심방사역자 관리 (교구 목사: 자기 교구 / 전체 관리자: 교구 골라서)
  // 성도는 엑셀의 "교구" 칸으로 교구에 들어가고, 그 교구의 심방사역자 모두가 같은 명단을 봅니다(사람별 배정 없음).
  let assignDistrict = '';
  Pages.assign = {
    label: '심방사역자 관리',
    render(ctx) {
      const isAdmin = ctx.me.role === 'admin', g = C.groups(ctx.state).filter(x => x.visitors);
      const district = isAdmin ? (assignDistrict || g[0]?.name || '') : ctx.me.district;
      const people = ctx.state.people.filter(p => !p.newcomer && p.district === district);
      const ids = new Set(people.map(p => p.id));
      const visitors = (ctx.cache.staff || []).filter(s => s.role === 'visitor' && s.district === district);
      const K = root.CareCore, since = C.iso(new Date(Date.now() - 7 * 86400000));
      const visits = ctx.state.visits.filter(v => ids.has(v.personId));
      const long = K ? K.longNoContact({ ...ctx.state, people }).length : 0;
      const noVisitors = !C.groups(ctx.state).find(x => x.name === district)?.visitors;
      const rows = visitors.map(v => { const mine = visits.filter(x => x.authorId === v.user_id), last = mine.map(x => x.date).sort().pop();
        return `<tr><td><b>${esc(v.display_name)}</b> ${v.status === 'active' ? '' : '<span class="chip warn">접근 중지</span>'}</td><td>${esc(v.phone || '-')}</td><td>${mine.filter(x => x.date >= since).length}회</td><td>${esc(last || '기록 없음')}</td></tr>`; }).join('');
      return `<div class="eyebrow">심방</div><h1 class="page-title">심방사역자 관리</h1>
      <p class="subtitle">성도는 엑셀 명단의 "교구" 칸에 따라 교구별로 자동으로 나뉩니다. 이 교구의 심방사역자는 모두 같은 교구 명단을 함께 보고 연락합니다.</p>
      ${isAdmin ? `<label class="inline">교구<select id="assignDistrict">${g.map(x => `<option ${x.name === district ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      ${noVisitors ? '<p class="notice">이 교구에는 심방사역자가 없습니다. 목사님이 직접 돌보시는 교구입니다.</p>' : ''}
      <div class="stats"><div class="stat"><b>${people.length}</b>${esc(district)} 성도</div><div class="stat"><b>${visitors.filter(v => v.status === 'active').length}</b>심방사역자</div><div class="stat"><b>${visits.filter(v => v.date >= since).length}</b>최근 7일 연락</div><div class="stat ${long ? 'warn' : ''}"><b>${long}</b>오래 연락 못 한 분</div></div>
      <section class="card"><h2>심방사역자별 활동</h2>${visitors.length ? `<div class="table-wrap"><table><thead><tr><th>심방사역자</th><th>휴대전화</th><th>최근 7일 연락</th><th>마지막 기록</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="muted">이 교구에 등록된 심방사역자가 없습니다. 전체 관리자가 "담당자" 메뉴에서 등록합니다.</p>'}
        <p class="muted small">${people.length ? '' : '이 교구의 성도 명단이 아직 없습니다. 전체 관리자가 "명단 올리기"로 성도명단을 올리면 교구 칸에 따라 여기에 들어옵니다.'}</p></section>`;
    },
    async bind(ctx) {
      const d = $('#assignDistrict'); if (d) d.onchange = () => { assignDistrict = d.value; ctx.render(); };
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
      <p class="subtitle">사역자들이 문자를 쓸 때 고르는 교회 공통 예문입니다. {이름} 자리에 받는 분 이름이 들어갑니다. 끝의 서명(예: 할렐루야교회 홍길동 심방사역자 드림)은 사역자가 문자를 보낼 때 이름·직분을 골라 붙이므로 예문에는 넣지 마세요. 건강·가정사 같은 내용은 예문에 넣지 마세요.</p>
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
      // 테마는 <html data-palette data-mode …>에도 붙어 있으므로 버튼만 고릅니다(그렇지 않으면 페이지 어디를 눌러도 다시 그려짐).
      const T = root.HamkkeTheme, saved = T.fromState(ctx.state);
      const pick = patch => { themeDraft = T.normalize({ ...(themeDraft || saved), ...patch }); T.apply(themeDraft, false); ctx.render(); };
      $$('button[data-palette]').forEach(b => b.onclick = () => pick({ palette: b.dataset.palette }));
      $$('button[data-font]').forEach(b => b.onclick = () => pick({ font: b.dataset.font }));
      $$('button[data-size]').forEach(b => b.onclick = () => pick({ size: b.dataset.size }));
      $$('button[data-mode]').forEach(b => b.onclick = () => pick({ mode: b.dataset.mode }));
      $('#themeReset').onclick = () => { themeDraft = null; T.apply(saved); ctx.render(); };
      $('#themeSave').onclick = async () => {
        const t = themeDraft;
        if (await ctx.commit(s => { const r = s.settings.find(x => x.id === 'theme'); if (r) Object.assign(r, t); else s.settings.push({ id: 'theme', ...t }); }, '테마를 저장했습니다. 다른 기기는 새로고침하면 바뀝니다.')) { themeDraft = null; T.apply(t); }
      };
    },
  };

  // ── 8. 자료 관리 (전체 관리자): 백업 받기, 한 분 지우기, 전체 초기화, 백업에서 다시 넣기
  const RELATED = ['visits', 'education', 'progress', 'notes'];
  function saveFile(name, type, data) {
    const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function backupJSON(state) {
    const records = [];
    for (const kind of C.KINDS) for (const p of state[kind] || []) records.push({ kind, id: p.id, payload: p });
    saveFile(`함께돌봄-백업-${C.iso()}.json`, 'application/json', JSON.stringify({ app: 'hamkke-dolbom', version: 5, savedAt: new Date().toISOString(), records }, null, 1));
    return records.length;
  }
  function backupExcel(state) {
    const X = root.XLSX, book = X.utils.book_new(), cal = c => c === 'lunar' ? '음력' : c ? '양력' : '';
    X.utils.book_append_sheet(book, X.utils.json_to_sheet(state.people.filter(p => !p.newcomer).map(p => ({ 성도ID: p.id, 이름: p.name, 휴대전화: p.phone || '', 교구: p.district || '', 생년월일: p.birthDate || '', 생일기준: cal(p.birthCalendar), 올해생일: p.birthdayThisYear || '', 비고: p.notes || '' }))), '성도명단');
    X.utils.book_append_sheet(book, X.utils.json_to_sheet(state.people.filter(p => p.newcomer).map(p => ({ 새가족ID: p.id, 이름: p.name, 휴대전화: p.phone || '', 교구: p.district || '', 생년월일: p.birthDate || '', 생일기준: cal(p.birthCalendar), 올해생일: p.birthdayThisYear || '', 등록일: p.registeredAt || '', 양육도우미ID: p.mentorId || '', 비고: p.notes || '' }))), '새가족명단');
    X.utils.book_append_sheet(book, X.utils.json_to_sheet(state.mentors.map(m => ({ 양육도우미ID: m.id, 이름: m.name, 휴대전화: m.phone || '', 교구: m.district, 양육교육이수: m.trained ? '이수' : '미이수', 활동상태: m.active ? '활동중' : '활동중지', 배정가능인원: m.capacity ?? '' }))), '양육도우미명단');
    X.writeFile(book, `함께돌봄-명단-${C.iso()}.xlsx`);
  }
  let dataSearch = '', restoreFile = null;
  Pages.data = {
    label: '자료 관리',
    render(ctx) {
      const s = ctx.state, n = k => (s[k] || []).length;
      const found = dataSearch ? s.people.filter(p => matches(p, dataSearch)).slice(0, 20) : [];
      return `<div class="eyebrow">관리</div><h1 class="page-title">자료 관리</h1>
      <p class="subtitle">서버에 있는 교회 자료를 내려받거나 정리합니다. 지우는 일은 되돌릴 수 없으니, 먼저 백업을 받아 두세요.</p>
      <div class="stats"><div class="stat"><b>${s.people.filter(p => !p.newcomer).length}</b>성도</div><div class="stat"><b>${s.people.filter(p => p.newcomer).length}</b>새가족</div><div class="stat"><b>${n('mentors')}</b>양육도우미</div><div class="stat"><b>${n('visits')}</b>연락 기록</div><div class="stat"><b>${n('reports')}</b>보고서</div></div>
      <section class="card"><h2>백업 받기</h2><p class="muted small">백업 파일에는 성도 개인정보가 들어 있습니다. 교회 관리용 컴퓨터에만 보관하고, 메신저나 메일로 돌리지 마세요.</p>
        <div class="acts"><button type="button" id="bkJson" class="primary">전체 백업(JSON) 받기</button><button type="button" id="bkXlsx">명단 엑셀로 받기</button></div>
        <p class="muted small">엑셀은 "명단 올리기" 양식과 같아 그대로 다시 올릴 수 있습니다. 연락 기록·교육·보고서까지 모두 보관하려면 JSON 백업을 받으세요.</p></section>
      <section class="card"><h2>한 분 지우기</h2><p class="muted small">그분의 연락 기록·교육·새가족 진행·소통 메모도 함께 지워집니다. 이미 승인된 주간 보고서는 기록으로 남습니다.</p>
        <div class="filters"><input id="dataSearch" placeholder="이름 · 전화번호 · ID로 찾기" value="${esc(dataSearch)}" aria-label="지울 분 찾기"></div>
        ${found.length ? `<div class="list">${found.map(p => `<div class="row"><div class="grow"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.district || '')} · ${p.newcomer ? '새가족' : '성도'} · ${esc(p.id)}</span></div><button type="button" class="danger" data-del="${esc(p.id)}">지우기</button></div>`).join('')}</div>` : dataSearch ? '<p class="muted">찾는 분이 없습니다.</p>' : ''}</section>
      <section class="card"><h2>전체 초기화</h2><p class="muted small">성도·새가족·양육도우미·연락 기록·교육·보고서·메모를 모두 지웁니다. 교구 설정·문자 예문·테마는 남습니다. 담당자 계정은 "담당자" 메뉴에서 따로 접근 중지해 주세요. 누르면 먼저 전체 백업 파일이 내려받아집니다.</p>
        <div class="acts"><input id="resetWord" placeholder="초기화 라고 입력" style="max-width:220px" aria-label="확인 글자"><button type="button" id="doReset" class="danger-fill">전체 초기화</button></div></section>
      <section class="card"><h2>백업에서 다시 넣기</h2><p class="muted small">JSON 백업 파일을 고르면, 지금 서버에 <b>없는</b> 기록만 다시 넣습니다. 이미 있는 기록은 덮어쓰지 않습니다.</p>
        <div class="acts"><label class="button">백업 파일 고르기<input id="restoreInput" type="file" accept=".json,application/json" class="visually-hidden"></label>
        ${restoreFile ? `<span>${esc(restoreFile.name)} · ${restoreFile.records.length}건 (새로 넣을 것 ${restoreFile.records.filter(r => !(s[r.kind] || []).some(x => x.id === r.id)).length}건)</span><button type="button" id="doRestore" class="primary">다시 넣기</button>` : ''}</div></section>`;
    },
    bind(ctx) {
      $('#bkJson').onclick = () => { const n = backupJSON(ctx.state); toast(`${n}건을 백업 파일로 받았습니다.`); };
      $('#bkXlsx').onclick = () => { try { backupExcel(ctx.state); } catch (e) { toast('엑셀을 만들지 못했습니다: ' + e.message); } };
      liveSearch('dataSearch', v => { dataSearch = v; }, ctx.render);
      $$('[data-del]').forEach(b => b.onclick = async () => {
        const s = ctx.state, p = s.people.find(x => x.id === b.dataset.del);
        const rel = RELATED.flatMap(k => (s[k] || []).filter(r => r.personId === p.id || (k === 'progress' && r.id === p.id)).map(r => ({ kind: k, id: r.id })));
        if (!await ask('한 분 지우기', `${p.name}님(${p.district || '교구 없음'})과 관련 기록 ${rel.length}건을 지웁니다. 되돌릴 수 없습니다.`, '지우기', true)) return;
        try { await store.remove([...rel, { kind: 'people', id: p.id }]); toast(`${p.name}님을 지웠습니다.`); dataSearch = ''; await ctx.refresh(true); } catch (e) { toast(e.message); }
      });
      $('#doReset').onclick = async () => {
        if ($('#resetWord').value.trim() !== '초기화') return toast('확인을 위해 칸에 "초기화"라고 입력해 주세요.');
        const s = ctx.state, items = ['people', 'progress', 'education', 'visits', 'notes', 'reports', 'mentors'].flatMap(k => (s[k] || []).map(r => ({ kind: k, id: r.id })));
        if (!items.length) return toast('지울 자료가 없습니다.');
        if (!await ask('전체 초기화', `기록 ${items.length}건을 모두 지웁니다. 먼저 전체 백업 파일을 내려받습니다. 되돌리려면 그 파일로 "백업에서 다시 넣기"를 하세요.`, '백업 받고 초기화', true)) return;
        backupJSON(s);
        try { const n = await store.remove(items); toast(`${n}건을 지웠습니다. 백업 파일을 잘 보관해 주세요.`); await ctx.refresh(true); } catch (e) { toast('일부만 지워졌을 수 있습니다: ' + e.message); await ctx.refresh(true); }
      };
      $('#restoreInput').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { const j = JSON.parse(await f.text()); if (j.app !== 'hamkke-dolbom' || !Array.isArray(j.records)) throw Error('함께 돌봄 백업 파일이 아닙니다.'); restoreFile = { name: f.name, records: j.records }; ctx.render(); }
        catch (err) { toast(err.message.includes('JSON') ? '파일을 읽지 못했습니다.' : err.message); }
      };
      const r = $('#doRestore'); if (r) r.onclick = async () => {
        if (!await ask('백업에서 다시 넣기', '지금 서버에 없는 기록만 다시 넣습니다. 이미 있는 기록은 그대로 둡니다.', '다시 넣기')) return;
        try { const n = await store.restore(restoreFile.records); restoreFile = null; toast(`${n}건을 다시 넣었습니다.`); await ctx.refresh(true); } catch (e) { toast(e.message); }
      };
    },
  };

  // ── 내 계정(전체 관리자): 비밀번호 바꾸기 + 이메일 변경·관리자 추가 안내
  Pages.account = {
    label: '내 계정',
    render(ctx) {
      const st = root.HamkkeStore.status(), email = st.email || '';
      return `<div class="eyebrow">관리</div><h1 class="page-title">내 계정</h1>
      <p class="subtitle">전체 관리자가 이메일로 로그인할 때 쓰는 계정입니다.</p>
      <section class="card"><h2>로그인 이메일</h2><p><b>${esc(email || '이메일 정보 없음')}</b></p>
        <p class="muted small">이메일 주소를 바꾸거나 전체 관리자를 더 등록하는 일은 Supabase 관리 화면에서 합니다. 방법은 아래 "이메일 바꾸기 · 관리자 추가"를 펼쳐 보세요.</p></section>
      <section class="card"><h2>비밀번호 바꾸기</h2>
        ${email ? `<form id="pwForm" class="stack" autocomplete="on">
          <input type="email" name="username" value="${esc(email)}" autocomplete="username" hidden>
          <label>지금 비밀번호<input name="current" type="password" autocomplete="current-password" required></label>
          <label>새 비밀번호 <span class="muted small">(10자 이상 권장 · 다른 곳에서 쓰지 않는 것)</span><input name="next" type="password" autocomplete="new-password" minlength="8" required></label>
          <label>새 비밀번호 한 번 더<input name="again" type="password" autocomplete="new-password" minlength="8" required></label>
          <div class="acts"><button class="primary" id="pwSave">비밀번호 바꾸기</button></div>
          <p class="muted small">바꾼 뒤에도 이 기기는 로그인된 채로 있습니다. 다른 기기에서는 새 비밀번호로 다시 로그인해야 할 수 있습니다.</p></form>`
        : '<p class="muted">이메일로 로그인한 경우에만 여기서 비밀번호를 바꿀 수 있습니다.</p>'}</section>
      <section class="card"><details><summary><b>이메일 바꾸기 · 관리자 추가 (Supabase에서)</b></summary>
        <ol class="small">
          <li>supabase.com에 로그인 → 교회 프로젝트 → <b>Authentication → Users → Add user → Create new user</b>. 새 이메일과 비밀번호를 넣고 <b>Auto Confirm User</b>를 켠 뒤 만듭니다.</li>
          <li><b>SQL Editor</b>에서 새 계정을 이 교회의 전체 관리자로 등록합니다(아래 안내 페이지의 SQL을 그대로 붙여 넣고 이메일만 바꿈).</li>
          <li>로그아웃 → 관리자 주소(?for=admin)에서 새 이메일로 로그인해 관리 화면이 열리는지 확인합니다.</li>
          <li>이메일을 <b>바꾸는</b> 경우라면, 새 계정이 잘 되는 것을 확인한 뒤 옛 계정을 SQL로 관리자에서 빼고 Users에서 지웁니다.</li>
        </ol></details></section>`;
    },
    bind(ctx) {
      const f = $('#pwForm'); if (!f) return;
      f.onsubmit = async e => {
        e.preventDefault(); const d = new FormData(f), cur = String(d.get('current')), next = String(d.get('next')), again = String(d.get('again'));
        if (next.length < 8) return toast('새 비밀번호는 8자 이상이어야 합니다.');
        if (next !== again) return toast('새 비밀번호 두 칸이 서로 다릅니다.');
        if (next === cur) return toast('지금 비밀번호와 다른 비밀번호를 넣어 주세요.');
        const btn = $('#pwSave'); btn.disabled = true; btn.textContent = '바꾸는 중…';
        try { await root.HamkkeStore.changePassword(cur, next); f.reset(); toast('비밀번호를 바꾸었습니다. 다음 로그인부터 새 비밀번호를 쓰세요.'); }
        catch (err) { toast(err.message); }
        finally { btn.disabled = false; btn.textContent = '비밀번호 바꾸기'; }
      };
    },
  };

  root.HamkkeAdmin = { showCode, downloadTemplate, detectSheets, uid };
})(window);
