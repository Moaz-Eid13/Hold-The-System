// CONSTANTS 
const G = 500;
const DT = 0.016;
const COLLISION_DIST = 18;
const OFFSCREEN_MARGIN = 80;
const TRAIL_LENGTH = 600;
const COLORS = ['#44aaff', '#ff8844', '#44ffaa'];
const GLOWS = ['rgba(64,170,255,0.6)', 'rgba(255,136,64,0.6)', 'rgba(64,255,160,0.6)'];
const NAMES = ['1', '2', '3'];

//VARIABLES 
let phase = 1;
let bodies = [];
let dragging = null;
let dragStart = null, dragCurrent = null;
let animId = null;
let simTime = 0;
let masses = [10, 10, 10];
let endReason = '';
let arrowTargets = [null, null, null];
let score = 0;
let scoreInterval = null;
let combo = 1.0;

//CANVAS
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
}

window.addEventListener('resize', () => {
    resize();
    if (phase < 3) drawSetup();
});

resize();

//MASS SLIDERS
for (let i = 0; i < 3; i++) {
    const slider = document.getElementById(`slider-${i}`);
    const val = document.getElementById(`mass-val-${i}`);
    slider.addEventListener('input', () => {
        masses[i] = +slider.value;
        val.textContent = (+slider.value / 10).toFixed(1) + '×';
        if (bodies[i]) bodies[i].mass = masses[i];
    })
}

function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function setPhaseUI(p) {
    phase = p;
    const labels = ['', 'Place Bodies', 'Set Velocities', 'Simulating'];
    document.getElementById('phase-label').innerHTML = `Phase ${p} — <b>${labels[p]}</b>`;
    document.querySelectorAll('.step').forEach((el, i) => {
        el.className = 'step' + (i + 1 < p ? ' done' : i + 1 === p ? ' active' : '');
    });
}

function setStatus(msg) {
    document.getElementById('status-msg').textContent = msg;
}

function W() { return canvas.width; }

function H() { return canvas.height; }

function drawStars() {
    ctx.fillStyle = 'rgba(200, 220, 255, 0.5)';
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
        const x = rng() * W();
        const y = rng() * H();
        const r = rng() * 1.2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function mulberry32(a) {
    return function () {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(64, 120, 180, 0.07)';
    ctx.lineWidth = 1;
    const step = 60 * devicePixelRatio;
    for (let x = 0; x < W(); x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H());
        ctx.stroke();
    }
    for (let y = 0; y < H(); y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W(), y);
        ctx.stroke();
    }
}

function drawBody(b, idx, alpha = 1) {
    const r = Math.max(6, Math.log(b.mass + 1) * 3.5);
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 4);
    grad.addColorStop(0, GLOWS[idx].replace('0.6', String(0.5 * alpha)));
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS[idx];
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${11 * devicePixelRatio}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(NAMES[idx], b.x, b.y);
    ctx.globalAlpha = 1;
}

