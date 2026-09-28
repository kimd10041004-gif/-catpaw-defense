/**
 * 문구 사전 — 키는 한국어 원문이다.
 *
 *   tr('웨이브 {n} 시작', { n: 3 })
 *
 * 현재 언어 사전에 그 원문이 있으면 번역을, 없으면 원문을 돌려준다(정직한 폴백 — 빈 칸이나 키 이름을 보이지 않는다).
 * {이름} 자리는 vars 로 채운다. 한국어도 같은 치환을 거치므로 문구는 템플릿 리터럴 대신 이 꼴로 쓴다 —
 * 템플릿은 실행 때 이미 문장이 완성돼 사전 키가 될 수 없다.
 * 사전 값이 함수면 vars 를 받아 문장을 만든다 — 복수형처럼 치환만으로 안 되는 영어 문장용.
 *
 * 언어는 부팅 때 한 번 정해진다(main.js). 레지스트리 문구는 registry.localizeAll(tr) 이 제자리에서 바꾸고,
 * index.html 의 정적 문구는 localizeStatic 이 바꾼다. 그 뒤 만들어지는 문구(tr 호출)는 그때그때 번역된다.
 * 바꾸는 게 설정이면 다시 시작한다 — 이미 바뀐 레지스트리는 되돌릴 수 없다.
 * DOM 을 아는 함수는 localizeStatic 하나뿐이라 나머지는 node 검사가 그대로 돈다.
 *
 * 이름이 t 가 아니라 tr 인 이유: t 는 코드 곳곳에서 타워·시간 변수라 그림자가 진다.
 */
import { EN } from './en.js'

export const LANGUAGES = ['ko', 'en']
const DICTS = { en: EN }
let lang = 'ko'

/** 설정값('auto' | 'ko' | 'en')과 브라우저 언어에서 실제 언어를 정한다. 모르면 한국어(원문). */
export function resolveLanguage(setting, navigatorLanguage) {
  if (LANGUAGES.includes(setting)) return setting
  const nav = String(navigatorLanguage || '').toLowerCase()
  if (!nav) return 'ko'
  return nav.startsWith('ko') ? 'ko' : 'en'
}

export function setLanguage(next) {
  lang = LANGUAGES.includes(next) ? next : 'ko'
  return lang
}

export function currentLanguage() { return lang }

/** toLocaleDateString 등에 줄 로캘 */
export function locale() { return lang === 'en' ? 'en-US' : 'ko-KR' }

export function hasTranslation(text, l = lang) {
  const d = DICTS[l]
  return !!d && Object.prototype.hasOwnProperty.call(d, text)
}

/** {이름} 자리 채우기. 모르는 이름은 그대로 둔다(검사가 자리표시자 불일치를 잡는다). */
export function fill(text, vars) {
  if (!vars) return String(text)
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m))
}

/** 번역. 사전에 없으면 원문. */
export function tr(text, vars) {
  const d = DICTS[lang]
  const v = d && Object.prototype.hasOwnProperty.call(d, text) ? d[text] : undefined
  if (typeof v === 'function') return v(vars || {})
  return fill(v === undefined ? text : v, vars)
}

/** 사전 자체 — 검사·도구용 */
export function dictionary(l) { return DICTS[l] || null }

/**
 * index.html 의 정적 문구. data-i18n 이 붙은 요소의 텍스트 노드를 원문 그대로 키로 써서 번역한다 —
 * 키를 따로 적지 않으므로 HTML 이 한국어 원본이자 사전 키다. 아이콘(svg)은 텍스트 노드가 아니라 건드리지 않는다.
 * data-i18n-attr="title,aria-label" 은 그 속성값을 번역한다. <title> · <html lang> 도 여기서.
 * 한국어면 아무것도 안 한다. 바꾼 개수를 돌려준다.
 */
export function localizeStatic(doc) {
  if (!doc || lang === 'ko') return 0
  let n = 0
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue          // TEXT_NODE 만
      const raw = node.data
      const key = raw.trim()
      if (!key) continue
      const out = tr(key)
      if (out !== key) { node.data = raw.replace(key, out); n += 1 }
    }
  }
  for (const el of doc.querySelectorAll('[data-i18n-attr]')) {
    for (const attr of String(el.getAttribute('data-i18n-attr')).split(',')) {
      const a = attr.trim()
      const key = a && el.getAttribute(a)
      if (!key) continue
      const out = tr(key)
      if (out !== key) { el.setAttribute(a, out); n += 1 }
    }
  }
  if (doc.documentElement) doc.documentElement.setAttribute('lang', lang)
  if (typeof doc.title === 'string' && doc.title) {
    const out = tr(doc.title)
    if (out !== doc.title) { doc.title = out; n += 1 }
  }
  return n
}
