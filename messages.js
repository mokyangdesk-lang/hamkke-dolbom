/* 함께 돌봄 5.0 — 문자 예문과 문자 앱 연결. 앱은 문자를 직접 보내지 않고, 문자 앱을 열거나 복사만 합니다.
   문자 앱을 열거나 복사한 것을 "발송 완료"로 기록하지 않습니다. 시험: tests/web/messages.test.cjs */
(function (root) {
  'use strict';
  // {이름} 자리에 받는 분 이름이 들어갑니다. 건강·가정사 같은 내용은 예문에 넣지 않습니다.
  const DEFAULTS = {
    visit: [
      { key: 'greeting', label: '안부', text: '{이름}님, 평안하신지요? 할렐루야교회입니다. 요즘 어떻게 지내시는지 안부가 궁금해 연락드립니다. 함께 기도할 제목이 있으시면 편하게 말씀해 주세요.' },
      { key: 'schedule', label: '심방 일정', text: '{이름}님, 안녕하세요. 할렐루야교회입니다. 찾아뵙고 인사드리고 싶어 연락드립니다. 편하신 날짜와 시간을 알려 주시면 맞추어 찾아뵙겠습니다.' },
      { key: 'birthday', label: '생일', text: '{이름}님, 생일을 진심으로 축하드립니다. 새로운 한 해도 주님의 은혜와 평안이 늘 함께하시기를 기도합니다. 할렐루야교회 드림' },
      { key: 'recovery', label: '건강 회복', text: '{이름}님, 평안하신지요? 할렐루야교회입니다. 하루하루 회복되시기를 기도하고 있습니다. 필요하신 일이 있으시면 언제든 말씀해 주세요.' },
      { key: 'comfort', label: '위로', text: '{이름}님, 마음 깊이 위로를 전합니다. 주님의 위로와 평안이 함께하시기를 기도합니다. 할렐루야교회 드림' },
      { key: 'again', label: '재연락', text: '{이름}님, 안녕하세요. 할렐루야교회입니다. 지난번에 연락이 닿지 않아 다시 인사드립니다. 편하실 때 연락 주시면 감사하겠습니다.' },
    ],
    new: [
      { key: 'welcome', label: '환영', text: '{이름}님, 할렐루야교회에 오신 것을 환영합니다. 함께 신앙의 걸음을 이어가게 되어 기쁩니다. 궁금하신 점은 언제든 편하게 물어봐 주세요.' },
      { key: 'education', label: '교육 안내', text: '{이름}님, 안녕하세요. 새가족교육(4과목) 안내드립니다. 시간과 장소를 확인해 다시 알려 드리겠습니다. 참석 가능 여부를 알려 주시면 감사하겠습니다.' },
      { key: 'absent', label: '결석 안부', text: '{이름}님, 지난 교육 시간에 뵙지 못해 안부 여쭙니다. 평안하신지요? 다음 시간에 뵙기를 기다리겠습니다.' },
      { key: 'makeup', label: '보강', text: '{이름}님, 지난번 빠지신 과목은 다음 순서에 함께하시면 됩니다. 편하신 일정을 알려 주시면 안내드리겠습니다.' },
      { key: 'mentor', label: '양육도우미 소개', text: '{이름}님, 새사귐반에서 함께할 양육도우미를 소개해 드리려고 연락드립니다. 첫 만남 일정을 함께 정하고 싶습니다.' },
      { key: 'graduate', label: '수료', text: '{이름}님, 새사귐반 수료를 축하드립니다. 그동안 함께해 주셔서 감사합니다. 앞으로의 신앙생활도 기쁘게 함께하겠습니다.' },
      { key: 'friends', label: '프렌즈', text: '{이름}님, 교구 프렌즈 모임에 초대합니다. 교구 식구들과 인사 나누는 시간입니다. 일정은 다시 안내드리겠습니다.' },
      { key: 'lovegroup', label: '사랑방 연결', text: '{이름}님, 함께할 사랑방을 안내드리려고 연락드립니다. 사랑방에서 따뜻한 교제가 이어지기를 기도합니다.' },
    ],
  };
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

  const api = { DEFAULTS, templatesFor, fill, smsHref, telHref, phoneDigits, isPhone };
  root.Messages = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