function drawVelocityArrow(from, to, idx) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 5) return;
    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = Math.min(len, 200);
    const ex = from.x + ux * arrowLen;
    const ey = from.y + uy * arrowLen;
    ctx.save();
    ctx.strokeStyle = COLORS[idx];
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.setLineDash([8 * devicePixelRatio, 5 * devicePixelRatio]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    const headLen = 14 * devicePixelRatio;
    const angle = Math.atan2(dy, dx);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS[idx];
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    const speed = (len * 0.3).toFixed(0);
    ctx.fillStyle = COLORS[idx];
    ctx.font = `${10 * devicePixelRatio}px Space Mono, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`${speed} u/s`, ex + 10 * devicePixelRatio, ey);
    ctx.restore();
}

function drawTrail(b, idx) {
    if (b.trail.length < 2) return;
    ctx.save();
    for (let i = 1; i < b.trail.length; i++) {
        const t = i / b.trail.length;
        ctx.strokeStyle = COLORS[idx];
        ctx.globalAlpha = t * 0.5;
        ctx.lineWidth = t * 2.5 * devicePixelRatio;
        ctx.beginPath();
        ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
        ctx.lineTo(b.trail[i].x, b.trail[i].y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawSetup() {
    ctx.clearRect(0, 0, W(), H());
    drawGrid();
    drawStars();
    for (let i = 0; i < bodies.length; i++) {
        drawBody(bodies[i], i);
        if (arrowTargets[i] && dragging !== i) {
            drawVelocityArrow(arrowTargets[i].from, arrowTargets[i].to, i);
        }
    }
    if (phase === 2 && dragging !== null && dragStart && dragCurrent) {
        const from = { x: bodies[dragging].x, y: bodies[dragging].y };
        const to = {
            x: bodies[dragging].x + (bodies[dragging].x - dragCurrent.x),
            y: bodies[dragging].y + (bodies[dragging].y - dragCurrent.y)
        };
        drawVelocityArrow(from, to, dragging);
    }
}

function drawSim() {
    ctx.fillStyle = 'rgba(2, 4, 8, 0.18)';
    ctx.fillRect(0, 0, W(), H());
    drawGrid();
    for (let i = 0; i < bodies.length; i++) {
        if (!bodies[i].alive) continue;
        drawTrail(bodies[i], i);
        drawBody(bodies[i], i);
    }
}

//PHYSICS
function computeAccelerations() {
    const alive = bodies.filter(b => b.alive);
    for (const b of alive) b.ax = b.ay = 0;
    for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
            const a = alive[i];
            const b = alive[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const r2 = dx * dx + dy * dy;
            const r = Math.sqrt(r2);
            const soft = 15;
            const f = G / (r2 + soft * soft);
            const fx = f * dx / r;
            const fy = f * dy / r;
            a.ax += fx * b.mass;
            a.ay += fy * b.mass;
            b.ax -= fx * a.mass;
            b.ay -= fy * a.mass;
        }
    }
}

function stepPhysics() {
    const dt = DT;
    for (const b of bodies) {
        if (!b.alive) continue;
        b.x += b.vx * dt + 0.5 * b.ax * dt * dt;
        b.y += b.vy * dt + 0.5 * b.ay * dt * dt;
    }
    for (const b of bodies) {
        if (!b.alive) continue;
        b.ax_old = b.ax;
        b.ay_old = b.ay;
    }
    computeAccelerations();
    for (const b of bodies) {
        if (!b.alive) continue;
        b.vx += 0.5 * (b.ax_old + b.ax) * dt;
        b.vy += 0.5 * (b.ay_old + b.ay) * dt;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > TRAIL_LENGTH) b.trail.shift();
    }
}

function checkCollisions() {
    const alive = bodies.filter(b => b.alive);
    for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
            if (dist(alive[i], alive[j]) < COLLISION_DIST) {
                alive[i].alive = false;
                alive[j].alive = false;
                endReason = `Collision: ${NAMES[alive[i].idx]} & ${NAMES[alive[j].idx]} collided!`;                
            }
        }
    }
}

function checkOffscreen() {
    const m = OFFSCREEN_MARGIN * devicePixelRatio;
    for (const b of bodies) {
        if (!b.alive) continue;
        if (b.x < -m || b.x > W() + m || b.y < -m || b.y > H() + m) {
            b.alive = false;
            if (!endReason) endReason = `Body ${NAMES[b.idx]} left the system.`;
        }
    }
}

function updateStats() {
    const alive = bodies.filter(b => b.alive);
    document.getElementById('stat-time').textContent = simTime.toFixed(1) + 's';
    document.getElementById('stat-bodies').textContent = alive.length;
    document.getElementById('stat-score').textContent = Math.floor(score).toLocaleString();
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById(`stat-v${i}`);
        if(bodies[i] && bodies[i].alive) {
            const spd = Math.sqrt(bodies[i].vx ** 2 + bodies[i].vy ** 2);
            el.textContent = spd.toFixed(1) + ' u/s';
        }
        else {
            el.textContent = '—';
        }
    }
}

function simLoop() {
    for (let sub = 0; sub < 3; sub++) {
        stepPhysics();
        checkCollisions();
        checkOffscreen();
    }
    simTime += DT * 3;
    const aliveNow = bodies.filter(b => b.alive);
    let gravRate = 0;
    for (let i = 0; i < aliveNow.length; i++) {
        for (let j = i + 1; j < aliveNow.length; j++) {
            const a = aliveNow[i], b = aliveNow[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const r2 = dx * dx + dy * dy;
            const soft = 15;
            const F = G * a.mass * b.mass / (r2 + soft * soft);
            gravRate += F;
        }
    }
    const GRAV_SCALE = 0.0015;
    const strength = Math.min(gravRate * GRAV_SCALE, 1.0);
    const MAX_COMBO = 8.0;
    const COMBO_RISE = 0.6;
    const COMBO_FALL = 2.5;
    const dt = DT * 3;
    if (strength > 0.15) {
        combo = Math.min(combo + COMBO_RISE * strength * dt, MAX_COMBO);
    }
    else {
        combo = Math.max(combo - COMBO_FALL * dt, 1.0)
    }
    score += gravRate * GRAV_SCALE * combo * dt * 100;
    updateScoreDisplay();
    updateComboDisplay();
    drawSim();
    updateStats();
    const alive = bodies.filter(b => b.alive);
    if (alive.length <= 1) {
        endSimulation();
        return;
    }
    animId = requestAnimationFrame(simLoop);
}

function endSimulation() {
    cancelAnimationFrame(animId);
    document.getElementById('btn-end').disabled = true;
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const alive = bodies.filter(b => b.alive);
    if (alive.length === 1) {
        title.textContent = `${NAMES[alive[0].idx]} SURVIVES`;
        sub.textContent = endReason || 'One body remains in the system.';
    } else if (alive.length === 0) {
        title.textContent = 'SYSTEM\nCOLLAPSED';
        sub.textContent = endReason || 'All bodies are gone.';
    } else {
        title.textContent = 'SIM ENDED';
        sub.textContent = endReason;
    }
    document.getElementById('overlay').classList.add('visible');
    const overlayScore = document.getElementById('overlay-score');
    if (overlayScore) overlayScore.textContent = Math.floor(score).toLocaleString() + ' pts';
    saveScore();
}

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mousemove', onMove);
canvas.addEventListener('mouseup', onUp);

canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(touchEv(e)); }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(touchEv(e)); }, { passive: false});
canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(touchEv(e)); }, { passive: false});

function touchEv(e) {
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY };
}

function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * devicePixelRatio,
        y: (e.clientY - rect.top) * devicePixelRatio
    };
}

function onDown(e) {
    if (phase === 3) return;
    const pos = canvasXY(e);
    if (phase === 1) {
        if (bodies.length >= 3) return;
        const idx = bodies.length;
        bodies.push({
            x: pos.x, y: pos.y,
            vx: 0, vy: 0,
            ax: 0, ay: 0,
            ax_old: 0, ay_old: 0,
            mass: masses[idx],
            alive: true,
            trail: [],
            idx
        });
        if (bodies.length === 3) {
            setPhaseUI(2);
            setStatus('Drag from each body to aim its launch velocity. Like pool — drag back to shoot forward.')
        } else {
            setStatus(`Body ${NAMES[idx]} placed. Click to place Body ${NAMES[bodies.length]}.`)
        }
        drawSetup();
        return;
    }

    if (phase === 2) {
        for (let i = 0; i < bodies.length; i++) {
            if (dist(pos, bodies[i]) < 30 * devicePixelRatio) {
                dragging = i;
                dragStart = pos;
                dragCurrent = pos;
                return;
            }
        }
    }
}

function onMove(e) {
    if (phase === 2 && dragging !== null) {
        dragCurrent = canvasXY(e);
        drawSetup();
    }
}

function onUp(e) {
    if (phase === 2 && dragging !== null) {
        const pos = canvasXY(e);
        const dx = bodies[dragging].x - pos.x;
        const dy = bodies[dragging].y - pos.y;
        const scale = 0.30;
        bodies[dragging].vx = dx * scale;
        bodies[dragging].vy = dy * scale;
        const from = { x: bodies[dragging].x, y: bodies[dragging].y };
        const to = {
            x: bodies[dragging].x + (bodies[dragging].x - pos.x),
            y: bodies[dragging].y + (bodies[dragging].y -pos.y)
        };
        arrowTargets[dragging] = { from, to };
        dragging = null;
        dragStart = null;
        dragCurrent = null;
        const set = bodies.filter(b => Math.abs(b.vx) + Math.abs(b.vy) > 0.01).length;
        if (set < 3) {
            setStatus(`Velocity set for ${set}/3 bodies. Drag remaining bodies to aim them. (0 velocity = stationary)`);
        } 
        else {
            setStatus('All velocities set! Adjust masses and hit Launch.');
        }
        document.getElementById('btn-launch').disabled = false;
        drawSetup();
    }
}

document.getElementById('btn-launch').addEventListener('click', () => {
    if (bodies.length < 3) return;
    for (let i = 0; i < 3; i++) bodies[i].mass = masses[i];
    arrowTargets = [null, null, null];

    setPhaseUI(3);
    document.getElementById('stats-panel').style.display = 'flex';
    document.getElementById('btn-launch').disabled = true;
    document.getElementById('btn-end').disabled = false;
    canvas.style.cursor = 'default';
    simTime = 0;
    endReason = '';
    score = 0;
    combo = 1.0;
    updateScoreDisplay();
    updateComboDisplay();
    ctx.clearRect(0, 0, W(), H());
    drawGrid();
    drawStars();
    animId = requestAnimationFrame(simLoop);
});

document.getElementById('btn-reset').addEventListener('click', resetAll);
document.getElementById('btn-end').addEventListener('click', () => {
    if (phase !== 3) return;
    endReason = 'Simulation ended by player.';
    endSimulation();
});

function resetAll() {
    cancelAnimationFrame(animId);
    bodies = [];
    dragging = null;
    dragStart = null;
    dragCurrent = null;
    simTime = 0;
    endReason = '';
    arrowTargets = [null, null, null];
    score = 0;
    combo = 1.0;
    updateScoreDisplay();
    updateComboDisplay();
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('btn-launch').disabled = true;
    document.getElementById('btn-end').disabled = true;
    document.getElementById('stats-panel').style.display = 'none';
    canvas.style.cursor = 'crosshair';
    setPhaseUI(1);
    setStatus('Click anywhere on the canvas to place Body 1.');
    ctx.clearRect(0, 0, W(), H());
    drawGrid();
    drawStars();
}

function updateScoreDisplay() {
    const el = document.getElementById('live-score');
    if (el) el.textContent = Math.floor(score).toLocaleString();
}

function updateComboDisplay() {
    const label = document.getElementById('combo-label');
    const fill = document.getElementById('combo-fill');
    if (!label || !fill) return;
    const MAX_COMBO = 8.0;
    const pct = ((combo - 1) / (MAX_COMBO - 1)) * 100;
    fill.style.width = pct + '%';
    if (combo < 2) {
        fill.style.background = 'var(--accent1)';
        fill.style.boxShadow = '0 0 6px var(--glow1)';
    }
    else if (combo < 5) {
        fill.style.background = 'var(--accent2)';
        fill.style.boxShadow = '0 0 8px var(--glow2)';
    }
    else {
        fill.style.background = '#ff4444';
        fill.style.boxShadow = '0 0 12px rgba(255,68,68,0.8)';
    }

    label.textContent = combo.toFixed(1) + '×';
}

function saveScore() {
    const runScore = Math.floor(score);
    if (runScore <= 0) return;
    let scores = [];
    try {
        const raw = localStorage.getItem('tbp_scoreboard');
        if (raw) scores = JSON.parse(raw);
    }
    catch (_) { scores = []; }
    const now = new Date();
    scores.push({
        score: runScore,
        time: simTime.toFixed(1),
        date: now.toLocaleDateString(),
    });
    scores.sort((a, b) => b.score - a.score);
    if (scores.length > 3) scores = scores.slice(0, 3);
    try {
        localStorage.setItem('tbp_scoreboard', JSON.stringify(scores));
    }
    catch (_) {}
    renderScoreboard(scores);
}

function loadScoreboard() {
    let scores = [];
    try {
        const raw = localStorage.getItem('tbp_scoreboard');
        if (raw) scores = JSON.parse(raw);
    }
    catch (_) { scores = []; }
    renderScoreboard(scores);
}

function renderScoreboard(scores) {
    const list = document.getElementById('scoreboard-list');
    if (!list) return;
    if (!scores || scores.length === 0) {
        list.innerHTML = '<li class="sb-empty">No runs yet</li>';
        return;
    }
    const medalClass = ['sb-gold', 'sb-silver', 'sb-bronze'];
    const medalSymbol = ['#1', '#2', '#3'];
    list.innerHTML = scores.map((s, i) =>
        `<li class="sb-row ${medalClass[i] || ''}">
            <span class="sb-rank">${medalSymbol[i] || '#' + (i + 1)}</span>
            <span class="sb-score">${s.score.toLocaleString()}</span>
            <span class="sb-meta">${s.time}s · ${s.date}</span>
        </li>`
    ).join('');
}

drawGrid();
drawStars();
loadScoreboard();
