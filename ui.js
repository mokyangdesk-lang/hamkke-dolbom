/* 함께 돌봄 5.0 — 화면 공용 도구(대화상자, 알림, 확인 창). 브라우저 기본 prompt/confirm 창은 쓰지 않습니다. */
(function (root) {
  'use strict';
  const doc = () => root.document;
  const $ = (s, el) => (el || doc()).querySelector(s);
  const $$ = (s, el) => [...(el || doc()).querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLE = { admin: '전체 관리자', newcomer_pastor: '새가족 담당 목사', newcomer_admin: '새가족 관리자', district_pastor: '교구 목사', committee: '새가족위원', visitor: '심방사역자', visit_lead: '심방 총괄' };
  const MINISTRY = { admin: ['관리', 'admin'], newcomer_pastor: ['새가족', 'new'], newcomer_admin: ['새가족', 'new'], district_pastor: ['심방', 'visit'], committee: ['새가족', 'new'], visitor: ['심방', 'visit'], visit_lead: ['심방', 'visit'] };
  const CREDIT = 'AI 목양지원센터 · mokyangdesk.com';

  function toast(message) {
    const t = $('#toast'); if (!t) return;
    t.textContent = message; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 4500);
  }
  function dialog(title, html) {
    const d = $('#dialog'), body = $('#dialogBody');
    body.innerHTML = `<h2 class="dialog-title">${esc(title)}</h2>${html}`;
    if (!d.open) d.showModal ? d.showModal() : d.setAttribute('open', '');
    return body;
  }
  // 닫을 때 내용을 지웁니다(접속 코드가 화면에 남지 않게).
  function closeDialog() { const d = $('#dialog'); $('#dialogBody').innerHTML = ''; if (d.open) d.close ? d.close() : d.removeAttribute('open'); }
  function ask(title, message, okLabel = '확인', danger = false) {
    return new Promise(resolve => {
      const body = dialog(title, `<p>${esc(message)}</p><div class="acts"><button type="button" class="quiet" data-ask="no">취소</button><button type="button" class="${danger ? 'danger-fill' : 'primary'}" data-ask="yes">${esc(okLabel)}</button></div>`);
      const done = v => { closeDialog(); resolve(v); };
      $('[data-ask=yes]', body).onclick = () => done(true);
      $('[data-ask=no]', body).onclick = () => done(false);
    });
  }
  // 코드 입력: 대문자로 바꾸고 5자리마다 - 를 넣습니다.
  function formatCode(v) { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20); return (s.match(/.{1,5}/g) || []).join('-'); }
  // 받은 문자에서 이름·코드 읽기: 바로 로그인 링크(#n=…&c=…) 또는 "이름: … / 코드: …" 줄. 문자 전체를 붙여 넣어도 됩니다.
  function readInvite(text) {
    const t = String(text || '');
    let name = '', code = '';
    const h = t.match(/[#&]n=([^&\s]+)&c=([A-Za-z0-9-]{20,24})/);
    if (h) { try { name = decodeURIComponent(h[1]); } catch (_) { name = h[1]; } code = h[2]; }
    if (!code) { const c = t.match(/\b([A-Za-z2-9]{5})-?([A-Za-z2-9]{5})-?([A-Za-z2-9]{5})-?([A-Za-z2-9]{5})\b/); if (c) code = c.slice(1).join(''); }
    if (!name) { const n = t.match(/이름\s*[:：]\s*([^\n\r]+)/); if (n) name = n[1].split(/코드\s*[:：]|주소\s*[:：]/)[0].trim(); }
    code = formatCode(code);
    return code.length === 23 ? { name: name.replace(/\s+/g, ' ').trim(), code } : null;
  }
  async function copyText(text, btn) {
    try { await root.navigator.clipboard.writeText(text); toast('복사했습니다.'); }
    catch (_) { const el = btn?.closest('.code-box')?.querySelector('.code'); if (el && root.getSelection) { const r = doc().createRange(); r.selectNodeContents(el); const s = root.getSelection(); s.removeAllRanges(); s.addRange(r); } toast('복사가 막혀 있습니다. 코드를 눌러 선택한 뒤 직접 복사해 주세요.'); }
  }
  // 찾기: 이름(띄어쓰기 무시) 또는 전화번호 숫자(3자리 이상, 하이픈 무시)·ID가 들어 있으면 맞는 것으로 봅니다.
  const norm = v => String(v ?? '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
  function matches(p, q) {
    const k = norm(q); if (!k) return true;
    if (norm(p?.name).includes(k) || norm(p?.id).includes(k)) return true;
    const d = k.replace(/\D/g, '');
    return d.length >= 3 && d.length === k.replace(/-/g, '').length && String(p?.phone || '').replace(/\D/g, '').includes(d);
  }
  // 입력하는 대로 찾기: 잠깐 멈추면 화면을 다시 그리고 입력 칸에 커서를 돌려놓습니다.
  // 한글 조합 중(ㄱ→가→각)에는 다시 그리지 않아 글자가 끊기지 않습니다.
  function liveSearch(id, apply, render) {
    const q = $('#' + id); if (!q) return;
    let timer = null;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => {
      apply(q.value.trim()); render();
      const n = $('#' + id); if (n) { n.focus(); const L = n.value.length; try { n.setSelectionRange(L, L); } catch (_) { } }
    }, 300); };
    q.addEventListener('input', e => { if (!e.isComposing) run(); });
    q.addEventListener('compositionend', run);
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); clearTimeout(timer); apply(q.value.trim()); render(); const n = $('#' + id); if (n) n.focus(); } });
  }
  // 브라우저 탭·홈 화면에 붙는 역할 이름(새가족 담당 목사·새가족 관리자는 '새가족팀')
  const TITLE = { admin: '관리자', newcomer_pastor: '새가족팀', newcomer_admin: '새가족팀', district_pastor: '교구 목사', committee: '새가족위원', visitor: '심방사역자', visit_lead: '심방 총괄' };
  const setTitle = label => { try { root.document.title = label ? '함께 돌봄 · ' + label : '함께 돌봄'; } catch (_) { } };
  // 계정의 모든 역할(기본 역할 + 겸직)
  const rolesOf = x => [...new Set([x?.role, ...(Array.isArray(x?.extra_roles) ? x.extra_roles : [])].filter(Boolean))];
  root.UI = { TITLE, setTitle, rolesOf, $, $$, esc, ROLE, MINISTRY, CREDIT, toast, dialog, closeDialog, ask, formatCode, readInvite, copyText, matches, liveSearch };
})(typeof window !== 'undefined' ? window : globalThis);
