/**
 * 효과음 — WebAudio 오실레이터로 즉석 합성한다. 오디오 파일이 하나도 없다.
 * 브라우저는 사용자 조작 전에 소리를 막으므로 첫 터치에서 unlock()을 부른다.
 *
 * ▶ 새 소리를 추가하려면: SFX 테이블에 한 줄만 넣고 game.js에서 playSfx('이름')을 부르면 된다.
 */

/** type: 파형 / f: 시작 주파수 / f2: 끝 주파수(글라이드) / d: 길이(초) / g: 음량 */
const SFX = {
  place:     { type: 'triangle', f: 520, f2: 880, d: 0.12, g: 0.30 },
  upgrade:   { type: 'triangle', f: 660, f2: 1320, d: 0.18, g: 0.32 },
  sell:      { type: 'sine',     f: 520, f2: 260, d: 0.16, g: 0.26 },
  pellet:    { type: 'square',   f: 900, f2: 700, d: 0.045, g: 0.10 },
  dart:      { type: 'sawtooth', f: 1200, f2: 500, d: 0.08, g: 0.13 },
  bomb:      { type: 'square',   f: 300, f2: 140, d: 0.11, g: 0.16 },
  gaze:      { type: 'sine',     f: 1400, f2: 1900, d: 0.09, g: 0.10 },
  thump:     { type: 'sine',     f: 180, f2: 90, d: 0.14, g: 0.26 },
  kill:      { type: 'square',   f: 420, f2: 180, d: 0.09, g: 0.16 },
  boss_down: { type: 'sawtooth', f: 260, f2: 60, d: 0.55, g: 0.34 },
  leak:      { type: 'sawtooth', f: 240, f2: 90, d: 0.35, g: 0.34 },
  wave:      { type: 'triangle', f: 400, f2: 800, d: 0.26, g: 0.28 },
  clear:     { type: 'triangle', f: 700, f2: 1100, d: 0.30, g: 0.28 },
  victory:   { type: 'triangle', f: 520, f2: 1560, d: 0.85, g: 0.36 },
  defeat:    { type: 'sawtooth', f: 420, f2: 70, d: 0.95, g: 0.36 },
  tap:       { type: 'sine',     f: 660, f2: 660, d: 0.035, g: 0.14 },

  // 보스 능력
  shield:       { type: 'sine',     f: 700, f2: 1250, d: 0.24, g: 0.24 },
  shield_break: { type: 'square',   f: 900, f2: 180,  d: 0.30, g: 0.30 },
  summon:       { type: 'sawtooth', f: 320, f2: 620,  d: 0.26, g: 0.24 },
  enrage:       { type: 'sawtooth', f: 180, f2: 420,  d: 0.42, g: 0.32 },
  split:        { type: 'square',   f: 520, f2: 200,  d: 0.24, g: 0.26 },
  boss_in:      { type: 'sawtooth', f: 110, f2: 55,   d: 0.70, g: 0.50 },   // 등장 경고 나팔

  // 밀크 크리스탈
  crystal:     { type: 'sine',     f: 1200, f2: 1800, d: 0.20, g: 0.16 },
  crystal_get: { type: 'triangle', f: 880,  f2: 1760, d: 0.28, g: 0.30 },

  // 플레이어 필살기
  churu:     { type: 'sawtooth', f: 900, f2: 140,  d: 0.60, g: 0.36 },
  nap:       { type: 'sine',     f: 520, f2: 190,  d: 0.70, g: 0.30 },
  milk:      { type: 'triangle', f: 300, f2: 820,  d: 0.55, g: 0.32 },
  goldenpaw: { type: 'triangle', f: 660, f2: 1760, d: 0.65, g: 0.34 },
  revive:    { type: 'triangle', f: 440, f2: 1320, d: 0.75, g: 0.34 },
}


/**
 * 배경음 — 오디오 파일 없이 화음 진행을 실시간으로 연주한다.
 * Am → F → C → G 를 8분음표 아르페지오로 돌리고 마디마다 낮은 베이스를 깐다.
 * 룩어헤드 스케줄러를 쓰기 때문에 브라우저가 바빠도 박자가 밀리지 않는다.
 */
const BPM = 96
const EIGHTH = 30 / BPM // 8분음표 길이(초)
/** 보스가 있을 때 — 단조 진행을 조금 빠르게. 마디 경계에서만 바꿔 튀지 않게 한다. */
const BPM_BOSS = 112
const EIGHTH_BOSS = 30 / BPM_BOSS

/** 4마디 × 8음. 마지막 값은 그 마디의 베이스 음. */
const PROGRESSION = [
  { notes: [220.00, 261.63, 329.63, 440.00, 329.63, 261.63, 220.00, 261.63], bass: 110.00 }, // Am
  { notes: [174.61, 220.00, 261.63, 349.23, 261.63, 220.00, 174.61, 220.00], bass:  87.31 }, // F
  { notes: [130.81, 164.81, 196.00, 261.63, 196.00, 164.81, 130.81, 164.81], bass:  65.41 }, // C
  { notes: [196.00, 246.94, 293.66, 392.00, 293.66, 246.94, 196.00, 246.94], bass:  98.00 }, // G
]

