/* 함께 돌봄 5.0 — 화면 공용 도구(대화상자, 알림, 확인 창). 브라우저 기본 prompt/confirm 창은 쓰지 않습니다. */
(function (root) {
  'use strict';
  const doc = () => root.document;
  const $ = (s, el) => (el || doc()).querySelector(s);
  const $$ = (s, el) => [...(el || doc()).querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLE = { admin: '전체 관리자', newcomer_pastor: '새가족 담당 목사', newcomer_admin: '새가족 관리자', district_pastor: '교구 목사', committee: '새가족위원', visitor: '심방사역자' };
  const MINISTRY = { admin: ['관리', 'admin'], newcomer_pastor: ['새가족', 'new'], newcomer_admin: ['새가족', 'new'], district_pastor: ['심방', 'visit'], committee: ['새가족', 'new'], visitor: ['심방', 'visit'] };
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
  async function copyText(text, btn) {
    try { await root.navigator.clipboard.writeText(text); toast('복사했습니다.'); }
    catch (_) { const el = btn?.closest('.code-box')?.querySelector('.code'); if (el && root.getSelection) { const r = doc().createRange(); r.selectNodeContents(el); const s = root.getSelection(); s.removeAllRanges(); s.addRange(r); } toast('복사가 막혀 있습니다. 코드를 눌러 선택한 뒤 직접 복사해 주세요.'); }
  }
  root.UI = { $, $$, esc, ROLE, MINISTRY, CREDIT, toast, dialog, closeDialog, ask, formatCode, copyText };
})(typeof window !== 'undefined' ? window : globalThis);
