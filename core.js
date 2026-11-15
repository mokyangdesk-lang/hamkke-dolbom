/* 함께 돌봄 5.0 — 화면과 상관없는 계산(날짜, 교육, 매칭 후보, 엑셀 미리보기). 시험: tests/web/core.test.cjs, import.test.cjs */
(function (root) {
  'use strict';
  const KINDS = ['people', 'progress', 'education', 'visits', 'notes', 'reports', 'mentors', 'settings'];
  const empty = () => Object.fromEntries(KINDS.map(k => [k, []]));
  function iso(d = new Date()) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
  const validDate = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '') && iso(new Date(x + 'T12:00:00')) === x;
  function weekStart(value = iso()) { const d = new Date(value + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
  const digits = v => String(v || '').replace(/\D/g, '');
  const nameKey = v => String(v || '').normalize('NFC').replace(/\s+/g, '');

  // 교구 목록(설정). [{name, visitors}] — visitors=false면 심방사역자가 없는 교구(예: 청장년교구)
  function groups(state) {
    const g = (state.settings || []).find(x => x.id === 'groups');
    return (g?.districts || []).map(x => typeof x === 'string' ? { name: x, visitors: true } : { name: String(x.name), visitors: x.visitors !== false });
  }
  // 엑셀의 교구 표기를 등록된 교구 이름으로 맞춥니다: "3", "3 교구", "제3교구", "03교구" → "3교구". 청장년 → "청장년교구".
  function matchDistrict(raw, known) {
    const v = String(raw || '').trim();
    if (!v || !known.length || known.includes(v)) return v;
    const squash = s => String(s).replace(/\s+/g, '').replace(/^제/, '');
    const num = squash(v).match(/^0*(\d+)(교구)?$/);
    if (num) { const hit = known.find(k => squash(k).replace(/^0*/, '') === num[1] + '교구'); if (hit) return hit; }
    const hit = known.find(k => squash(k) === squash(v) || squash(k) === squash(v) + '교구');
    return hit || v;
  }
  const DEFAULT_GROUPS =[...Array.from({ length: 8 }, (_, i) => ({ name: (i + 1) + '교구', visitors: true })), { name: '청장년교구', visitors: false }];

  function completed(state, id, course) {
    const max = course === 'welcome' ? 4 : course === 'fellowship' ? 8 : 0;
    return new Set(state.education.filter(e => e.personId === id && e.course === course && e.status === 'completed' && /^\d+$/.test(String(e.subject)) && Number(e.subject) >= 1 && Number(e.subject) <= max).map(e => String(Number(e.subject))));
  }
  const welcomeCompleted = (state, id) => completed(state, id, 'welcome').size;
  // 도우미가 지금 맡고 있는 인원(새사귐 8주를 마친 분은 뺌)
  const mentorLoad = (state, m) => state.people.filter(x => x.mentorId === m.id && completed(state, x.id, 'fellowship').size < 8).length;
  function mentorCandidates(state, p) {
    return state.mentors.filter(m => m.district === p.district && m.trained && m.active && mentorLoad(state, m) < Number(m.capacity || 0))
      .sort((a, b) => mentorLoad(state, a) - mentorLoad(state, b) || String(a.name).localeCompare(String(b.name), 'ko'));
  }
  // 매칭을 기다리는 새가족: 4과목을 마쳤고 아직 도우미가 없음
  const waitingForMatch = state => state.people.filter(p => p.newcomer && !p.mentorId && welcomeCompleted(state, p.id) === 4);

  // 교육 기록. 매칭은 새가족 관리자가 직접 하므로 여기서 자동 배정하지 않습니다.
  function upsertEducation(state, e) {
    const max = e.course === 'welcome' ? 4 : e.course === 'fellowship' ? 8 : 0;
    if (!state.people.some(p => p.id === e.personId) || !Number.isInteger(Number(e.subject)) || Number(e.subject) < 1 || Number(e.subject) > max || !['completed', 'absent', 'makeup'].includes(e.status) || !validDate(e.date))
      throw Error('교육 기록의 대상·과목·날짜·상태를 확인하세요.');
    if (e.course === 'fellowship' && welcomeCompleted(state, e.personId) < 4) throw Error('새가족교육 4과목을 마친 뒤 새사귐반을 기록하세요.');
    e.subject = String(Number(e.subject));
    const old = state.education.find(x => x.personId === e.personId && x.course === e.course && String(x.subject) === e.subject);
    if (old) Object.assign(old, e, { id: old.id }); else state.education.push(e);
    return old || e;
  }

  function birthdayDistance(p, today = iso()) {
    const now = new Date(today + 'T12:00:00'); let target;
    if (p.birthCalendar === 'lunar') { if (!p.birthdayThisYear) return null; target = new Date(p.birthdayThisYear + 'T12:00:00'); if (target.getFullYear() !== now.getFullYear()) return null; }
    else { if (!/^\d{4}-\d\d-\d\d$/.test(p.birthDate || '')) return null; const md = p.birthDate.slice(5); target = new Date(now.getFullYear() + '-' + md + 'T12:00:00'); if (iso(target).slice(5) !== md) return null; }
    let diff = Math.round((target - now) / 86400000);
    if (p.birthCalendar !== 'lunar') { const y = now.getFullYear(); const next = new Date((y + 1) + '-' + p.birthDate.slice(5) + 'T12:00:00'), prev = new Date((y - 1) + '-' + p.birthDate.slice(5) + 'T12:00:00'); if (diff > 180) diff = Math.round((prev - now) / 86400000); if (diff < -180) diff = Math.round((next - now) / 86400000); }
    return diff;
  }

  // ── 엑셀 명단
  const SHEETS = {
    성도명단: { kind: 'people', newcomer: false, map: { 성도ID: 'id', 이름: 'name', 휴대전화: 'phone', 교구: 'district', 생년월일: 'birthDate', 생일기준: 'birthCalendar', 올해생일: 'birthdayThisYear', 비고: 'notes' } },
    새가족명단: { kind: 'people', newcomer: true, map: { 새가족ID: 'id', 이름: 'name', 휴대전화: 'phone', 교구: 'district', 생년월일: 'birthDate', 생일기준: 'birthCalendar', 올해생일: 'birthdayThisYear', 등록일: 'registeredAt', 양육도우미ID: 'mentorId', 섬김이ID: 'mentorId', 비고: 'notes' } },
    양육도우미명단: { kind: 'mentors', map: { 양육도우미ID: 'id', 섬김이ID: 'id', 이름: 'name', 휴대전화: 'phone', 교구: 'district', 양육교육이수: 'trained', 활동상태: 'active', 배정가능인원: 'capacity' } },
  };
  const ALIASES = { 섬김이명단: '양육도우미명단' }; // 4.x 양식도 읽습니다.

  /* previewImport(state, sheets, {allow:[시트 이름들]})
     errors: 고쳐야 적용 가능 / warnings: 확인 후 적용 가능(같은 분일 수 있음 — 자동으로 합치지 않음) */
  function previewImport(state, rawSheets, opts = {}) {
    const errors = [], warnings = [], items = [];
    const allow = opts.allow || Object.keys(SHEETS);
    const known = groups(state).map(g => g.name);
    const sheets = {};
    for (const [n, rows] of Object.entries(rawSheets || {})) sheets[ALIASES[n] || n] = rows;
    for (const n of Object.keys(sheets)) if (SHEETS[n] && !allow.includes(n) && (sheets[n] || []).some(r => Object.values(r).some(v => String(v).trim()))) errors.push(`'${n}' 시트는 이 계정으로 올릴 수 없습니다.`);
    const fileSeen = new Map();
    for (const [sheet, def] of Object.entries(SHEETS)) {
      if (!allow.includes(sheet)) continue;
      const seen = new Set();
      for (const [i, row] of (sheets[sheet] || []).entries()) {
        const item = {};
        for (const [k, v] of Object.entries(def.map)) if (row[k] !== undefined && String(row[k]).trim() !== '') item[v] = String(row[k]).trim();
        if (!Object.keys(item).length) continue;
        const label = `${sheet} ${i + 2}행`;
        if (!item.id) { errors.push(label + ': 고유 ID가 필요합니다.'); continue; }
        if (seen.has(item.id)) { errors.push(label + ': 같은 ID가 두 번 있습니다 ' + item.id); continue; }
        seen.add(item.id);
        const list = state[def.kind], existing = list.find(x => x.id === item.id);
        if (!item.name && !existing) { errors.push(label + ': 이름이 필요합니다.'); continue; }
        if (item.district) item.district = matchDistrict(item.district, known);
        const district = item.district ?? existing?.district;
        if (!district) errors.push(label + ': 교구가 필요합니다.');
        else if (known.length && !known.includes(district)) errors.push(label + `: '${district}'는 등록된 교구 이름이 아닙니다.`);
        for (const key of ['birthDate', 'birthdayThisYear', 'registeredAt']) if (item[key] && !validDate(item[key])) errors.push(label + ': 날짜는 YYYY-MM-DD 형식이어야 합니다.');
        if (def.kind === 'people') {
          if (existing && def.newcomer && existing.newcomer === false) errors.push(label + ': 이미 교구로 인계된 분입니다. 새가족명단으로 다시 올릴 수 없습니다.');
          if (existing && !def.newcomer && existing.newcomer === true) errors.push(label + ': 새가족 과정 중인 분입니다. 새가족명단에서 관리해 주세요.');
          if (!existing) item.newcomer = def.newcomer;
          if (item.birthCalendar) {
            if (!['양력', '음력', 'solar', 'lunar'].includes(item.birthCalendar)) errors.push(label + ': 생일기준은 양력 또는 음력입니다.');
            item.birthCalendar = ['음력', 'lunar'].includes(item.birthCalendar) ? 'lunar' : 'solar';
          }
          // 같은 분일 수 있는 기록: 경고만 하고 자동으로 합치지 않습니다.
          if (!existing) {
            const others = state.people.filter(x => x.id !== item.id);
            const byPhone = item.phone && digits(item.phone).length >= 8 && others.find(x => digits(x.phone) === digits(item.phone));
            const byName = others.filter(x => nameKey(x.name) === nameKey(item.name));
            if (byPhone) warnings.push(`${label}: ${item.name}님과 전화번호가 같은 기록(${byPhone.id} ${byPhone.name})이 이미 있습니다. 같은 분이면 기존 ID로 고쳐 주세요.`);
            else if (byName.length) warnings.push(`${label}: 같은 이름의 기록(${byName.map(x => x.id).join(', ')})이 있습니다. 동명이인일 수 있어 자동으로 합치지 않습니다.`);
          }
          const ph = digits(item.phone || existing?.phone), nk = nameKey(item.name || existing?.name), fk = nk + '|' + ph;
          if (ph && fileSeen.has(fk) && fileSeen.get(fk) !== item.id) warnings.push(`${label}: 파일 안에 이름·전화번호가 같은 다른 ID(${fileSeen.get(fk)})가 있습니다.`);
          else if (fileSeen.has(nk) && fileSeen.get(nk) !== item.id) warnings.push(`${label}: 파일 안에 같은 이름의 다른 ID(${fileSeen.get(nk)})가 있습니다. 동명이인일 수 있어 자동으로 합치지 않습니다.`);
          if (ph) fileSeen.set(fk, item.id);
          if (!fileSeen.has(nk)) fileSeen.set(nk, item.id);
        } else {
          for (const k of ['trained', 'active']) if (item[k] !== undefined) {
            if (!['이수', '미이수', '활동중', '활동중지', '예', '아니오', 'true', 'false'].includes(item[k])) errors.push(label + ': 교육 이수·활동 상태 값이 올바르지 않습니다.');
            item[k] = ['이수', '활동중', '예', 'true'].includes(item[k]);
          }
          if (item.capacity !== undefined) { item.capacity = Number(item.capacity); if (!Number.isInteger(item.capacity) || item.capacity < 0) errors.push(label + ': 배정가능인원은 0 이상의 정수입니다.'); }
        }
        items.push({ sheet, kind: def.kind, item, existing: !!existing });
      }
    }
    const mentorIds = new Set([...state.mentors.map(x => x.id), ...items.filter(x => x.kind === 'mentors').map(x => x.item.id)]);
    for (const x of items) if (x.kind === 'people' && x.item.mentorId && !mentorIds.has(x.item.mentorId)) errors.push(x.item.id + ': 없는 양육도우미ID ' + x.item.mentorId);
    // 미리 합쳐 보고 매칭 조건을 검사합니다(서버도 다시 검사함).
    const merged = JSON.parse(JSON.stringify(state));
    for (const x of items) { const list = merged[x.kind], old = list.find(p => p.id === x.item.id); if (old) Object.assign(old, x.item); else list.push({ ...x.item }); }
    for (const x of items.filter(x => x.kind === 'people' && x.item.mentorId)) {
      const p = merged.people.find(p => p.id === x.item.id), m = merged.mentors.find(m => m.id === p.mentorId);
      if (!m) continue;
      if (m.district !== p.district || !m.trained || !m.active) errors.push(p.id + ': 같은 교구의, 교육을 마치고 활동 중인 양육도우미만 정할 수 있습니다.');
      if (welcomeCompleted(merged, p.id) < 4) errors.push(p.id + ': 새가족교육 4과목을 마친 뒤 양육도우미를 정할 수 있습니다.');
      if (mentorLoad(merged, m) > Number(m.capacity || 0)) errors.push(p.id + ': 양육도우미의 배정가능인원을 넘습니다.');
    }
    return { errors, warnings, items };
  }
  // 빈칸은 기존 값을 지우지 않습니다. 경고는 화면에서 확인을 받은 뒤에만 적용합니다.
  function applyImport(state, preview) {
    if (preview.errors.length) throw Error('오류를 먼저 고쳐 주세요.');
    for (const x of preview.items) { const list = state[x.kind], old = list.find(a => a.id === x.item.id); if (old) Object.assign(old, x.item); else list.push({ ...x.item }); }
    return state;
  }

  root.MinistryCore = { KINDS, empty, matchDistrict, iso, validDate, weekStart, groups, DEFAULT_GROUPS, completed, welcomeCompleted, mentorLoad, mentorCandidates, waitingForMatch, upsertEducation, birthdayDistance, SHEETS, previewImport, applyImport };
  if (typeof module !== 'undefined') module.exports = root.MinistryCore;
})(typeof window !== 'undefined' ? window : globalThis);
