/* 함께 돌봄 5.0 — 문자 예문과 문자 앱 연결. 앱은 문자를 직접 보내지 않고, 문자 앱을 열거나 복사만 합니다.
   문자 앱을 열거나 복사한 것을 "발송 완료"로 기록하지 않습니다. 시험: tests/web/messages.test.cjs */
(function (root) {
  'use strict';
  // {이름} 자리에 받는 분 이름이 들어갑니다. 건강·가정사 같은 내용은 예문에 넣지 않습니다.
  // 끝의 "할렐루야교회 ○○○ 심방사역자 드림"은 예문에 넣지 않고, 문자 보낼 때 고르는 '보내는 사람 서명'으로 붙습니다.
  const DEFAULTS = {
    visit: [
      { key: 'greeting', label: '안부', text: '{이름}님, 평안하신지요? 요즘 어떻게 지내시는지 안부가 궁금해 연락드립니다. 함께 기도할 제목이 있으시면 편하게 말씀해 주세요.' },
      { key: 'schedule', label: '심방 일정', text: '{이름}님, 안녕하세요. 찾아뵙고 인사드리며 함께 예배드리고 싶어 연락드립니다. 편하신 날짜와 시간을 알려 주시면 맞추어 찾아뵙겠습니다.' },
      { key: 'visitThanks', label: '심방 후 감사', text: '{이름}님, 오늘 귀한 시간 내어 맞아 주셔서 감사합니다. 나누어 주신 기도제목을 기억하며 계속 함께 기도하겠습니다. 가정 위에 주님의 평강이 늘 머물기를 바랍니다.' },
      { key: 'birthday', label: '생일', text: '{이름}님, 생일을 진심으로 축하드립니다! 이 땅에 보내 주신 하나님께 감사드리며, 새로운 한 해도 주님의 은혜와 평안이 늘 함께하시기를 기도합니다.' },
      { key: 'again', label: '재연락', text: '{이름}님, 안녕하세요. 지난번에 연락이 닿지 않아 다시 인사드립니다. 바쁘신 중에도 평안하시기를 바라며, 편하실 때 연락 주시면 감사하겠습니다.' },
      { key: 'missYou', label: '오랜만의 안부', text: '{이름}님, 오랜만에 인사드립니다. 한동안 뵙지 못해 안부가 궁금했습니다. 어디에 계시든 주님께서 {이름}님을 지키고 계심을 믿으며 기도합니다. 언제든 반갑게 맞이하겠습니다.' },
      { key: 'worship', label: '주일 예배 초대', text: '{이름}님, 평안하신지요? 이번 주일에 함께 예배드리면 참 좋겠습니다. 오시면 반갑게 인사드리겠습니다. 한 주도 주님 안에서 평안하세요.' },
      { key: 'recovery', label: '건강 회복', text: '{이름}님, 평안하신지요? 하루하루 회복되시기를 기도하고 있습니다. 필요하신 일이 있으시면 언제든 말씀해 주세요.' },
      { key: 'hospital', label: '입원·수술 위로', text: '{이름}님, 소식 듣고 마음 모아 기도하고 있습니다. 치료하시는 주님께서 몸과 마음을 붙들어 주시기를 기도합니다. 찾아뵐 수 있는 때를 알려 주시면 감사하겠습니다.' },
      { key: 'comfort', label: '위로', text: '{이름}님, 마음 깊이 위로를 전합니다. 슬픔 중에도 주님의 위로와 평안이 함께하시기를 기도합니다. 필요하신 일이 있으면 언제든 말씀해 주세요.' },
      { key: 'newStart', label: '새 출발 축하', text: '{이름}님, 새로운 출발을 진심으로 축하드립니다. 걸음마다 주님께서 인도하시고 지혜와 힘을 주시기를 기도합니다.' },
      { key: 'exam', label: '시험·면접 응원', text: '{이름}님, 중요한 날을 앞두고 응원하는 마음으로 연락드립니다. 준비한 모든 것을 평안한 마음으로 펼치실 수 있도록 기도하겠습니다.' },
      { key: 'serveThanks', label: '봉사 감사', text: '{이름}님, 늘 보이지 않는 곳에서 섬겨 주셔서 감사합니다. {이름}님의 수고를 주님께서 기억하시고 넘치게 갚아 주시기를 기도합니다.' },
      { key: 'season', label: '계절 안부', text: '{이름}님, 날씨가 많이 바뀌었습니다. 건강 잘 챙기시고 평안하신지요? 이 계절에도 주님의 돌보심이 {이름}님과 가정 위에 가득하시기를 기도합니다.' },
      { key: 'thanksgiving', label: '추수감사절', text: '{이름}님, 추수감사절을 맞아 인사드립니다. 한 해 동안 베풀어 주신 하나님의 은혜를 함께 감사하며, 가정마다 감사가 넘치기를 기도합니다.' },
      { key: 'christmas', label: '성탄·새해', text: '{이름}님, 성탄을 축하드립니다. 우리를 위해 오신 예수님의 기쁨과 평화가 가정에 가득하시고, 새해에도 주님의 은혜가 함께하시기를 기도합니다.' },
    ],
    new: [
      { key: 'welcome', label: '환영', text: '{이름}님, 할렐루야교회에 오신 것을 진심으로 환영합니다. 함께 신앙의 걸음을 이어가게 되어 참 기쁩니다. 궁금하신 점은 언제든 편하게 물어봐 주세요.' },
      { key: 'firstWeek', label: '등록 후 첫 주', text: '{이름}님, 지난 주일 함께 예배드려 반가웠습니다. 한 주 동안 평안하셨는지요? 이번 주일에도 반갑게 맞이하겠습니다.' },
      { key: 'education', label: '교육 안내', text: '{이름}님, 안녕하세요. 새가족교육(4과목) 안내드립니다. 시간과 장소를 확인해 다시 알려 드리겠습니다. 참석 가능 여부를 알려 주시면 감사하겠습니다.' },
      { key: 'reminder', label: '교육 전날 알림', text: '{이름}님, 내일 새가족교육이 있어 미리 알려 드립니다. 함께 말씀을 나눌 시간을 기대하고 있습니다. 혹시 사정이 생기시면 편하게 말씀해 주세요.' },
      { key: 'absent', label: '결석 안부', text: '{이름}님, 지난 교육 시간에 뵙지 못해 안부 여쭙니다. 평안하신지요? 다음 시간에 뵙기를 기다리겠습니다.' },
      { key: 'makeup', label: '보강', text: '{이름}님, 지난번 빠지신 과목은 다음 순서에 함께하시면 됩니다. 편하신 일정을 알려 주시면 안내드리겠습니다.' },
      { key: 'halfway', label: '교육 격려', text: '{이름}님, 새가족교육에 꾸준히 함께해 주셔서 감사합니다. 말씀 안에서 한 걸음씩 자라 가시는 모습이 참 기쁩니다. 남은 시간도 함께 걸어가요.' },
      { key: 'welcomeDone', label: '교육 수료', text: '{이름}님, 새가족교육 4과목을 모두 마치신 것을 축하드립니다! 이제 새사귐반에서 양육도우미와 함께 더 가까이 교제하게 됩니다. 곧 안내드리겠습니다.' },
      { key: 'mentor', label: '양육도우미 소개', text: '{이름}님, 새사귐반에서 함께할 양육도우미를 소개해 드리려고 연락드립니다. 첫 만남 일정을 함께 정하고 싶습니다.' },
      { key: 'firstMeet', label: '첫 만남 감사', text: '{이름}님, 오늘 만나 이야기 나누어 주셔서 감사합니다. 앞으로 새사귐반에서 함께 말씀과 삶을 나누게 되어 기쁩니다. 다음 만남도 기대하겠습니다.' },
      { key: 'graduate', label: '새사귐 수료', text: '{이름}님, 새사귐반 수료를 축하드립니다. 그동안 함께해 주셔서 감사합니다. 앞으로의 신앙생활도 기쁘게 함께하겠습니다.' },
      { key: 'friends', label: '프렌즈', text: '{이름}님, 교구 프렌즈 모임에 초대합니다. 교구 식구들과 인사 나누는 시간입니다. 일정은 다시 안내드리겠습니다.' },
      { key: 'lovegroup', label: '사랑방 연결', text: '{이름}님, 함께할 사랑방을 안내드리려고 연락드립니다. 사랑방에서 따뜻한 교제가 이어지기를 기도합니다.' },
      { key: 'handover', label: '교구 인계', text: '{이름}님, 새가족 과정을 모두 마치시고 이제 교구 식구가 되셨습니다. 축하드립니다! 교구에서 더 풍성한 교제와 돌봄이 이어지기를 기도합니다.' },
      { key: 'ncMissYou', label: '오랜만의 안부', text: '{이름}님, 한동안 뵙지 못해 안부가 궁금했습니다. 평안하신지요? 언제든 편하실 때 다시 뵙기를 기다리겠습니다. {이름}님을 위해 기도하고 있습니다.' },
    ],
  };
  // 보내는 사람 서명: "할렐루야교회 이세진 목사 드림". 고른 값은 이 기기에 기억합니다.
  const CHURCH = '할렐루야교회';
  const TITLES = ['심방사역자', '새가족위원', '목사'];
  const ROLE_TITLE = { visitor: '심방사역자', committee: '새가족위원', newcomer_admin: '새가족위원', district_pastor: '목사', newcomer_pastor: '목사', admin: '목사' };
  const SENDER_KEY = 'hamkke.sender.v1';
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  function defaultSender(me = {}) {
    const name = clean(me.name) === '관리자' ? '' : clean(me.name);
    return { on: true, name, title: ROLE_TITLE[me.role] || TITLES[0] };
  }
  function loadSender(me = {}) {
    let saved = null;
    try { saved = JSON.parse(root.localStorage?.getItem(SENDER_KEY) || 'null'); } catch (_) { }
    const base = defaultSender(me);
    if (!saved || saved.userId !== me.userId) return base; // 다른 사람이 같은 기기를 쓰면 처음 값으로
    return { on: saved.on !== false, name: clean(saved.name) || base.name, title: clean(saved.title) || base.title };
  }
  function saveSender(me = {}, sender) {
    try { root.localStorage?.setItem(SENDER_KEY, JSON.stringify({ userId: me.userId || null, on: !!sender.on, name: clean(sender.name), title: clean(sender.title) })); } catch (_) { }
  }
  function signature(sender) {
    if (!sender || !sender.on) return '';
    const who = [clean(sender.name), clean(sender.title)].filter(Boolean).join(' ');
    return who ? `${CHURCH} ${who} 드림` : `${CHURCH} 드림`;
  }
  // 받는 분 이름을 채우고, 서명을 켰으면 한 줄 띄워 끝에 붙입니다.
  function compose(text, person, sender) {
    const body = fill(text, person).trim(), sig = signature(sender);
    return sig ? body + '\n\n' + sig : body;
  }
  // 관리자가 고친 교회 공통 예문(settings/messages)이 있으면 그것을, 없으면 기본 예문을 씁니다.
  function templatesFor(state, ministry) {
    const saved = (state.settings || []).find(x => x.id === 'messages')?.[ministry];
    const base = DEFAULTS[ministry] || [];
    if (!Array.isArray(saved)) return base.map(t => ({ ...t }));
    return base.map(t => ({ ...t, ...(saved.find(s => s.key === t.key) || {}) }));
  }
  const fill = (text, person) => String(text || '').split('{이름}').join(String(person?.name || '').trim() || '성도');
  const phoneDigits = p => String(p || '').replace(/[^\d+]/g, '');
  // iPhone은 sms:번호&body=, 그 밖(Android 등)은 sms:번호?body= 를 씁니다.
  function smsHref(phone, body, userAgent = root.navigator?.userAgent || '') {
    const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && root.navigator?.maxTouchPoints > 1);
    return `sms:${phoneDigits(phone)}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`;
  }
  const telHref = phone => 'tel:' + phoneDigits(phone);
  // 휴대폰인지 대략 판단(컴퓨터에서는 "복사하기"를 먼저 보여 줌)
  const isPhone = (ua = root.navigator?.userAgent || '') => /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  const api = { DEFAULTS, TITLES, ROLE_TITLE, templatesFor, fill, smsHref, telHref, phoneDigits, isPhone, defaultSender, loadSender, saveSender, signature, compose };
  root.Messages = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
