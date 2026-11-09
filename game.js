(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const keys = new Set();
  const upgrades = {
    stick: { name: 'OLD STICK', emoji: '🪵', level: 'LV. 1 · SHORT REACH', damage: 1, reach: 30, cooldown: 390 },
    pan: { name: 'IRON SKILLET', emoji: '🍳', level: 'LV. 2 · HEAVY HITTER', damage: 2, reach: 36, cooldown: 510 },
    fork: { name: 'HAYFORK', emoji: '🔱', level: 'LV. 3 · LONG REACH', damage: 3, reach: 54, cooldown: 490 },
    blade: { name: 'FEATHERBLADE', emoji: '⚔️', level: 'LV. 4 · QUICK CUTS', damage: 5, reach: 46, cooldown: 255 }
  };
  const upgradeCosts = { pan: 12, fork: 24, blade: 40 };
  const waveNames = ['THE WARM-UP', 'THE ROOST RUMBLE', 'COOP OF DOOM', 'BEAK STREET', 'THE BIG CLUCK'];
  let player = { x: 235, y: 145, hp: 5, maxHp: 5, faceX: 1, faceY: 0, speed: 105, invuln: 0 };
  let enemies = [], particles = [], texts = [];
  let gameState = 'title', wave = 1, waveKills = 0, waveTotal = 4, coins = 0, weapon = 'stick';
  let lastTime = 0, attackTimer = 0, attackFlash = 0, attackAngle = 0, shake = 0, spawnTimer = 0;
  let soundOn = true, audioContext = null, bestWave = Number(localStorage.getItem('pixelPitBest') || 1);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function sound(freq = 180, duration = .07, type = 'square', volume = .035) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq * .55), audioContext.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }
  function updateHud() {
    $('coins').textContent = String(coins).padStart(2, '0');
    $('healthText').textContent = `${player.hp} / ${player.maxHp}`;
    $('healthFill').style.width = `${player.hp / player.maxHp * 100}%`;
    $('xpText').textContent = `${waveKills}/${waveTotal}`;
    $('xpFill').style.width = `${waveKills / waveTotal * 100}%`;
    $('roundBadge').textContent = String(wave).padStart(2, '0');
    $('roundTitle').textContent = waveNames[Math.min(wave - 1, waveNames.length - 1)];
    $('roundSub').textContent = wave === 5 ? 'The boss of the barn is here' : wave === 4 ? 'Things are getting fowl' : 'A few pecky troublemakers';
    $('foeCount').textContent = `${waveKills} / ${waveTotal}`;
    $('bestWave').textContent = `BEST WAVE ${String(bestWave).padStart(2, '0')}`;
    $('weaponName').textContent = upgrades[weapon].name;
    $('weaponEmoji').textContent = upgrades[weapon].emoji;
    $('weaponLevel').textContent = upgrades[weapon].level;
    $('rank').textContent = wave >= 5 ? 'COOP LEGEND' : wave >= 3 ? 'BARN BRAWLER' : wave >= 2 ? 'SCRAPPER' : 'ROOKIE';
    document.querySelectorAll('.upgrade-card').forEach(button => {
      const type = button.dataset.upgrade;
      const ownedOrBetter = ['pan', 'fork', 'blade'].indexOf(weapon) >= ['pan', 'fork', 'blade'].indexOf(type) && weapon !== 'stick';
      button.disabled = coins < upgradeCosts[type] || ownedOrBetter || gameState === 'title';
      button.querySelector('.upgrade-cost').textContent = weapon === type ? 'OWNED' : ownedOrBetter ? 'LOCKED' : `¢ ${upgradeCosts[type]}`;
    });
    $('shopHint').textContent = gameState === 'title' ? 'WIN ROUNDS TO EARN SCRAP' : `KNOCKOUTS DROP SCRAP · ${upgrades[weapon].damage} DMG`;
  }
  function showToast(message) {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('show'), 1250);
  }
  function startGame() {
    wave = 1; waveKills = 0; waveTotal = 4; coins = 0; weapon = 'stick';
    player = { x: 240, y: 155, hp: 5, maxHp: 5, faceX: 1, faceY: 0, speed: 105, invuln: 0 };
    enemies = []; particles = []; texts = []; gameState = 'playing'; spawnTimer = .2; attackTimer = 0;
    overlay.classList.add('hidden'); $('statusText').textContent = 'ROUND 01 · FIGHT!'; updateHud(); sound(400, .09, 'triangle');
  }
  function spawnEnemy(boss = false) {
    const side = Math.floor(Math.random() * 4); let x, y;
    if (side === 0) { x = rand(35, 445); y = 52; }
    if (side === 1) { x = 445; y = rand(55, 235); }
    if (side === 2) { x = rand(35, 445); y = 235; }
    if (side === 3) { x = 35; y = rand(55, 235); }
    const hp = boss ? 17 + (wave - 5) * 2 : 2 + Math.floor((wave - 1) / 2);
    enemies.push({ x, y, hp, maxHp: hp, boss, speed: boss ? 30 : rand(38, 51) + wave * 2, attack: rand(.4, 1.2), hit: 0, knockX: 0, knockY: 0, phase: rand(0, 7), facing: 1, id: Math.random() });
  }
  function beginWave() {
    if (wave > 5) { endGame(true); return; }
    if (wave > bestWave) { bestWave = wave; localStorage.setItem('pixelPitBest', String(bestWave)); }
    waveTotal = wave === 5 ? 1 : 3 + wave;
    waveKills = 0; enemies = []; spawnTimer = .4; gameState = 'playing';
    player.hp = Math.min(player.maxHp, player.hp + 1);
    $('statusText').textContent = `ROUND ${String(wave).padStart(2, '0')} · FIGHT!`;
    showToast(wave === 5 ? 'THE BIG CLUCK ENTERS THE RING!' : `ROUND ${String(wave).padStart(2, '0')} — FIGHT!`);
    sound(340, .16, 'triangle'); updateHud();
  }
  function endGame(won) {
    gameState = won ? 'won' : 'lost';
    if (won) { $('overlayCard').innerHTML = `<div class="eyebrow"><span class="eyebrow-line"></span> COOP LEGEND <span class="eyebrow-line"></span></div><h1>YOU<br><span>RULE</span><br>THE ROOST</h1><p>The Big Cluck has been thoroughly out-clucked.<br>You earned ${coins} scrap. Absolute barn legend.</p><button class="start-button" id="restartButton">RUN IT BACK <span>↻</span></button><div class="start-note">NO CHICKENS WERE ACTUALLY HARMED <span>✦</span></div>`; }
    else { $('overlayCard').innerHTML = `<div class="eyebrow"><span class="eyebrow-line"></span> DOWN BUT NOT OUT <span class="eyebrow-line"></span></div><h1>FOWL<br><span>PLAY</span></h1><p>You made it to round ${String(wave).padStart(2, '0')} and earned ${coins} scrap.<br>Time to get back in the coop.</p><button class="start-button" id="restartButton">TRY AGAIN <span>↻</span></button><div class="start-note">TIP: SPACE TO SWING · MOVE TO DODGE <span>✦</span></div>`; }
    overlay.classList.remove('hidden'); $('statusText').textContent = won ? 'CHAMPION OF THE ROOST!' : 'KNOCKED OUT · TRY AGAIN';
    $('restartButton').addEventListener('click', startGame); sound(won ? 600 : 100, .28, won ? 'triangle' : 'sawtooth');
  }
  function attack() {
    if (gameState !== 'playing' || attackTimer > 0) return;
    const w = upgrades[weapon]; attackTimer = w.cooldown / 1000; attackFlash = .18;
    let target = null, best = Infinity;
    for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < best) { best = d; target = e; } }
    if (target && best < 120) { attackAngle = Math.atan2(target.y - player.y, target.x - player.x); player.faceX = Math.cos(attackAngle); player.faceY = Math.sin(attackAngle); }
    else attackAngle = Math.atan2(player.faceY, player.faceX);
    const range = w.reach + (weapon === 'fork' ? 8 : 0);
    let hitAny = false;
    for (const e of enemies) {
      const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx), diff = Math.atan2(Math.sin(angle - attackAngle), Math.cos(angle - attackAngle));
      if (d < range + (e.boss ? 8 : 0) && Math.abs(diff) < .95) {
        e.hp -= w.damage; e.hit = .12; e.knockX = Math.cos(attackAngle) * 80; e.knockY = Math.sin(attackAngle) * 80;
        floating(e.x, e.y - 13, `-${w.damage}`, '#fff4bd'); hitAny = true;
        if (e.hp <= 0) defeat(e);
      }
    }
    sound(hitAny ? weapon === 'pan' ? 120 : 230 : 160, .09, weapon === 'pan' ? 'triangle' : 'square', hitAny ? .055 : .025);
    if (hitAny) shake = .07;
  }
  function defeat(enemy) {
    enemies = enemies.filter(e => e !== enemy); waveKills++;
    const reward = enemy.boss ? 28 : wave >= 4 ? 6 : 5;
    coins += reward; floating(enemy.x, enemy.y - 16, `+${reward}¢`, '#f8bd57');
    burst(enemy.x, enemy.y, enemy.boss ? '#e5ae3f' : '#f1cc54', enemy.boss ? 22 : 12);
    sound(enemy.boss ? 390 : 300, .12, 'triangle', .05); updateHud();
    if (waveKills >= waveTotal && enemies.length === 0) {
      gameState = 'between';
      if (wave >= 5) { setTimeout(() => endGame(true), 700); }
      else { $('statusText').textContent = 'ROUND CLEAR · +1 GRIT'; showToast(`ROUND CLEAR! +1 GRIT · ${wave === 4 ? 'BOSS NEXT' : 'NEXT ROUND UP'}`); setTimeout(() => { if (gameState === 'between') { wave++; beginWave(); } }, 1800); }
    }
  }
  function floating(x, y, text, color) { texts.push({ x, y, text, color, life: .8 }); }
  function burst(x, y, color, count) { for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-70, 70), vy: rand(-95, 25), life: rand(.25, .6), color, size: Math.random() > .5 ? 3 : 2 }); }
  function update(dt) {
    if (gameState !== 'playing') return;
    attackTimer = Math.max(0, attackTimer - dt); attackFlash = Math.max(0, attackFlash - dt); shake = Math.max(0, shake - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    let mx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    let my = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
    const len = Math.hypot(mx, my) || 1; mx /= len; my /= len;
    if (mx || my) { player.x += mx * player.speed * dt; player.y += my * player.speed * dt; player.faceX = mx; player.faceY = my; }
    player.x = clamp(player.x, 25, 455); player.y = clamp(player.y, 56, 241);
    spawnTimer -= dt;
    if (waveKills + enemies.length < waveTotal && spawnTimer <= 0) { spawnEnemy(wave === 5); spawnTimer = wave === 5 ? 999 : Math.max(.45, 1.05 - wave * .08); }
    for (const e of enemies) {
      e.phase += dt * 7; e.hit = Math.max(0, e.hit - dt);
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.facing = dx >= 0 ? 1 : -1;
      if (d > (e.boss ? 31 : 21)) { e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt; }
      else {
        e.attack -= dt;
        if (e.attack <= 0 && player.invuln <= 0) {
          e.attack = e.boss ? 1.1 : 1.45; player.hp--; player.invuln = .8; shake = .13;
          floating(player.x, player.y - 16, 'PECK!', '#ff8972'); sound(95, .15, 'sawtooth', .045); burst(player.x, player.y, '#f2906b', 5); updateHud();
          if (player.hp <= 0) { endGame(false); break; }
        }
      }
      if (Math.abs(e.knockX) + Math.abs(e.knockY) > 1) { e.x += e.knockX * dt; e.y += e.knockY * dt; e.knockX *= .83; e.knockY *= .83; }
    }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 100 * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const t of texts) { t.y -= 22 * dt; t.life -= dt; }
    texts = texts.filter(t => t.life > 0);
  }

  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function drawBackground() {
    rect(0, 0, 480, 270, '#526441');
    // Checkerboard grass gives the arena its chunky 8-bit texture.
    for (let y = 48; y < 260; y += 16) for (let x = (y / 16 % 2 ? 0 : 8); x < 480; x += 16) rect(x, y, 8, 8, '#5b6d48');
    rect(0, 40, 480, 12, '#a67c49'); rect(0, 52, 480, 3, '#725634');
    // Back fence, posts and little straw bundles.
    for (let x = 4; x < 480; x += 28) { rect(x, 21, 4, 30, '#714e31'); rect(x - 2, 20, 8, 5, '#b0824d'); }
    rect(0, 29, 480, 4, '#a67742'); rect(0, 42, 480, 4, '#a67742');
    for (const x of [37, 141, 337, 432]) { rect(x, 225, 15, 5, '#b18a4d'); rect(x + 3, 221, 12, 4, '#cfaa61'); rect(x + 8, 217, 8, 4, '#b18a4d'); }
    // Corner shrubs and a little water trough.
    for (const [x, y] of [[15, 57], [454, 60], [16, 215], [451, 215]]) { rect(x, y, 16, 9, '#354b35'); rect(x + 4, y - 4, 13, 8, '#40563a'); rect(x + 8, y + 7, 11, 5, '#324733'); }
    rect(203, 38, 72, 4, '#d3b475'); rect(208, 35, 62, 3, '#eee0aa');
    rect(216, 41, 46, 7, '#c2a15d');
    // floor stones and straw flecks
    for (let i = 0; i < 30; i++) { const x = (i * 71 + 19) % 470, y = 62 + (i * 43) % 188; rect(x, y, i % 3 === 0 ? 4 : 2, 2, i % 2 ? '#718050' : '#a1854f'); }
    // foreground ropes, corner pads and signs
    rect(0, 250, 480, 20, '#282c22'); rect(0, 250, 480, 3, '#d4a756');
    for (let x = 7; x < 480; x += 29) rect(x, 255, 17, 3, '#444a32');
    rect(6, 55, 5, 28, '#c58a4d'); rect(469, 55, 5, 28, '#c58a4d');
    ctx.fillStyle = '#d9c99c'; ctx.font = '6px monospace'; ctx.fillText('ROUND ' + String(wave).padStart(2, '0'), 14, 17);
    ctx.fillStyle = '#f0d26c'; ctx.fillText('✦', 452, 18);
  }
  function drawPlayer() {
    const x = Math.round(player.x), y = Math.round(player.y), facing = player.faceX >= 0 ? 1 : -1;
    const walk = gameState === 'playing' && (keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') || keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight')) ? Math.sin(performance.now() / 70) * 2 : 0;
    if (player.invuln > 0 && Math.floor(performance.now() / 70) % 2) return;
    rect(x - 8, y + 9, 17, 4, '#273b2a');
    // boots / trousers
    rect(x - 6, y + 5, 5, 8 + walk, '#403b31'); rect(x + 2, y + 5, 5, 8 - walk, '#403b31'); rect(x - 7, y + 11 + walk, 7, 3, '#342d26'); rect(x + 1, y + 11 - walk, 7, 3, '#342d26');
    rect(x - 8, y - 4, 16, 12, '#668b4c'); rect(x - 7, y - 1, 14, 4, '#89a85b');
    rect(x - 8, y - 13, 15, 10, '#d8a16c'); rect(x - 7, y - 15, 13, 4, '#533a2e'); rect(x - 8, y - 11, 15, 3, '#efc38b');
    rect(x + (facing > 0 ? 2 : -7), y - 9, 2, 2, '#30271f'); rect(x + (facing > 0 ? 5 : -8), y - 5, 3, 2, '#98583e');
    rect(x - 9, y - 2, 3, 8, '#d9a16c');
    // weapon tucked at side; big outward swing is drawn above the fighter.
    if (!attackFlash) { ctx.save(); ctx.translate(x + facing * 7, y + 2); ctx.rotate(facing * -.5); rect(0, -13, weapon === 'fork' ? 3 : 4, weapon === 'blade' ? 17 : 14, weapon === 'pan' ? '#9ea39a' : weapon === 'blade' ? '#d9e3cb' : '#ab7b43'); if (weapon === 'pan') { rect(-3, -17, 10, 7, '#686d68'); rect(-2, -16, 8, 5, '#a9aaa0'); } if (weapon === 'fork') { rect(-2, -18, 2, 6, '#dedaca'); rect(1, -18, 2, 6, '#dedaca'); } ctx.restore(); }
    if (attackFlash > 0) {
      ctx.save(); ctx.translate(x, y - 1); ctx.rotate(attackAngle); ctx.globalAlpha = Math.min(1, attackFlash * 7);
      const length = upgrades[weapon].reach;
      if (weapon === 'pan') { rect(8, -16, 16, 13, '#d1d2c4'); rect(11, -13, 10, 7, '#777c73'); rect(23, -12, 12, 4, '#9d7040'); }
      else if (weapon === 'fork') { rect(8, -3, length, 3, '#d0d5c6'); rect(8 + length - 5, -8, 3, 7, '#d0d5c6'); rect(8 + length - 2, -8, 3, 7, '#d0d5c6'); rect(8 + length + 1, -8, 3, 7, '#d0d5c6'); }
      else { rect(8, -3, length, 4, weapon === 'blade' ? '#e8eacf' : '#b37b44'); rect(16, -14, 3, 3, '#fff2b0'); rect(26, 7, 3, 3, '#fff2b0'); }
      ctx.restore();
    }
  }
  function drawChicken(e) {
    const x = Math.round(e.x), y = Math.round(e.y), bob = Math.sin(e.phase) > 0 ? 1 : 0, s = e.boss ? 1.45 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * e.facing, s);
    rect(-10, 8, 20, 4, '#35412b');
    // feet
    rect(-6, 7 + bob, 3, 6, '#da8b37'); rect(4, 7 + bob, 3, 6, '#da8b37'); rect(-9, 11 + bob, 7, 2, '#e99d42'); rect(2, 11 + bob, 8, 2, '#e99d42');
    // tail and plump body
    rect(-12, -3 + bob, 5, 6, '#e7b838'); rect(-15, -7 + bob, 5, 6, '#f5d252'); rect(-8, -8 + bob, 17, 17, e.hit ? '#fff1a0' : '#f0c943');
    rect(-5, -11 + bob, 11, 5, e.hit ? '#fff1a0' : '#f6d855'); rect(-3, -13 + bob, 4, 4, '#e94c4c'); rect(1, -14 + bob, 4, 5, '#ed5650'); rect(5, -11 + bob, 4, 4, '#df4744');
    // eye and beak
    rect(5, -6 + bob, 3, 3, '#30291c'); rect(9, -3 + bob, 7, 4, '#e88732'); rect(14, -2 + bob, 3, 2, '#ce672d');
    rect(3, 1 + bob, 5, 3, '#fff0bd');
    ctx.restore();
    if (e.boss) {
      rect(x - 16, y - 26, 32, 4, '#33352b'); rect(x - 15, y - 25, 30 * e.hp / e.maxHp, 2, '#ef6750');
      ctx.fillStyle = '#fff1bf'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText('BIG CLUCK', x, y - 30); ctx.textAlign = 'left';
    } else if (e.hp < e.maxHp) { rect(x - 8, y - 18, 16, 2, '#34362c'); rect(x - 8, y - 18, 16 * e.hp / e.maxHp, 2, '#e6644f'); }
  }
  function render() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-2, 2), rand(-1, 1));
    drawBackground();
    // approximate shadows keep depth ordering clear
    const actors = [...enemies.map(e => ({ y: e.y, draw: () => drawChicken(e) })), { y: player.y, draw: drawPlayer }].sort((a, b) => a.y - b.y);
    for (const actor of actors) actor.draw();
    for (const p of particles) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); rect(p.x, p.y, p.size, p.size, p.color); } ctx.globalAlpha = 1;
    for (const t of texts) { ctx.globalAlpha = clamp(t.life * 2, 0, 1); ctx.fillStyle = t.color; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText(t.text, t.x, t.y); } ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    ctx.restore();
  }
  function loop(now) { const dt = Math.min(.035, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); render(); requestAnimationFrame(loop); }

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    keys.add(k);
    if ((k === ' ' || k === 'enter') && gameState === 'title') startGame();
    else if (k === ' ' || k === 'j') attack();
    if (k === 'p' && gameState === 'playing') { gameState = 'paused'; $('statusText').textContent = 'PAUSED · PRESS P TO RESUME'; showToast('PAUSED'); }
    else if (k === 'p' && gameState === 'paused') { gameState = 'playing'; $('statusText').textContent = `ROUND ${String(wave).padStart(2, '0')} · FIGHT!`; }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  $('startButton').addEventListener('click', startGame);
  $('soundButton').addEventListener('click', () => { soundOn = !soundOn; $('soundButton').innerHTML = `${soundOn ? '♫' : '♪'} <span>SOUND ${soundOn ? 'ON' : 'OFF'}</span>`; if (soundOn) sound(440, .08, 'triangle'); });
  document.querySelectorAll('.upgrade-card').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.upgrade;
    if (coins < upgradeCosts[type] || gameState === 'title') { showToast('KNOCK OUT A CHICKEN FOR SCRAP!'); return; }
    coins -= upgradeCosts[type]; weapon = type; updateHud(); showToast(`${upgrades[type].name} EQUIPPED!`); sound(520, .12, 'triangle');
  }));
  // Touch input: tap arena's lower-left / lower-right zones to move or swing; draggable thumbstick-like pointer support.
  let pointer = null;
  canvas.addEventListener('pointerdown', e => {
    if (gameState === 'title') return;
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x > .69 && y > .58) attack();
    else { pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      keys.delete('w'); keys.delete('a'); keys.delete('s'); keys.delete('d');
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax > ay) keys.add(dx > 0 ? 'd' : 'a'); else keys.add(dy > 0 ? 's' : 'w');
    }
  });
  const releasePointer = e => { if (pointer && pointer.id === e.pointerId) { pointer = null; ['w', 'a', 's', 'd'].forEach(k => keys.delete(k)); } };
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
  $('bestWave').textContent = `BEST WAVE ${String(bestWave).padStart(2, '0')}`;
  updateHud();
  const oldDefeat = defeat;
  // Best-wave tracking without interrupting the combat flow.
  requestAnimationFrame(loop);
})();
