/* Procedural soundtrack for the Heavenly Demon Cult site.
   Everything is synthesized live with the Web Audio API; no audio files. */
window.cultAudio = (() => {
  let ctx, master, reverb, noise, droneFilter, choirGain;
  let started = false, muted = true, power = 0.3, lastPower = -1;
  let volume = 0.7;
  try { const v = parseFloat(localStorage.getItem('cultVolume')); if (!isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) {}
  const masterLevel = () => 1.2 * volume * volume; // squared for a natural-feeling curve
  let nextTime = 0, step = 0, schedTimer = null, pluckTimer = null, lastHover = 0;

  // D minor pentatonic across two octaves: guqin-like register
  const SCALE = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0];
  const BPM = 72, SIXTEENTH = 60 / BPM / 4;
  const PATTERNS = [
    { hits: {0: .55, 3: .3} },                                                   // heartbeat
    { hits: {0: .65, 3: .35, 8: .55, 11: .3, 14: .25} },                         // gathering
    { hits: {0: .9, 3: .45, 6: .55, 8: .85, 10: .45, 12: .65, 14: .55, 15: .4},  // war drums
      rim: {4: .25, 12: .25} },
  ];
  const ksCache = new Map();

  const now = () => ctx.currentTime;

  function makeNoise(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeImpulse(sec, decay) {
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  // Karplus-Strong plucked string, rendered once per pitch and cached
  function ksBuffer(freq) {
    if (ksCache.has(freq)) return ksCache.get(freq);
    const sr = ctx.sampleRate, N = Math.round(sr / freq), len = sr * 4;
    const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], nb = ring[(idx + 1) % N];
      ring[idx] = (a + nb) * 0.5 * 0.9965;
      d[i] = a;
      idx = (idx + 1) % N;
    }
    ksCache.set(freq, b);
    return b;
  }
  // route a node to the dry bus and the reverb
  function send(node, wet = 0.5) {
    node.connect(master);
    const g = ctx.createGain(); g.gain.value = wet;
    node.connect(g); g.connect(reverb);
  }
  function osc(type, freq, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.start(); return o;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);

    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(5, 2.6);
    const rv = ctx.createGain(); rv.gain.value = 0.6;
    reverb.connect(rv); rv.connect(master);
    noise = makeNoise(2);

    // --- Abyssal drone (D)
    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass'; droneFilter.frequency.value = 260; droneFilter.Q.value = 5;
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.16;
    [['sawtooth', 36.71, -7], ['sawtooth', 36.71, 6], ['sawtooth', 55.0, 3], ['triangle', 73.42, 0]]
      .forEach(([t, f, d]) => osc(t, f, d).connect(droneFilter));
    const sub = osc('sine', 36.71), subG = ctx.createGain(); subG.gain.value = 0.5;
    sub.connect(subG); subG.connect(droneGain);
    const lfo = osc('sine', 0.06), lfoG = ctx.createGain(); lfoG.gain.value = 110;
    lfo.connect(lfoG); lfoG.connect(droneFilter.frequency);
    droneFilter.connect(droneGain); send(droneGain, 0.35);

    // --- Dark chant: sawtooth stack through vowel formants
    choirGain = ctx.createGain(); choirGain.gain.value = 0;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 620; f1.Q.value = 7;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1050; f2.Q.value = 9;
    [73.42, 110.0, 146.83, 174.61].forEach(f => [-9, 9].forEach(d => {
      const o = osc('sawtooth', f, d); o.connect(f1); o.connect(f2);
    }));
    f1.connect(choirGain); f2.connect(choirGain); send(choirGain, 0.9);

    // --- Mountain wind
    const wind = ctx.createBufferSource(); wind.buffer = noise; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 450; wf.Q.value = 1.2;
    const wg = ctx.createGain(); wg.gain.value = 0.07;
    const wl = osc('sine', 0.09), wlg = ctx.createGain(); wlg.gain.value = 300;
    wl.connect(wlg); wlg.connect(wf.frequency);
    const wl2 = osc('sine', 0.13), wl2g = ctx.createGain(); wl2g.gain.value = 0.04;
    wl2.connect(wl2g); wl2g.connect(wg.gain);
    wind.connect(wf); wf.connect(wg); send(wg, 0.4); wind.start();
  }

  /* ---------- Instruments ---------- */
  function drum(t, vel, pitch = 1) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(44 * pitch, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g); send(g, 0.25); o.start(t); o.stop(t + 1.3);
    // skin slap
    const n = ctx.createBufferSource(); n.buffer = noise;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.45, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(nf); nf.connect(ng); send(ng, 0.2);
    n.start(t, Math.random()); n.stop(t + 0.1);
  }
  function rim(t, vel) {
    const n = ctx.createBufferSource(); n.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(f); f.connect(g); send(g, 0.35);
    n.start(t, Math.random()); n.stop(t + 0.08);
  }
  function pluck(freq, t = now(), vol = 0.32, slide = Math.random() < 0.35) {
    const s = ctx.createBufferSource(); s.buffer = ksBuffer(freq);
    s.playbackRate.setValueAtTime(1, t);
    if (slide) { // guqin-style bend after the attack
      s.playbackRate.setValueAtTime(1, t + 0.35);
      s.playbackRate.linearRampToValueAtTime(1.06, t + 0.7);
      s.playbackRate.linearRampToValueAtTime(1.0, t + 1.3);
    }
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(tone); tone.connect(g);
    if (p) { p.pan.value = Math.random() * 1.2 - 0.6; g.connect(p); send(p, 0.65); } else send(g, 0.65);
    s.start(t); s.stop(t + 4);
  }
  function gong(t = now(), vol = 0.5, base = 62, len = 7) {
    [1, 1.47, 2.03, 2.71, 3.22, 4.13, 5.36].forEach((r, i) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base * r * 1.025, t);
      o.frequency.exponentialRampToValueAtTime(base * r, t + 2.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol / (i + 1.4), t + 0.02 + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len - i * 0.6);
      o.connect(g); send(g, 0.75); o.start(t); o.stop(t + len);
    });
    const n = ctx.createBufferSource(); n.buffer = noise;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(nf); nf.connect(ng); send(ng, 0.6); n.start(t); n.stop(t + 0.5);
  }

  /* ---------- Sequencing ---------- */
  function level() { return power < 0.5 ? 0 : power < 0.9 ? 1 : 2; }
  function schedule() {
    while (nextTime < now() + 0.15) {
      const pat = PATTERNS[level()];
      const v = pat.hits[step];
      const vol = 0.35 + Math.min(power, 1.3) * 0.35;
      if (v) drum(nextTime, v * vol, step % 8 === 0 ? 1 : 1.18);
      if (pat.rim && pat.rim[step]) rim(nextTime, pat.rim[step]);
      nextTime += SIXTEENTH; step = (step + 1) % 16;
    }
  }
  function pluckLoop() {
    if (!muted) {
      const i = Math.floor(Math.random() * SCALE.length);
      pluck(SCALE[i]);
      if (Math.random() < 0.4) { // short melodic answer
        const j = Math.max(0, Math.min(SCALE.length - 1, i + (Math.random() < 0.5 ? -1 : -2)));
        pluck(SCALE[j], now() + 0.28 + Math.random() * 0.2, 0.25, false);
      }
    }
    pluckTimer = setTimeout(pluckLoop, 1600 + Math.random() * 2600 - power * 700);
  }

  /* ---------- Public API ---------- */
  function start() {
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) {
      started = true;
      nextTime = now() + 0.3;
      schedTimer = setInterval(schedule, 30);
      gong(now() + 0.1, 0.55, 55, 9);
      setTimeout(pluckLoop, 2200);
    }
    muted = false;
    lastPower = -1; setPower(power);
    master.gain.cancelScheduledValues(now());
    master.gain.setTargetAtTime(masterLevel(), now(), 0.6);
    update();
  }
  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('cultVolume', String(volume)); } catch (e) {}
    if (ctx && !muted) {
      master.gain.cancelScheduledValues(now());
      master.gain.setTargetAtTime(masterLevel(), now(), 0.08);
    }
    update();
  }
  function stop() {
    muted = true;
    if (!ctx) return update();
    master.gain.cancelScheduledValues(now());
    master.gain.setTargetAtTime(0, now(), 0.25);
    setTimeout(() => { if (muted && ctx.state === 'running') ctx.suspend(); }, 1200);
    update();
  }
  function toggle() { muted ? start() : stop(); }
  function setPower(p) {
    power = p;
    if (!ctx || muted || Math.abs(p - lastPower) < 0.02) return;
    lastPower = p;
    const t = now();
    droneFilter.frequency.setTargetAtTime(170 + Math.min(p, 2.5) * 480, t, 0.6);
    choirGain.gain.setTargetAtTime(Math.max(0, Math.min(p, 1.8) - 0.4) * 0.09, t, 0.9);
  }
  function section(i, id) {
    if (!ctx || muted) return;
    gong(now(), 0.12, 220 + i * 15, 4);      // temple bell on each new section
    if (id === 'cheonma') gong(now() + 0.05, 0.45, 48, 9); // Cheonma: deep gong
  }
  // each of the Nine Laws has its own note of the scale, struck with a small bell
  function doctrine(i) {
    if (!ctx || muted) return;
    const t = now();
    pluck(SCALE[i % SCALE.length], t, 0.38, false);
    pluck(SCALE[i % SCALE.length] / 2, t + 0.02, 0.22, true);
    gong(t, 0.06, 330 + i * 20, 3);
    drum(t, 0.35, 1.1);
  }
  function oath() {
    if (!ctx || muted) return;
    const t = now();
    gong(t, 0.75, 41, 11);
    [0, 0.18, 0.36, 0.5, 0.62, 0.72].forEach((d, k) => drum(t + d, 0.9 - k * 0.06, 0.9));
    [293.66, 220, 174.61, 146.83].forEach((f, k) => pluck(f, t + 0.9 + k * 0.12, 0.3, k === 3));
  }
  // repeated oath strikes: everything climbs with the combo count
  function oathHit(c, tierUp) {
    if (!ctx || muted) return;
    const t = now(), lv = Math.min(c, 20);
    drum(t, Math.min(0.45 + lv * 0.035, 1), 0.85 + lv * 0.04);
    if (lv >= 4) drum(t + 0.07, 0.4 + lv * 0.02, 1.3 + lv * 0.03);
    if (lv >= 8) rim(t + 0.035, 0.35);
    // melody walks up the scale, jumping an octave each lap
    const oct = 1 + (Math.floor(c / SCALE.length) % 2);
    pluck(SCALE[c % SCALE.length] * oct, t, 0.26 + lv * 0.006, false);
    // wet splash
    const n = ctx.createBufferSource(); n.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + lv * 90; f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 + lv * 0.015, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(f); f.connect(g); send(g, 0.4); n.start(t, Math.random()); n.stop(t + 0.25);
    // riser whose pitch climbs with the combo
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(55 * (1 + lv * 0.12), t);
    o.frequency.exponentialRampToValueAtTime(110 * (1 + lv * 0.12), t + 0.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600 + lv * 120;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.05 + lv * 0.006, t + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(lp); lp.connect(og); send(og, 0.5); o.start(t); o.stop(t + 0.5);
    // chant swells, then settles
    choirGain.gain.cancelScheduledValues(t);
    choirGain.gain.setTargetAtTime(Math.min(0.04 + lv * 0.012, 0.22), t, 0.05);
    choirGain.gain.setTargetAtTime(0.06, t + 0.6, 1.2);
    if (tierUp) {
      gong(t, 0.5 + Math.min(lv, 15) * 0.02, Math.max(36, 55 - lv), 9);
      [0, 0.12, 0.24].forEach(d => drum(t + d, 0.9, 0.8));
    }
  }
  function hover() {
    if (!ctx || muted) return;
    const t = performance.now();
    if (t - lastHover < 160) return;
    lastHover = t;
    pluck(SCALE[5 + Math.floor(Math.random() * 4)] * 2, now(), 0.06, false);
  }

  // UI state
  function update() {
    const b = document.getElementById('snd');
    if (!b) return;
    b.classList.toggle('on', !muted);
    b.setAttribute('aria-pressed', String(!muted));
    b.querySelector('.lbl').textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    const s = document.getElementById('vol');
    if (s) {
      s.value = Math.round(volume * 100);
      s.style.setProperty('--p', s.value + '%');
      s.closest('.sound').classList.toggle('muted', muted);
    }
  }
  document.addEventListener('DOMContentLoaded', update);
  document.addEventListener('visibilitychange', () => {
    if (!ctx || muted) return;
    document.hidden ? ctx.suspend() : ctx.resume();
  });

  return { start, stop, toggle, setVolume, get volume() { return volume; }, setPower, section, doctrine, oath, oathHit, hover, get muted() { return muted; } };
})();