/** 보스 테마 — Dm → B♭ → Gm → A. 같은 형식이라 스케줄러는 표만 바꾼다. */
const PROGRESSION_BOSS = [
  { notes: [146.83, 174.61, 220.00, 293.66, 220.00, 174.61, 146.83, 174.61], bass: 73.42 }, // Dm
  { notes: [116.54, 146.83, 174.61, 233.08, 174.61, 146.83, 116.54, 146.83], bass: 58.27 }, // B♭
  { notes: [ 98.00, 116.54, 146.83, 196.00, 146.83, 116.54,  98.00, 116.54], bass: 49.00 }, // Gm
  { notes: [110.00, 138.59, 164.81, 220.00, 164.81, 138.59, 110.00, 138.59], bass: 55.00 }, // A
]

export class Audio {
  constructor(settings) {
    this.settings = settings
    this.ctx = null
    this.blocked = false
    this.lastAt = new Map() // 같은 소리가 한 프레임에 몰려 터지는 것을 막는다

    this.bgmWanted = false  // 게임 화면에 있는가
    this.bgmTimer = null
    this.bgmStep = 0
    this.bgmNext = 0
    this.bgmMode = 'normal'        // 'normal' | 'boss' — 지금 연주 중인 진행
    this._bgmModeWanted = 'normal' // 다음 마디 경계에서 바꿀 진행
  }

  /** 첫 사용자 조작에서 호출 — 이 전에는 브라우저가 소리를 막는다 */
  unlock() {
    if (this.blocked) return
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (!Ctor) { this.blocked = true; return }
      if (!this.ctx) this.ctx = new Ctor()
      if (this.ctx.state === 'suspended') this.ctx.resume()
      if (this.bgmWanted && !this.bgmTimer) this._startBgm()
    } catch {
      this.blocked = true // 오디오가 없어도 게임은 그대로 돌아간다
    }
  }

  // ------------------------------------------------------------ 배경음

  /** 게임 화면에 들어오면 true, 나가면 false. 설정의 배경음 스위치와 함께 동작한다. */
  setBgm(wanted) {
    this.bgmWanted = wanted
    if (!wanted) this._stopBgm()
    else this._startBgm()
  }

  /** 보스가 전장에 있으면 'boss'. 실제 전환은 마디 경계에서 일어난다. */
  setBgmMode(mode) {
    this._bgmModeWanted = mode === 'boss' ? 'boss' : 'normal'
  }

  _startBgm() {
    if (this.blocked || this.bgmTimer) return
    if (!this.ctx) this.unlock()
    if (!this.ctx) return
    this.bgmNext = this.ctx.currentTime + 0.1
    // 25ms마다 깨어나 200ms 앞까지 미리 예약한다 (탭 전환·프레임 끊김에 강하다)
    this.bgmTimer = setInterval(() => this._scheduleBgm(), 25)
  }

  _stopBgm() {
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null }
    this.bgmStep = 0
  }

  _scheduleBgm() {
    if (!this.ctx) return
    // 설정에서 배경음을 끄면 예약만 멈추고 타이머는 유지한다 (다시 켜면 즉시 이어진다)
    if (!this.settings.bgm) { this.bgmNext = Math.max(this.bgmNext, this.ctx.currentTime + 0.1); return }

    while (this.bgmNext < this.ctx.currentTime + 0.2) {
      // 마디 경계에서만 진행을 바꾼다 — 중간에 바꾸면 화음이 깨져 튄다
      if (this.bgmStep % 8 === 0 && this.bgmMode !== this._bgmModeWanted) {
        this.bgmMode = this._bgmModeWanted
        this.bgmStep = 0
      }
      const boss = this.bgmMode === 'boss'
      const prog = boss ? PROGRESSION_BOSS : PROGRESSION
      const eighth = boss ? EIGHTH_BOSS : EIGHTH
      const bar = prog[Math.floor(this.bgmStep / 8) % prog.length]
      const note = bar.notes[this.bgmStep % 8]

      this._tone(note, this.bgmNext, eighth * 1.6, boss ? 0.05 : 0.055, boss ? 'sawtooth' : 'triangle')
      if (this.bgmStep % 8 === 0) this._tone(bar.bass, this.bgmNext, eighth * 6, boss ? 0.05 : 0.045, boss ? 'square' : 'sine')

      this.bgmNext += eighth
      this.bgmStep += 1
    }
  }

  /** 부드러운 어택/릴리스를 가진 음 하나 */
  _tone(freq, at, dur, gainScale, type) {
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      const vol = Math.max(0.0002, gainScale * this.settings.volume)

      osc.type = type
      osc.frequency.setValueAtTime(freq, at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)

      osc.connect(gain).connect(this.ctx.destination)
      osc.start(at)
      osc.stop(at + dur + 0.03)
    } catch { /* 오디오 실패가 게임을 멈추게 두지 않는다 */ }
  }

  // ------------------------------------------------------------ 효과음

  play(name) {
    if (this.blocked || !this.settings.sfx) return
    const spec = SFX[name]
    if (!spec) return
    if (!this.ctx) this.unlock()
    if (!this.ctx) return

    const now = this.ctx.currentTime
    // 초당 25회 이상 같은 소리는 버린다 (연사 타워가 스피커를 찢지 않게)
    if (now - (this.lastAt.get(name) || -1) < 0.04) return
    this.lastAt.set(name, now)

    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      const vol = spec.g * this.settings.volume

      osc.type = spec.type
      osc.frequency.setValueAtTime(spec.f, now)
      if (spec.f2 !== spec.f) osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), now + spec.d)

      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.d)

      osc.connect(gain).connect(this.ctx.destination)
      osc.start(now)
      osc.stop(now + spec.d + 0.02)
    } catch {
      // 오디오 실패가 게임을 멈추게 두지 않는다
    }
  }
}
