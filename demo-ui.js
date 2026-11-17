/* 함께 돌봄 시연 모드 — 위쪽 시연 띠, 인물 바꾸기, 시연 순서 안내.
   실제 앱 화면은 그대로 쓰고, 이 파일은 시연을 돕는 띠와 안내만 얹습니다. */
(function (root) {
  'use strict';
  const D = root.HamkkeDemo, doc = root.document, ls = root.localStorage;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const label = p => p ? `${p.name}${p.title ? ' ' + p.title : ''}` : '';

  // 시연 순서: [묶음, 누구로, 어느 화면, (겸직이면 쓸 역할), 제목, 할 일]
  const STEPS = [
    ['심방', 'visitor', 'today', '', '오늘 할 일 보기', '심방사역자 김은혜 권사의 첫 화면입니다. 오늘 생일인 분, 다시 연락할 날이 된 분, 오래 연락 못 한 분이 저절로 모입니다.'],
    ['심방', 'visitor', 'today', '', '생일 축하 문자 보내기', '"김순자" 권사님 줄의 [문자]를 누르고 예문 "생일"을 고릅니다. 이름이 저절로 들어가고, 끝에 보내는 사람 서명이 붙습니다. 미리 보기 → 문자 앱 열기(컴퓨터에서는 복사).'],
    ['심방', 'visitor', 'today', '', '연락 기록 남기기', '"최옥순" 권사님(다시 연락할 분)의 [기록]을 누르고 통화 완료 · 기도제목 · 다음 연락일을 넣어 저장합니다. 문자 앱을 연 것만으로는 기록되지 않습니다.'],
    ['심방', 'visitor2', 'people', '', '같은 교구 사역자와 명단 공유', '박소망 권사로 바꿔 보면 같은 5교구 명단에 "최근 연락: 김은혜 · 오늘"이 보입니다. 같은 분께 겹쳐 연락하지 않게 됩니다.'],
    ['심방', 'visitor', 'report', '', '주간 보고 승인', '위쪽 [주일 10시로]를 누르면 이번 주 기록이 보고서 초안이 됩니다. 내용을 확인하고 [확인했습니다 · 승인]을 누릅니다.'],
    ['심방', 'pastor', 'reports', '', '교구 목사: 보고 받기', '정목자 목사(5교구)로 바꾸면 사역자별 "승인/대기"가 보입니다. [보고서 보기]로 열고 인쇄·PDF로 저장할 수 있습니다.'],
    ['새가족', 'committee', 'board', '', '새가족 현황판', '새가족위원 이믿음 집사의 첫 화면입니다. 한 분 한 분이 9단계 중 어디에 있는지, 늦어진 단계(빨간 !)가 무엇인지 보입니다.'],
    ['새가족', 'committee', 'board', '', '단계 체크하기', '"최새봄"님 카드에서 환영 전화 칸을 눌러 기록합니다. "박하늘"님은 단톡방 초대를 체크해 보세요. 순서와 상관없이 기록할 수 있습니다.'],
    ['새가족', 'committee', 'board', '', '담당 목사님과 소통', '"이소망"님 카드에 정목자 목사님의 확인 요청 메모가 있습니다. 답 메모를 남기고 [확인]을 누르면 요청이 닫힙니다.'],
    ['새가족', 'committee', 'attendance', '', '4과목 출석 · 보강', '새가족교육 4과목 출석을 기록합니다. 이소망님 3과는 결석이라 "보강"으로 기록할 수 있습니다.'],
    ['새가족', 'npastor', 'matching', 'newcomer_admin', '양육도우미 매칭', '한새벽 목사(새가족 담당 목사 + 새가족 관리자 겸직)입니다. 위쪽 "맡은 역할"이 새가족 관리자인지 보고, 4과목을 마친 "김다윗"님을 같은 교구 도우미와 잇습니다.'],
    ['새가족', 'committee', 'board', '', '새사귐 · 프렌즈 · 사랑방 → 정착', '"강요셉"님은 새사귐 8주 · 프렌즈 · 사랑방까지 마쳤습니다. 정착 칸을 눌러 정착을 확인합니다.'],
    ['새가족', 'pastor', 'handover', '', '교구로 인계 받기', '정목자 목사로 바꾸면 정착한 분이 "인계 받기"에 보입니다. 받으면 새가족 목록에서 빠지고 5교구 심방 명단에 들어갑니다.'],
    ['새가족', 'committee', 'nreport', '', '새가족 주간 보고 승인', '이번 주 단계 변화가 새가족 보고 초안이 됩니다(주일 10시가 지나야 함). 확인하고 승인합니다.'],
    ['새가족', 'npastor', 'nreports', 'newcomer_pastor', '새가족 담당 목사: 보고 받기', '한새벽 목사는 모든 교구의 새가족 보고를 받습니다. 교구 목사님도 자기 교구 새가족 보고를 함께 받습니다.'],
    ['통계', 'pastor', 'stats', '', '교구 통계 한눈에', '정목자 목사(5교구)의 통계입니다. 연락 횟수 · 돌본 비율 · 새가족 정착 단계 · 주간 보고 승인 비율을 그림으로 봅니다. 위에서 기간을 바꿔 보세요.'],
    ['통계', 'admin', 'stats', '', '교회 전체 통계', '전체 관리자는 교구별 돌본 비율과 사역자별 활동까지 봅니다. 엑셀로 받아 분기·연말 보고서에 붙일 수 있습니다.'],
    ['관리', 'admin', 'staff', '', '담당자 등록 · 코드 발급', '전체 관리자 화면입니다. 담당자를 등록하면 코드가 한 번만 보이고, 누르면 바로 들어가는 링크가 든 안내 문자를 보낼 수 있습니다.'],
    ['관리', 'lead', 'today', '', '심방 총괄', '서온유 목사(심방 총괄)는 교구를 골라 모든 교구의 심방 현황과 심방 보고를 봅니다. 새가족 자료와 인적사항 수정은 할 수 없습니다.'],
  ];
  const stepIdx = () => Math.min(Math.max(Number(ls.getItem('demo.step') || 0) || 0, 0), STEPS.length - 1);

  const css = `
  #demoBar{position:relative;z-index:30;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px max(16px,env(safe-area-inset-left));background:var(--ink,#191d1b);color:#fff;font-size:.875rem}
  #demoBar .dm-tag{background:#fff;color:var(--ink,#191d1b);border-radius:99px;padding:2px 10px;font-weight:800;font-size:.8rem}
  #demoBar .dm-who{font-weight:700}#demoBar .dm-time{opacity:.8}
  #demoBar .dm-acts{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
  #demoBar button{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgb(255 255 255/.35);background:transparent;color:#fff;font-size:.85rem;font-weight:700}
  #demoBar button.dm-main{background:#fff;color:var(--ink,#191d1b);border-color:#fff}
  .dm-shade{position:fixed;inset:0;z-index:80;background:rgb(10 14 12/.45);display:grid;place-items:center;padding:16px}
  .dm-box{background:var(--surface,#fff);color:var(--ink,#191d1b);border-radius:20px;width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:22px;box-shadow:0 24px 60px -20px rgb(0 0 0/.4)}
  .dm-box h2{margin:0 0 6px;font-size:1.3rem}.dm-box p{margin:0 0 12px;color:var(--ink-2,#3a413d)}
  .dm-people{display:grid;gap:8px}.dm-people button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;white-space:normal;min-height:60px;padding:10px 14px;border-radius:14px}
  .dm-people button b{font-size:1rem}.dm-people button span{font-size:.85rem;color:var(--muted,#576059);font-weight:500}
  .dm-people button.on{border-color:var(--accent);background:var(--accent-softer)}
  #demoGuide{position:fixed;z-index:70;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));background:var(--surface,#fff);color:var(--ink,#191d1b);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 60px -20px rgb(0 0 0/.35);padding:16px 18px}
  #demoGuide .dm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
  #demoGuide .dm-n{font-size:.8rem;font-weight:800;color:var(--accent-text)}#demoGuide h3{margin:2px 0 6px;font-size:1.05rem}
  #demoGuide p{margin:0 0 10px;font-size:.92rem;line-height:1.55;color:var(--ink-2)}#demoGuide .dm-who2{font-size:.82rem;color:var(--muted)}
  #demoGuide .dm-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}#demoGuide .dm-row button{min-height:42px;padding:0 8px;font-size:.88rem}
  #demoGuide .dm-x{min-height:32px;width:32px;padding:0;border:0;background:transparent;font-size:1.2rem;color:var(--muted)}
  .dm-list{display:grid;gap:4px;margin:8px 0 0;padding:0;list-style:none}.dm-list button{width:100%;justify-content:flex-start;text-align:left;white-space:normal;min-height:40px;font-size:.85rem;font-weight:600;padding:6px 10px}
  .dm-list button.on{border-color:var(--accent);background:var(--accent-softer)}.dm-list .dm-g{font-size:.78rem;font-weight:800;color:var(--accent-text);margin:8px 0 2px}
  @media (max-width:640px){#demoGuide{left:8px;right:8px;bottom:8px;width:auto;padding:12px 14px}#demoBar .dm-acts{margin-left:0;width:100%;display:grid;grid-template-columns:repeat(4,1fr)}#demoBar button{padding:0 6px}}
  body.dm-guide-on .admin-shell{padding-bottom:calc(260px + env(safe-area-inset-bottom))}body.dm-guide-on .page{padding-bottom:260px}`;

  const fmt = d => `${d.getMonth() + 1}월 ${d.getDate()}일(${'일월화수목금토'[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  function bar() {
    const p = D.current(), el = doc.getElementById('demoBar') || doc.createElement('div');
    el.id = 'demoBar'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', '시연 안내');
    el.innerHTML = `<span class="dm-tag">시연</span><span class="dm-who">${p ? esc(label(p)) + ' · ' + esc(p.desc) : '인물을 골라 주세요'}</span><span class="dm-time">가상 자료 · ${esc(fmt(D.demoNow()))}</span>
      <div class="dm-acts"><button type="button" class="dm-main" id="dmPeople">인물 바꾸기</button><button type="button" id="dmGuide">시연 순서</button><button type="button" id="dmSunday" title="주간 보고 초안을 만들기 위해 시연 시각을 주일 오전 10시로 넘깁니다">주일 10시로</button><button type="button" id="dmReset">처음으로</button></div>`;
    if (!el.parentNode) doc.body.insertBefore(el, doc.body.firstChild);
    el.querySelector('#dmPeople').onclick = () => chooser();
    el.querySelector('#dmGuide').onclick = () => { ls.setItem('demo.guide', ls.getItem('demo.guide') === 'off' ? 'on' : 'off'); guide(); };
    el.querySelector('#dmSunday').onclick = () => { const t = D.jumpToSunday10(); toast(`시연 시각을 ${fmt(t)}로 넘겼습니다. 이번 주 기록이 보고서 초안이 됩니다.`); root.setTimeout(() => root.location.reload(), 900); };
    el.querySelector('#dmReset').onclick = async () => { if (await root.UI.ask('처음으로', '시연 자료를 처음 상태로 되돌립니다. 지금까지 넣은 기록은 지워집니다.', '처음으로', true)) { D.reset(); root.location.reload(); } }; // 일부 화면(미리 보기 틀)은 confirm 창을 막으므로 앱의 확인 창을 씀
  }
  function toast(t) { if (root.UI && root.UI.toast) root.UI.toast(t); }
  function modal(html) { const s = doc.createElement('div'); s.className = 'dm-shade'; s.innerHTML = `<div class="dm-box" role="dialog" aria-modal="true">${html}</div>`; doc.body.appendChild(s); s.onclick = e => { if (e.target === s && D.current()) s.remove(); }; return s; }
  function chooser() {
    const cur = D.current();
    const s = modal(`<h2>누구로 볼까요?</h2><p>모두 가상 인물과 가상 자료입니다. 한 사람이 한 일이 다른 사람 화면에 그대로 이어집니다.</p>
      <div class="dm-people">${D.PEOPLE.map(p => `<button type="button" data-p="${p.key}" class="${cur && cur.key === p.key ? 'on' : ''}"><b>${esc(label(p))}</b><span>${esc(p.desc)}${p.district ? ' · ' + esc(p.district) : ''}</span></button>`).join('')}</div>`);
    s.querySelectorAll('[data-p]').forEach(b => b.onclick = () => become(b.dataset.p));
  }
  function become(key, page, role) {
    D.signInAs(key);
    if (page) ls.setItem('demo.goto', JSON.stringify({ page, role: role || '' })); else ls.removeItem('demo.goto');
    root.location.reload();
  }
  function guide() {
    let g = doc.getElementById('demoGuide');
    if (ls.getItem('demo.guide') === 'off') { if (g) g.remove(); doc.body.classList.remove('dm-guide-on'); return; }
    if (!g) { g = doc.createElement('aside'); g.id = 'demoGuide'; g.setAttribute('aria-label', '시연 순서'); doc.body.appendChild(g); }
    doc.body.classList.add('dm-guide-on');
    const i = stepIdx(), [grp, who, , , title, text] = STEPS[i], p = D.PEOPLE.find(x => x.key === who), here = D.current() && D.current().key === who;
    g.innerHTML = `<div class="dm-head"><span class="dm-n">${esc(grp)} · ${i + 1} / ${STEPS.length}</span><span><button type="button" class="dm-x" id="dmAll" title="전체 순서">≡</button><button type="button" class="dm-x" id="dmClose" aria-label="안내 닫기">×</button></span></div>
      <h3>${esc(title)}</h3><p>${esc(text)}</p><p class="dm-who2">이 단계: <b>${esc(label(p))}</b> · ${esc(p.desc)}</p>
      <div class="dm-row"><button type="button" id="dmPrev" ${i ? '' : 'disabled'}>이전</button><button type="button" class="${here ? '' : 'primary'}" id="dmGo">${here ? '이 화면으로' : '이 사람으로'}</button><button type="button" class="primary" id="dmNext" ${i < STEPS.length - 1 ? '' : 'disabled'}>다음</button></div>`;
    const go = n => { ls.setItem('demo.step', String(n)); const s = STEPS[n]; if (D.current() && D.current().key === s[1]) { open(s); guide(); } else become(s[1], s[2], s[3]); };
    g.querySelector('#dmPrev').onclick = () => go(i - 1);
    g.querySelector('#dmNext').onclick = () => go(i + 1);
    g.querySelector('#dmGo').onclick = () => go(i);
    g.querySelector('#dmClose').onclick = () => { ls.setItem('demo.guide', 'off'); guide(); };
    g.querySelector('#dmAll').onclick = () => {
      let last = '';
      const s = modal(`<h2>시연 순서</h2><p>단계를 누르면 그 사람, 그 화면으로 바로 갑니다.</p><ul class="dm-list">${STEPS.map((x, n) => { const head = x[0] !== last ? `<li class="dm-g">${esc(x[0])}</li>` : ''; last = x[0]; return head + `<li><button type="button" data-s="${n}" class="${n === i ? 'on' : ''}">${n + 1}. ${esc(x[4])} — ${esc(label(D.PEOPLE.find(p => p.key === x[1])))}</button></li>`; }).join('')}</ul>`);
      s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { s.remove(); go(Number(b.dataset.s)); });
    };
  }
  function open(s) {
    const A = root.HamkkeApp; if (!A) return;
    if (s[3]) A.switchRole(s[3]);
    if (s[2]) A.ctx().go(s[2]);
  }
  // 앱이 그려질 때까지 기다렸다가, 인물을 바꾸며 정해 둔 화면으로 이동합니다.
  function afterBoot() {
    let tries = 0;
    const t = root.setInterval(() => {
      const st = root.HamkkeStore && root.HamkkeStore.status();
      if (st && st.signedIn && doc.querySelector('#main.page')) {
        root.clearInterval(t);
        const want = ls.getItem('demo.goto'); ls.removeItem('demo.goto');
        if (want) { try { const w = JSON.parse(want); open(['', '', w.page, w.role]); } catch (_) { } }
      } else if (++tries > 80) root.clearInterval(t);
    }, 100);
  }
  function start() {
    const style = doc.createElement('style'); style.textContent = css; doc.head.appendChild(style);
    bar(); if (ls.getItem('demo.guide') == null) ls.setItem('demo.guide', 'on'); guide();
    if (!D.current()) chooser(); else afterBoot();
    root.setInterval(() => { const el = doc.querySelector('#demoBar .dm-time'); if (el) el.textContent = '가상 자료 · ' + fmt(D.demoNow()); }, 30000);
  }
  root.HamkkeDemoUI = { STEPS };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(window);
