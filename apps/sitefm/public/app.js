(() => {
  const piece = JSON.parse(document.getElementById('piece').textContent);
  const canvas = document.getElementById('canvas');
  const ctx2d = canvas.getContext('2d');
  const playBtn = document.getElementById('play');
  const stopBtn = document.getElementById('stop');

  const COLORS = { lead: '#c6f24e', pluck: '#c6f24e', click: '#5ad2ff', pad: '#ffb02e', bass: '#8b949e', stab: '#ff7ad9' };
  const STEP = 60 / piece.bpm / 2;
  const BAR = STEP * 8;
  const total = piece.bars * BAR;
  let ac = null, master = null, startedAt = 0, playing = false, raf = 0;

  function synth(freq, when, dur, vel, kind) {
    if (kind === 'click') {
      const b = ac.createBuffer(1, 1000, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 8);
      const src = ac.createBufferSource(); src.buffer = b;
      const g = ac.createGain(); g.gain.value = vel * 0.5;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
      src.connect(hp); hp.connect(g); g.connect(master); src.start(when);
      return;
    }
    const o = ac.createOscillator();
    const g = ac.createGain();
    if (kind === 'pad') {
      o.type = 'sawtooth';
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vel * 0.22, when + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.frequency.value = freq; o.start(when); o.stop(when + dur + 0.05);
      return;
    }
    if (kind === 'bass') {
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vel * 0.42, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.9);
      o.connect(g); g.connect(master); o.start(when); o.stop(when + dur);
      return;
    }
    if (kind === 'stab') {
      o.type = 'square'; o.frequency.value = freq;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2600, when); f.frequency.exponentialRampToValueAtTime(400, when + 0.25);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vel * 0.3, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
      o.connect(f); f.connect(g); g.connect(master); o.start(when); o.stop(when + 0.35);
      return;
    }
    o.type = kind === 'pluck' ? 'triangle' : 'sawtooth';
    o.frequency.value = freq;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(kind === 'pluck' ? 1800 : 3200, when);
    f.frequency.exponentialRampToValueAtTime(600, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel * (kind === 'pluck' ? 0.16 : 0.24), when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(when); o.stop(when + dur + 0.02);
  }

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.85;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    // a little room
    const delay = ac.createDelay(0.5); delay.delayTime.value = STEP * 0.75;
    const fb = ac.createGain(); fb.gain.value = 0.22;
    const wet = ac.createGain(); wet.gain.value = 0.18;
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp);
  }

  // ---------- drawing ----------
  const ROW = 26;
  function draw(progress) {
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    const padL = 26, padR = 18;
    const usable = w - padL - padR;
    const barW = usable / piece.bars;

    // grid
    ctx2d.strokeStyle = 'rgba(255,255,255,.05)';
    ctx2d.lineWidth = 1;
    for (let b = 0; b <= piece.bars; b++) {
      const x = padL + b * barW;
      ctx2d.beginPath(); ctx2d.moveTo(x, 18); ctx2d.lineTo(x, h - 26); ctx2d.stroke();
    }
    // section labels
    ctx2d.font = '10px ui-monospace, monospace';
    piece.sections.forEach((s, i) => {
      const x = padL + s.bar * barW + 6;
      ctx2d.fillStyle = 'rgba(255,255,255,.30)';
      let label = s.text || '';
      const maxW = barW - 12;
      while (label.length > 3 && ctx2d.measureText(label + '…').width > maxW) label = label.slice(0, -1);
      if (label !== (s.text || '')) label += '…';
      ctx2d.fillText(label, x, h - 10);
    });

    // notes
    const freqs = piece.notes.filter((n) => n.freq > 0).map((n) => n.freq);
    const minF = Math.log2(Math.min(...freqs, 60)), maxF = Math.log2(Math.max(...freqs, 400));
    for (const n of piece.notes) {
      const x = padL + n.bar * barW + (n.step / 8) * barW;
      const wdt = Math.max(3, (barW / 8) - 2);
      const row = n.freq ? Math.round(((Math.log2(n.freq) - minF) / (maxF - minF || 1)) * (h - 70)) : 0;
      const y = h - 46 - row;
      const passed = progress > (n.bar + n.step / 8) / piece.bars;
      ctx2d.fillStyle = COLORS[n.kind] || '#888';
      ctx2d.globalAlpha = passed ? 0.95 : 0.28;
      if (n.kind === 'click') {
        ctx2d.globalAlpha = passed ? 0.9 : 0.22;
        ctx2d.fillRect(x, h - 44, 2, 16);
      } else if (n.kind === 'pad') {
        ctx2d.globalAlpha = passed ? 0.5 : 0.18;
        ctx2d.fillRect(x, 20, wdt * 2, h - 60);
      } else {
        const hgt = n.kind === 'bass' ? 5 : 8;
        ctx2d.fillRect(x, y, wdt, hgt);
      }
    }
    ctx2d.globalAlpha = 1;

    // playhead
    const px = padL + Math.min(1, progress) * usable;
    ctx2d.strokeStyle = '#c6f24e';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath(); ctx2d.moveTo(px, 14); ctx2d.lineTo(px, h - 24); ctx2d.stroke();
  }

  function frame() {
    if (!playing) return;
    const t = ac.currentTime - startedAt;
    const p = Math.min(1, t / total);
    draw(p);
    if (p >= 1) { playing = false; playBtn.textContent = '▶ Play again'; draw(1); return; }
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (!ac) build();
    if (ac.state === 'suspended') ac.resume();
    playing = true;
    startedAt = ac.currentTime + 0.08;
    for (const n of piece.notes) {
      const when = startedAt + n.bar * BAR + (n.step / 8) * BAR;
      const kind = n.kind;
      const dur = kind === 'pluck' ? 0.28 : kind === 'pad' ? (n.dur || 2) * BAR : 0.42;
      synth(n.freq, when, dur, n.vel, kind);
    }
    playBtn.textContent = '❚❚ Playing';
    cancelAnimationFrame(raf);
    frame();
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    if (ac) { ac.close(); ac = null; }
    playBtn.textContent = '▶ Play';
    draw(0);
  }

  playBtn.addEventListener('click', () => { if (playing) { stop(); } else { play(); } });
  stopBtn.addEventListener('click', stop);
  draw(0);
  window.addEventListener('resize', () => { if (!playing) draw(0); });
})();
