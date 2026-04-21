// 魔王そだて - main script
// All comments in English per project rules, UI text in Japanese.
(() => {
  'use strict';

  // ==================== Constants ====================
  const STORAGE_KEY = 'mao_sodate_save_v1';
  const SHARE_URL = 'https://maxtakaharu34-cmd.github.io/mao-sodate/';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Evolution stage thresholds (unlocked when level >= threshold).
  const STAGES = [
    { id: 0, minLv: 1,   label: '呪われた卵' },
    { id: 1, minLv: 5,   label: 'ベビー魔王' },
    { id: 2, minLv: 20,  label: 'こ魔王' },
    { id: 3, minLv: 50,  label: '成魔王' },
    { id: 4, minLv: 100, label: '暗黒大魔王' }
  ];
  function currentStage(lv) {
    let s = STAGES[0];
    for (const st of STAGES) if (lv >= st.minLv) s = st;
    return s;
  }

  const expForLevel = (lv) => Math.floor(20 + lv * 12 + lv * lv * 0.5);

  // ==================== DOM ====================
  const $ = (id) => document.getElementById(id);
  const lvEl = $('lv');
  const expBar = $('exp-bar');
  const hungerVal = $('hunger-val');
  const hungerBar = $('hunger-bar');
  const moodVal = $('mood-val');
  const moodBar = $('mood-bar');
  const ageVal = $('age-val');
  const ageBar = $('age-bar');
  const nameEl = $('name');
  const monsterSvg = $('monster');
  const monsterWrap = $('monster-wrap');
  const floaters = $('floaters');
  const levelupEl = $('levelup');
  const evolveEl = $('evolve');
  const evolveText = $('evolve-text');
  const bubble = $('bubble');
  const startOverlay = $('start-overlay');
  const startName = $('start-name');
  const btnStart = $('btn-start');
  const btnRename = $('btn-rename');
  const btnShare = $('btn-share');
  const btnMute = $('btn-mute');
  const btnReset = $('btn-reset');
  const deathOverlay = $('death-overlay');
  const deathMsg = $('death-msg');
  const btnRestart = $('btn-restart');
  const actionBtns = document.querySelectorAll('.act-btn');

  // ==================== Audio ====================
  const Sound = (() => {
    let ac = null;
    let muted = localStorage.getItem('mao_muted') === '1';
    const ensure = () => {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    };
    const beep = (freq, dur, type = 'sine', gain = 0.15) => {
      if (muted) return;
      const a = ensure();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    };
    const chord = (freqs, dur, type = 'triangle', gain = 0.1) => {
      freqs.forEach((f) => beep(f, dur, type, gain));
    };
    return {
      prime: () => ensure(),
      eat:    () => beep(660, 0.08, 'triangle', 0.15),
      play:   () => chord([523, 659, 784], 0.18, 'triangle', 0.12),
      train:  () => { beep(110, 0.08, 'square', 0.2); setTimeout(() => beep(82, 0.15, 'sawtooth', 0.2), 60); },
      praise: () => chord([523, 784, 1047], 0.25, 'sine', 0.1),
      levelUp:() => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'triangle', 0.2), i * 80)),
      evolve: () => {
        [220, 277, 330, 415, 494, 554, 659, 831].forEach((f, i) =>
          setTimeout(() => beep(f, 0.18, 'square', 0.18), i * 110)
        );
      },
      die:    () => [440, 330, 220, 110].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.22), i * 160)),
      err:    () => beep(180, 0.2, 'sawtooth', 0.2),
      toggleMute: () => {
        muted = !muted;
        localStorage.setItem('mao_muted', muted ? '1' : '0');
        return muted;
      },
      isMuted: () => muted
    };
  })();
  btnMute.textContent = Sound.isMuted() ? '🔇' : '🔊';

  // ==================== State ====================
  const defaultState = () => ({
    name: 'ダーク',
    lv: 1,
    exp: 0,
    hunger: 50,
    mood: 80,
    ageSec: 0,
    lastTs: Date.now(),
    stageId: 0,
    isDead: false,
    born: Date.now()
  });
  let state = loadState() || null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (typeof s !== 'object' || !s) return null;
      return s;
    } catch {
      return null;
    }
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ==================== SVG helpers ====================
  // Build SVG nodes safely using DOMParser (no innerHTML).
  function setMonsterSvg(svgBodyString) {
    // Wrap in a full SVG so the parser is happy, then port children.
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="${SVG_NS}" viewBox="0 0 200 200">${svgBodyString}</svg>`,
      'image/svg+xml'
    );
    // Clear existing children
    while (monsterSvg.firstChild) monsterSvg.removeChild(monsterSvg.firstChild);
    // Adopt new children
    const nodes = Array.from(doc.documentElement.childNodes);
    for (const n of nodes) {
      monsterSvg.appendChild(document.importNode(n, true));
    }
  }

  function buildMonsterSvg(stageId, mood) {
    const eyeShape = mood < 30 ? 'angry' : mood > 70 ? 'happy' : 'neutral';
    switch (stageId) {
      case 0: return stageEgg();
      case 1: return stageBaby(eyeShape);
      case 2: return stageChild(eyeShape);
      case 3: return stageAdult(eyeShape);
      case 4: return stageKing(eyeShape);
      default: return stageEgg();
    }
  }

  function stageEgg() {
    return `
      <defs>
        <radialGradient id="eg" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#5a0080"/>
          <stop offset="60%" stop-color="#1a0040"/>
          <stop offset="100%" stop-color="#000"/>
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="115" rx="58" ry="70" fill="url(#eg)" stroke="#000" stroke-width="4"/>
      <path d="M 80 80 L 90 95 L 78 108 L 92 120" stroke="#ffd700" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M 118 100 L 108 112 L 120 124" stroke="#ffd700" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="85" cy="80" r="3" fill="#ff4d4d"/>
      <circle cx="115" cy="130" r="2.5" fill="#ff4d4d"/>
    `;
  }
  function eyeSvg(cx, cy, mood, size = 6) {
    if (mood === 'angry') {
      return `
        <line x1="${cx - size - 2}" y1="${cy - size}" x2="${cx + size - 2}" y2="${cy}" stroke="#000" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy + 2}" r="${size}" fill="#ff3030" stroke="#000" stroke-width="2"/>
      `;
    }
    if (mood === 'happy') {
      return `
        <path d="M ${cx - size} ${cy + 2} Q ${cx} ${cy - size} ${cx + size} ${cy + 2}"
              stroke="#000" stroke-width="3" fill="none" stroke-linecap="round"/>
      `;
    }
    return `
      <circle cx="${cx}" cy="${cy}" r="${size}" fill="#fff" stroke="#000" stroke-width="2"/>
      <circle cx="${cx + 1}" cy="${cy + 1}" r="${size * 0.5}" fill="#1a0040"/>
    `;
  }
  function stageBaby(mood) {
    return `
      <defs>
        <radialGradient id="bb" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#7a1aa0"/>
          <stop offset="100%" stop-color="#2a0060"/>
        </radialGradient>
      </defs>
      <path d="M 78 68 L 72 44 L 90 62" fill="#2a0060" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
      <path d="M 122 68 L 128 44 L 110 62" fill="#2a0060" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="100" cy="115" rx="58" ry="62" fill="url(#bb)" stroke="#000" stroke-width="4"/>
      ${eyeSvg(82, 105, mood, 7)}
      ${eyeSvg(118, 105, mood, 7)}
      <path d="M 88 140 Q 100 150 112 140" stroke="#000" stroke-width="3" fill="#000" stroke-linejoin="round"/>
      <path d="M 94 140 L 97 148 L 100 140 Z" fill="#fff"/>
      <path d="M 100 140 L 103 148 L 106 140 Z" fill="#fff"/>
      <path d="M 155 155 Q 180 150 172 170 Q 160 162 150 168" fill="#2a0060" stroke="#000" stroke-width="3"/>
    `;
  }
  function stageChild(mood) {
    return `
      <defs>
        <radialGradient id="ch" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#9020c0"/>
          <stop offset="100%" stop-color="#2a0060"/>
        </radialGradient>
      </defs>
      <path d="M 50 100 L 60 180 L 140 180 L 150 100 Q 130 115 100 112 Q 70 115 50 100 Z"
            fill="#550020" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 74 58 L 62 24 L 92 54" fill="#1a0040" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 126 58 L 138 24 L 108 54" fill="#1a0040" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
      <ellipse cx="100" cy="100" rx="48" ry="52" fill="url(#ch)" stroke="#000" stroke-width="4"/>
      ${eyeSvg(82, 92, mood, 7)}
      ${eyeSvg(118, 92, mood, 7)}
      <path d="M 82 128 Q 100 118 118 128 Q 110 138 100 136 Q 90 138 82 128 Z"
            fill="#000" stroke="#000" stroke-width="2"/>
      <path d="M 92 128 L 95 136 L 98 128 Z" fill="#fff"/>
      <path d="M 102 128 L 105 136 L 108 128 Z" fill="#fff"/>
      <path d="M 92 75 L 96 68 L 100 73 L 104 68 L 108 75 Z" fill="#ffd700" stroke="#000" stroke-width="1.5"/>
    `;
  }
  function stageAdult(mood) {
    return `
      <defs>
        <radialGradient id="ad" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#a030d0"/>
          <stop offset="100%" stop-color="#1a0040"/>
        </radialGradient>
      </defs>
      <path d="M 40 80 Q 10 70 20 120 Q 40 100 55 110 Q 48 90 40 80 Z"
            fill="#2a0060" stroke="#000" stroke-width="3.5"/>
      <path d="M 160 80 Q 190 70 180 120 Q 160 100 145 110 Q 152 90 160 80 Z"
            fill="#2a0060" stroke="#000" stroke-width="3.5"/>
      <path d="M 52 94 L 58 180 L 142 180 L 148 94 Q 130 110 100 108 Q 70 110 52 94 Z"
            fill="#660028" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 72 50 L 58 14 Q 68 26 92 52" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
      <path d="M 128 50 L 142 14 Q 132 26 108 52" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="100" cy="98" rx="48" ry="54" fill="url(#ad)" stroke="#000" stroke-width="4"/>
      ${eyeSvg(82, 88, mood, 8)}
      ${eyeSvg(118, 88, mood, 8)}
      <path d="M 78 128 Q 100 118 122 128 Q 114 144 100 142 Q 86 144 78 128 Z"
            fill="#000" stroke="#000" stroke-width="2"/>
      <path d="M 88 128 L 94 142 L 98 128 Z" fill="#fff"/>
      <path d="M 102 128 L 106 142 L 112 128 Z" fill="#fff"/>
      <circle cx="100" cy="72" r="7" fill="none" stroke="#ffd700" stroke-width="1.5"/>
      <path d="M 100 66 L 102 71 L 107 71 L 103 74 L 105 79 L 100 76 L 95 79 L 97 74 L 93 71 L 98 71 Z"
            fill="#ffd700" stroke="#000" stroke-width="0.8"/>
    `;
  }
  function stageKing(mood) {
    return `
      <defs>
        <radialGradient id="kg" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stop-color="#c040ff"/>
          <stop offset="60%" stop-color="#6000a0"/>
          <stop offset="100%" stop-color="#000"/>
        </radialGradient>
        <linearGradient id="kg-aura" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffd700"/>
          <stop offset="50%" stop-color="#ff00ff"/>
          <stop offset="100%" stop-color="#00ffff"/>
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="88" fill="none" stroke="url(#kg-aura)" stroke-width="3" opacity="0.7"/>
      <path d="M 40 80 Q -10 50 5 140 Q 30 110 60 118 Q 50 92 40 80 Z"
            fill="#000" stroke="#000" stroke-width="3"/>
      <path d="M 160 80 Q 210 50 195 140 Q 170 110 140 118 Q 150 92 160 80 Z"
            fill="#000" stroke="#000" stroke-width="3"/>
      <path d="M 42 95 Q 18 85 14 125 Q 40 112 55 118 Z" fill="#8b1aff" opacity="0.6"/>
      <path d="M 158 95 Q 182 85 186 125 Q 160 112 145 118 Z" fill="#8b1aff" opacity="0.6"/>
      <path d="M 54 95 L 60 186 L 140 186 L 146 95 Q 130 112 100 110 Q 70 112 54 95 Z"
            fill="#700030" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 78 186 L 90 180 L 100 186 L 110 180 L 122 186" stroke="#000" stroke-width="3" fill="none" stroke-linejoin="round"/>
      <path d="M 68 38 L 76 12 L 88 32 L 100 8 L 112 32 L 124 12 L 132 38 L 128 48 L 72 48 Z"
            fill="#ffd700" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="100" cy="20" r="4" fill="#ff0040" stroke="#000" stroke-width="1.5"/>
      <circle cx="80" cy="38" r="3" fill="#00ffff" stroke="#000" stroke-width="1.5"/>
      <circle cx="120" cy="38" r="3" fill="#00ffff" stroke="#000" stroke-width="1.5"/>
      <ellipse cx="100" cy="100" rx="50" ry="56" fill="url(#kg)" stroke="#000" stroke-width="4"/>
      <circle cx="100" cy="74" r="9" fill="none" stroke="#ffd700" stroke-width="2"/>
      <path d="M 100 66 L 103 72 L 109 72 L 104 76 L 106 82 L 100 78 L 94 82 L 96 76 L 91 72 L 97 72 Z"
            fill="#ffd700" stroke="#000" stroke-width="1"/>
      ${eyeSvg(82, 98, mood, 9)}
      ${eyeSvg(118, 98, mood, 9)}
      <path d="M 76 130 Q 100 120 124 130 Q 114 148 100 146 Q 86 148 76 130 Z"
            fill="#000" stroke="#000" stroke-width="2"/>
      <path d="M 86 130 L 92 148 L 96 130 Z" fill="#fff"/>
      <path d="M 104 130 L 108 148 L 114 130 Z" fill="#fff"/>
    `;
  }

  function renderMonster() {
    const st = currentStage(state.lv);
    setMonsterSvg(buildMonsterSvg(st.id, state.mood));
    monsterWrap.classList.remove('happy', 'grumpy');
    if (state.mood > 75) monsterWrap.classList.add('happy');
    else if (state.mood < 30) monsterWrap.classList.add('grumpy');
  }

  // ==================== UI update ====================
  function pct(v, max = 100) {
    return Math.max(0, Math.min(100, (v / max) * 100));
  }
  function updateUi() {
    lvEl.textContent = state.lv;
    nameEl.textContent = state.name;
    const need = expForLevel(state.lv);
    expBar.style.width = pct(state.exp, need) + '%';
    hungerVal.textContent = Math.round(state.hunger);
    hungerBar.style.width = pct(state.hunger) + '%';
    moodVal.textContent = Math.round(state.mood);
    moodBar.style.width = pct(state.mood) + '%';
    const days = Math.floor(state.ageSec / 3600);
    ageVal.textContent = days;
    ageBar.style.width = Math.min(100, (days / 30) * 100) + '%';
  }

  // ==================== Game actions ====================
  function speak(text, ms = 1500) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(speak._t);
    speak._t = setTimeout(() => bubble.classList.remove('show'), ms);
  }

  function floatText(text, kind = 'exp') {
    const el = document.createElement('div');
    el.className = `floater ${kind}`;
    el.textContent = text;
    el.style.left = 40 + Math.random() * 20 + '%';
    el.style.top = 40 + Math.random() * 20 + '%';
    floaters.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function flashLevelUp() {
    levelupEl.classList.remove('show');
    void levelupEl.offsetWidth;
    levelupEl.classList.add('show');
  }
  function flashEvolve(label) {
    evolveText.textContent = label + ' に進化！';
    evolveEl.classList.remove('show');
    void evolveEl.offsetWidth;
    evolveEl.classList.add('show');
  }

  function addExp(amount) {
    state.exp += amount;
    floatText(`+${amount} EXP`, 'exp');
    while (state.exp >= expForLevel(state.lv)) {
      state.exp -= expForLevel(state.lv);
      state.lv++;
      const prevStage = state.stageId;
      const st = currentStage(state.lv);
      if (st.id !== prevStage) {
        // Evolution level-up: skip the LEVEL UP flash so the big
        // evolution cut-in stays clean (no overlap with "LV UP!").
        state.stageId = st.id;
        Sound.evolve();
        setTimeout(() => {
          flashEvolve(st.label);
          renderMonster();
          speak(st.label + 'になったぞ…', 2800);
        }, 250);
      } else {
        // Regular level up — show the flash only when no evolution is coming.
        Sound.levelUp();
        flashLevelUp();
      }
    }
  }

  function doAction(kind) {
    if (state.isDead) return;
    Sound.prime();
    switch (kind) {
      case 'eat':
        if (state.hunger >= 95) {
          speak('もう…たべれぬ…');
          Sound.err();
          return;
        }
        state.hunger = Math.min(100, state.hunger + 25);
        state.mood = Math.min(100, state.mood + 4);
        floatText('+25 食欲', 'food');
        Sound.eat();
        speak('うまいぞ！');
        addExp(4);
        break;
      case 'play':
        if (state.hunger <= 10) {
          speak('はら、へった…');
          Sound.err();
          return;
        }
        state.mood = Math.min(100, state.mood + 20);
        state.hunger = Math.max(0, state.hunger - 8);
        floatText('+20 機嫌', 'love');
        Sound.play();
        speak('たのしい！');
        addExp(10);
        break;
      case 'train':
        if (state.hunger <= 15) {
          speak('つかれた…');
          Sound.err();
          return;
        }
        state.hunger = Math.max(0, state.hunger - 12);
        state.mood = Math.max(0, state.mood - 5);
        floatText('+30 EXP', 'exp');
        Sound.train();
        speak('うおぉおお！');
        addExp(30);
        break;
      case 'praise':
        state.mood = Math.min(100, state.mood + 15);
        floatText('+15 機嫌', 'love');
        Sound.praise();
        speak('フフッ…');
        addExp(6);
        break;
    }
    updateUi();
    renderMonster();
    saveState();
  }

  actionBtns.forEach((btn) => {
    btn.addEventListener('click', () => doAction(btn.dataset.act));
  });

  // ==================== Time tick ====================
  let tickTimer = null;
  function startTicker() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => tick(1), 1000);
  }
  function tick(seconds) {
    if (state.isDead) return;
    state.ageSec += seconds;
    state.hunger = Math.max(0, state.hunger - 0.12 * seconds);
    const moodDrop = state.hunger < 20 ? 0.25 : 0.05;
    state.mood = Math.max(0, state.mood - moodDrop * seconds);
    if (Math.random() < 0.02 * seconds) addExp(1);
    if (state.hunger <= 0 && state.mood <= 0) {
      die('空腹と絶望で消えた…');
      return;
    }
    updateUi();
    saveState();
  }

  function applyOfflineCatchup() {
    if (!state.lastTs) return;
    const elapsed = Math.min(86400, Math.floor((Date.now() - state.lastTs) / 1000));
    if (elapsed > 0) tick(elapsed);
    state.lastTs = Date.now();
    saveState();
  }
  setInterval(() => {
    if (state) {
      state.lastTs = Date.now();
      saveState();
    }
  }, 10 * 1000);

  // ==================== Death / restart ====================
  function die(msg) {
    state.isDead = true;
    saveState();
    Sound.die();
    deathMsg.textContent = msg;
    deathOverlay.classList.add('show');
  }
  btnRestart.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    deathOverlay.classList.remove('show');
    state = null;
    startOverlay.classList.add('show');
    startName.value = 'ダーク';
  });

  // ==================== Start flow ====================
  btnStart.addEventListener('click', () => {
    Sound.prime();
    const name = (startName.value || 'ダーク').slice(0, 10);
    state = defaultState();
    state.name = name;
    saveState();
    startOverlay.classList.remove('show');
    renderMonster();
    updateUi();
    startTicker();
    speak('よぶんだな、我を…');
  });

  // ==================== Controls ====================
  btnRename.addEventListener('click', () => {
    const newName = prompt('あたらしい名前を入れて', state?.name || '');
    if (newName && state) {
      state.name = newName.slice(0, 10);
      saveState();
      updateUi();
    }
  });
  btnShare.addEventListener('click', () => {
    const st = currentStage(state.lv);
    const text = `${state.name}（Lv.${state.lv} ${st.label}）を育てた！ #魔王そだて`;
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  btnMute.addEventListener('click', () => {
    const m = Sound.toggleMute();
    btnMute.textContent = m ? '🔇' : '🔊';
  });
  btnReset.addEventListener('click', () => {
    if (!confirm('リセットしますか？育成中の魔王は消えます')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = null;
    startOverlay.classList.add('show');
    startName.value = 'ダーク';
  });

  // ==================== Init ====================
  if (state && !state.isDead) {
    renderMonster();
    updateUi();
    applyOfflineCatchup();
    updateUi();
    startTicker();
  } else if (state && state.isDead) {
    renderMonster();
    updateUi();
    deathMsg.textContent = '前回の魔王は消えた…もう一度挑戦するか？';
    deathOverlay.classList.add('show');
  } else {
    startOverlay.classList.add('show');
  }
})();
