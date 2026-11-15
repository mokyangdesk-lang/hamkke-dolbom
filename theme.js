/* 함께 돌봄 5.0 — 테마: 관리자가 교회 공통으로 색·글꼴·글자 크기를 고릅니다(settings/theme).
   각 기기는 마지막 테마를 기억해 로그인 화면부터 같은 모습으로 보여 줍니다. 시험: tests/web/theme.test.cjs */
(function (root) {
  'use strict';
  // 색: 밝은 화면용(light)과 어두운 화면용(dark) 강조색 한 쌍. 나머지 색은 CSS가 이 색에서 만들어 냅니다.
  const PALETTES = {
    pine: { name: '솔잎', light: '#2E6B4F', dark: '#7FC9A2' },
    ocean: { name: '바다', light: '#285C8E', dark: '#8EBBEA' },
    grape: { name: '포도', light: '#5B4A92', dark: '#B9A8EE' },
    sunset: { name: '노을', light: '#A9522B', dark: '#F0A57E' },
    rose: { name: '장미', light: '#A03E64', dark: '#EE9EBC' },
    olive: { name: '올리브', light: '#5C6A28', dark: '#C3D07F' },
    ink: { name: '먹색', light: '#2D3440', dark: '#C9D1DC' },
  };
  // 글꼴: 웹 글꼴을 못 받으면(인터넷이 느릴 때) 기기 기본 글꼴로 보입니다.
  const FONTS = {
    pretendard: { name: '프리텐다드', note: '깔끔하고 또렷함', css: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', family: '"Pretendard Variable", Pretendard' },
    noto: { name: '본고딕(노토 산스)', note: '단정하고 무난함', css: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap', family: '"Noto Sans KR"' },
    plex: { name: 'IBM 플렉스 산스', note: '반듯하고 현대적', css: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap', family: '"IBM Plex Sans KR"' },
    nanum: { name: '나눔고딕', note: '익숙하고 편안함', css: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap', family: '"Nanum Gothic"' },
    gowun: { name: '고운돋움', note: '부드럽고 따뜻함', css: 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap', family: '"Gowun Dodum"' },
    system: { name: '기기 기본 글꼴', note: '인터넷 없이도 같음', css: '', family: '' },
  };
  const MODES = { light: '밝게', dark: '어둡게', auto: '기기 설정 따라' };
  const SIZES = { xxs: { name: '아주 작게', px: 14 }, xs: { name: '작게', px: 15 }, s: { name: '보통', px: 16 }, m: { name: '크게', px: 17.5 }, l: { name: '아주 크게', px: 19.5 } };
  const DEFAULT = { palette: 'pine', font: 'pretendard', size: 'm', mode: 'light' };
  const FALLBACK = '"Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", sans-serif';
  const KEY = 'hamkke.theme.v1';

  // 저장된 값이 이상해도 항상 쓸 수 있는 테마로 바로잡습니다.
  function normalize(t) {
    t = t || {};
    return { palette: PALETTES[t.palette] ? t.palette : DEFAULT.palette, font: FONTS[t.font] ? t.font : DEFAULT.font, size: SIZES[t.size] ? t.size : DEFAULT.size, mode: MODES[t.mode] ? t.mode : DEFAULT.mode };
  }
  const fromState = state => normalize((state?.settings || []).find(x => x.id === 'theme'));
  // CSS 변수 값(시험하기 쉽게 따로 계산)
  function vars(t) {
    t = normalize(t);
    const p = PALETTES[t.palette], f = FONTS[t.font];
    return { '--accent-l': p.light, '--accent-d': p.dark, '--font': f.family ? `${f.family}, ${FALLBACK}` : FALLBACK, '--base': SIZES[t.size].px + 'px' };
  }
  function remembered() { try { return normalize(JSON.parse(root.localStorage.getItem(KEY) || 'null')); } catch (_) { return { ...DEFAULT }; } }
  function apply(t, remember = true) {
    t = normalize(t);
    const doc = root.document; if (!doc) return t;
    const el = doc.documentElement;
    for (const [k, v] of Object.entries(vars(t))) el.style.setProperty(k, v);
    el.dataset.palette = t.palette;
    el.dataset.mode = t.mode; // 밝게 / 어둡게 / 기기 설정 따라
    const css = FONTS[t.font].css;
    let link = doc.getElementById('themeFont');
    if (css) {
      if (!link) { link = doc.createElement('link'); link.id = 'themeFont'; link.rel = 'stylesheet'; doc.head.appendChild(link); }
      if (link.getAttribute('href') !== css) link.setAttribute('href', css);
    } else if (link) link.remove();
    const meta = doc.querySelector('meta[name=theme-color]'); if (meta) meta.setAttribute('content', PALETTES[t.palette].light);
    if (remember) { try { root.localStorage.setItem(KEY, JSON.stringify(t)); } catch (_) { } }
    return t;
  }
  const api = { PALETTES, FONTS, SIZES, MODES, DEFAULT, normalize, fromState, vars, apply, remembered };
  root.HamkkeTheme = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (root.document) apply(remembered(), false); // 화면이 그려지기 전에 지난 테마로
})(typeof window !== 'undefined' ? window : globalThis);
