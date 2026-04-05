// ── State ──
let rawData = [];
let chartInstances = {};
let particleAnimId = null;

// ── Emotion lexicon ──
const EMOTIONS = {
  frustrated: { emoji: '😤', words: ['bug','error','broken','fail','wrong','issue','problem','crash','stuck','annoying','frustrated','ugh','damn','fix','debug','weird'] },
  curious: { emoji: '🤔', words: ['how','why','what','explain','understand','curious','wonder','explore','investigate','check','look','find','search','where','which'] },
  happy: { emoji: '😊', words: ['thanks','great','perfect','awesome','nice','love','cool','amazing','excellent','good','works','beautiful','yes','exactly','sweet'] },
  urgent: { emoji: '🔥', words: ['asap','urgent','quick','fast','immediately','hurry','now','critical','important','deploy','production','hotfix','emergency'] },
  creative: { emoji: '🎨', words: ['create','build','make','design','generate','new','idea','implement','add','feature','style','ui','component','app','project'] },
  analytical: { emoji: '🔬', words: ['analyze','test','review','compare','benchmark','performance','optimize','refactor','measure','audit','security','check'] },
  collaborative: { emoji: '🤝', words: ['help','please','can you','could you','suggest','recommend','advice','opinion','think','approach','should','best'] },
  command: { emoji: '⚡', words: ['run','execute','install','deploy','push','commit','merge','delete','remove','update','upgrade','start','stop','restart'] }
};

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','as','into','through','during',
  'before','after','above','below','between','out','off','over','under','again',
  'further','then','once','here','there','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','nor','not','only',
  'own','same','so','than','too','very','just','because','but','and','or','if',
  'while','about','up','that','this','it','its','i','me','my','we','our','you',
  'your','he','she','they','them','their','what','which','who','whom','these',
  'those','am','im','dont','ive','also','like','one','get','got','let','use',
  'need','want','see','know','make','take','go','come','try','give','thing',
  'well','way','much','many','even','still','back','any','new','first','last',
  'long','little','right','old','big','high','look','put','say','said','tell',
  'set','work','show','think','going','something','using','file','code','sure',
  'ok','yeah','yes','maybe','already','else','etc','pasted','text','lines'
]);

// ── File upload ──
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

// ── Reset / refresh ──
function resetToUpload() {
  rawData = [];
  cancelAnimationFrame(particleAnimId);
  particleAnimId = null;
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
  fileInput.value = '';
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('upload-section').classList.remove('hidden');
}

document.getElementById('refresh-btn').addEventListener('click', resetToUpload);
document.getElementById('header-title-btn').addEventListener('click', resetToUpload);

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    rawData = e.target.result.trim().split('\n').map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    if (rawData.length === 0) { alert('No valid data found in file.'); return; }
    document.getElementById('upload-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    buildDashboard();
  };
  reader.readAsText(file);
}

// ── Tabs ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'particles') startParticles();
    else { cancelAnimationFrame(particleAnimId); particleAnimId = null; }
    if (btn.dataset.tab === 'force-graph') buildForceGraph();
  });
});

// ── Chart.js global defaults ──
Chart.defaults.color = '#a1a1aa';
Chart.defaults.borderColor = '#27272a';
Chart.defaults.font.family = "'Inter', sans-serif";

// ── Build dashboard ──
function buildDashboard() {
  const prompts = rawData.map(d => d.display || '');
  const projects = [...new Set(rawData.map(d => d.project))];
  const totalWords = prompts.reduce((s, p) => s + p.split(/\s+/).filter(Boolean).length, 0);
  const avgWords = Math.round(totalWords / prompts.length);

  document.getElementById('stat-total').textContent = rawData.length.toLocaleString();
  document.getElementById('stat-projects').textContent = projects.length;
  document.getElementById('stat-words').textContent = totalWords.toLocaleString();
  document.getElementById('stat-avgwords').textContent = avgWords;

  buildWordCloud();
  buildEmotions();
  buildTimeline();
  buildProjects();
}

// ── Word frequency ──
function getWordFreqs(minLen = 3) {
  const freq = {};
  rawData.forEach(d => {
    const words = (d.display || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    words.forEach(w => {
      if (w.length >= minLen && !STOP_WORDS.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]);
}

// ── Word Cloud ──
function buildWordCloud() {
  const canvas = document.getElementById('wordcloud-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  const words = getWordFreqs().slice(0, 120);
  if (!words.length) return;

  const maxCount = words[0][1];
  const colors = ['#c084fc', '#818cf8', '#f472b6', '#34d399', '#fb923c', '#60a5fa', '#a78bfa', '#f9a8d4'];

  // Spiral placement
  const placed = [];

  words.forEach(([word, count], i) => {
    const fontSize = Math.max(10, Math.min(48, (count / maxCount) * 48));
    ctx.font = `${600} ${fontSize}px 'Space Grotesk', sans-serif`;
    const metrics = ctx.measureText(word);
    const tw = metrics.width + 6;
    const th = fontSize + 4;

    let x, y, found = false;
    for (let r = 0; r < Math.max(W, H); r += 2) {
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        x = W / 2 + r * Math.cos(a + i) - tw / 2;
        y = H / 2 + r * Math.sin(a + i) * 0.6 - th / 2;
        if (x < 5 || y < 5 || x + tw > W - 5 || y + th > H - 5) continue;
        const overlaps = placed.some(p =>
          x < p.x + p.w && x + tw > p.x && y < p.y + p.h && y + th > p.y
        );
        if (!overlaps) { found = true; break; }
      }
      if (found) break;
    }
    if (!found) return;

    placed.push({ x, y, w: tw, h: th });
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.7 + (count / maxCount) * 0.3;
    ctx.fillText(word, x + 3, y + fontSize);
    ctx.globalAlpha = 1;
  });
}

// ── Force-directed word graph ──
function buildForceGraph() {
  const container = document.getElementById('force-graph-container');
  container.innerHTML = '';
  const W = container.offsetWidth;
  const H = container.offsetHeight;

  // Build co-occurrence
  const topWords = new Set(getWordFreqs().slice(0, 60).map(w => w[0]));
  const cooccur = {};

  rawData.forEach(d => {
    const words = [...new Set(
      (d.display || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
        .filter(w => w.length >= 3 && topWords.has(w))
    )];
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const key = [words[i], words[j]].sort().join('|');
        cooccur[key] = (cooccur[key] || 0) + 1;
      }
    }
  });

  const freqs = Object.fromEntries(getWordFreqs().slice(0, 60));
  const nodes = Object.keys(freqs).map(w => ({ id: w, count: freqs[w] }));
  const links = Object.entries(cooccur)
    .filter(([, v]) => v >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 150)
    .map(([k, v]) => {
      const [s, t] = k.split('|');
      return { source: s, target: t, value: v };
    });

  const linkedNodes = new Set();
  links.forEach(l => { linkedNodes.add(l.source); linkedNodes.add(l.target); });
  const filteredNodes = nodes.filter(n => linkedNodes.has(n.id));

  const maxCount = Math.max(...filteredNodes.map(n => n.count));
  const colors = d3.scaleOrdinal(d3.schemeSet2);

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

  const simulation = d3.forceSimulation(filteredNodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(l => l.value / 20))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(d => (d.count / maxCount) * 25 + 15));

  const link = svg.append('g')
    .selectAll('line')
    .data(links).join('line')
    .attr('stroke', '#333')
    .attr('stroke-width', d => Math.min(4, d.value / 3))
    .attr('stroke-opacity', 0.4);

  const node = svg.append('g')
    .selectAll('g')
    .data(filteredNodes).join('g')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  node.append('circle')
    .attr('r', d => (d.count / maxCount) * 20 + 5)
    .attr('fill', (d, i) => colors(i % 8))
    .attr('fill-opacity', 0.7)
    .attr('stroke', (d, i) => colors(i % 8))
    .attr('stroke-width', 1.5);

  node.append('text')
    .text(d => d.id)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('fill', '#fafafa')
    .attr('font-size', d => Math.max(9, (d.count / maxCount) * 14 + 6))
    .attr('font-weight', 500)
    .attr('font-family', "'Space Grotesk', sans-serif")
    .attr('pointer-events', 'none');

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ── Emotions ──
function buildEmotions() {
  const emotionCounts = {};
  const emotionOverTime = {};

  Object.keys(EMOTIONS).forEach(e => { emotionCounts[e] = 0; });

  rawData.forEach(d => {
    const text = (d.display || '').toLowerCase();
    const date = new Date(d.timestamp).toISOString().slice(0, 7); // month
    Object.entries(EMOTIONS).forEach(([emo, { words }]) => {
      const match = words.some(w => text.includes(w));
      if (match) {
        emotionCounts[emo]++;
        if (!emotionOverTime[date]) emotionOverTime[date] = {};
        emotionOverTime[date][emo] = (emotionOverTime[date][emo] || 0) + 1;
      }
    });
  });

  // Donut chart
  const emoLabels = Object.keys(emotionCounts);
  const emoValues = emoLabels.map(e => emotionCounts[e]);
  const emoColors = ['#ef4444', '#f59e0b', '#22c55e', '#f97316', '#a855f7', '#3b82f6', '#ec4899', '#06b6d4'];

  if (chartInstances.emotionDonut) chartInstances.emotionDonut.destroy();
  chartInstances.emotionDonut = new Chart(document.getElementById('emotion-donut'), {
    type: 'doughnut',
    data: {
      labels: emoLabels.map(e => EMOTIONS[e].emoji + ' ' + e),
      datasets: [{ data: emoValues, backgroundColor: emoColors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#fafafa', padding: 12, font: { size: 12 } } }
      }
    }
  });

  // Emotion timeline (stacked bar)
  const months = Object.keys(emotionOverTime).sort();
  const datasets = emoLabels.map((emo, i) => ({
    label: EMOTIONS[emo].emoji + ' ' + emo,
    data: months.map(m => emotionOverTime[m]?.[emo] || 0),
    backgroundColor: emoColors[i],
    borderWidth: 0
  }));

  if (chartInstances.emotionTimeline) chartInstances.emotionTimeline.destroy();
  chartInstances.emotionTimeline = new Chart(document.getElementById('emotion-timeline'), {
    type: 'bar',
    data: { labels: months, datasets },
    options: {
      responsive: true,
      scales: {
        x: { stacked: true, ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
        y: { stacked: true, ticks: { color: '#71717a' }, grid: { color: '#27272a' } }
      },
      plugins: {
        legend: { labels: { color: '#fafafa', font: { size: 10 } } }
      }
    }
  });

  // Emoji bubbles
  const container = document.getElementById('emotion-bubbles');
  container.innerHTML = '';
  emoLabels.forEach(emo => {
    const div = document.createElement('div');
    div.className = 'emotion-bubble';
    div.innerHTML = `
      <span class="emoji">${EMOTIONS[emo].emoji}</span>
      <span class="count">${emotionCounts[emo]}</span>
      <span class="label">${emo}</span>
    `;
    div.style.transform = `scale(${Math.min(1.3, 0.8 + emotionCounts[emo] / (rawData.length * 0.3))})`;
    container.appendChild(div);
  });
}

// ── Timeline ──
function buildTimeline() {
  // Heatmap
  const dayCounts = {};
  const hourCounts = new Array(24).fill(0);
  const dowCounts = new Array(7).fill(0);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  rawData.forEach(d => {
    const dt = new Date(d.timestamp);
    const key = dt.toISOString().slice(0, 10);
    dayCounts[key] = (dayCounts[key] || 0) + 1;
    hourCounts[dt.getHours()]++;
    dowCounts[dt.getDay()]++;
  });

  buildHeatmap(dayCounts);

  // Hourly chart
  if (chartInstances.hourly) chartInstances.hourly.destroy();
  chartInstances.hourly = new Chart(document.getElementById('hourly-chart'), {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + ':00'),
      datasets: [{
        label: 'Prompts by Hour',
        data: hourCounts,
        backgroundColor: '#818cf880',
        borderColor: '#818cf8',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: '#71717a', maxRotation: 45 }, grid: { display: false } },
        y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // Day of week chart
  if (chartInstances.daily) chartInstances.daily.destroy();
  chartInstances.daily = new Chart(document.getElementById('daily-chart'), {
    type: 'bar',
    data: {
      labels: dayNames,
      datasets: [{
        label: 'Prompts by Day',
        data: dowCounts,
        backgroundColor: ['#f472b680', '#c084fc80', '#818cf880', '#34d39980', '#fb923c80', '#60a5fa80', '#f9a8d480'],
        borderColor: ['#f472b6', '#c084fc', '#818cf8', '#34d399', '#fb923c', '#60a5fa', '#f9a8d4'],
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: '#71717a' }, grid: { display: false } },
        y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function buildHeatmap(dayCounts) {
  const container = document.getElementById('heatmap-container');
  container.innerHTML = '';

  const dates = Object.keys(dayCounts).sort();
  if (!dates.length) return;

  const startDate = new Date(dates[0]);
  const endDate = new Date(dates[dates.length - 1]);
  const maxVal = Math.max(...Object.values(dayCounts));

  const cellSize = 13;
  const gap = 2;
  const totalDays = Math.ceil((endDate - startDate) / 86400000) + 1;
  const weeks = Math.ceil(totalDays / 7) + 1;

  const svg = d3.select(container).append('svg')
    .attr('width', weeks * (cellSize + gap) + 40)
    .attr('height', 7 * (cellSize + gap) + 30);

  const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([0, maxVal]);

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  svg.selectAll('.day-label')
    .data(dayLabels).join('text')
    .attr('x', 0).attr('y', (_, i) => i * (cellSize + gap) + cellSize + 20)
    .text(d => d).attr('font-size', 9).attr('fill', '#71717a');

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    const dow = date.getDay();
    const week = Math.floor(i / 7);
    const count = dayCounts[key] || 0;

    svg.append('rect')
      .attr('x', week * (cellSize + gap) + 30)
      .attr('y', dow * (cellSize + gap) + 15)
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 2)
      .attr('fill', count ? colorScale(count) : '#1a1a26')
      .attr('stroke', '#2a2a3a')
      .attr('stroke-width', 0.5)
      .append('title')
      .text(`${key}: ${count} prompts`);
  }
}

// ── Projects ──
function buildProjects() {
  const projCounts = {};
  rawData.forEach(d => {
    const proj = (d.project || 'unknown').split('/').pop();
    projCounts[proj] = (projCounts[proj] || 0) + 1;
  });

  const sorted = Object.entries(projCounts).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 12);
  const others = sorted.slice(12).reduce((s, [, v]) => s + v, 0);
  if (others > 0) top.push(['others', others]);

  const labels = top.map(([k]) => k);
  const values = top.map(([, v]) => v);
  const colors = ['#c084fc', '#818cf8', '#f472b6', '#34d399', '#fb923c', '#60a5fa',
    '#a78bfa', '#f9a8d4', '#22d3ee', '#84cc16', '#f43f5e', '#e879f9', '#9ca3af'];

  if (chartInstances.projectPie) chartInstances.projectPie.destroy();
  chartInstances.projectPie = new Chart(document.getElementById('project-pie'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right', labels: { color: '#fafafa', padding: 8, font: { size: 11 } } } }
    }
  });

  if (chartInstances.projectBar) chartInstances.projectBar.destroy();
  chartInstances.projectBar = new Chart(document.getElementById('project-bar'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Prompts',
        data: values,
        backgroundColor: colors.map(c => c + '80'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      scales: {
        x: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
        y: { ticks: { color: '#71717a' }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // Project activity over time
  buildProjectTimeline(sorted.slice(0, 6));
}

function buildProjectTimeline(topProjects) {
  const container = document.getElementById('project-timeline-container');
  container.innerHTML = '<canvas id="project-timeline-canvas"></canvas>';

  const monthData = {};
  rawData.forEach(d => {
    const proj = (d.project || 'unknown').split('/').pop();
    const month = new Date(d.timestamp).toISOString().slice(0, 7);
    if (!monthData[month]) monthData[month] = {};
    monthData[month][proj] = (monthData[month][proj] || 0) + 1;
  });

  const months = Object.keys(monthData).sort();
  const colors = ['#c084fc', '#818cf8', '#f472b6', '#34d399', '#fb923c', '#60a5fa'];
  const datasets = topProjects.map(([proj], i) => ({
    label: proj,
    data: months.map(m => monthData[m]?.[proj] || 0),
    borderColor: colors[i],
    backgroundColor: colors[i] + '20',
    fill: true,
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 3
  }));

  if (chartInstances.projectTimeline) chartInstances.projectTimeline.destroy();
  chartInstances.projectTimeline = new Chart(document.getElementById('project-timeline-canvas'), {
    type: 'line',
    data: { labels: months, datasets },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
        y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } }
      },
      plugins: { legend: { labels: { color: '#fafafa', font: { size: 11 } } } }
    }
  });
}

// ── Particle Flow ──
function startParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  const words = getWordFreqs().slice(0, 50);
  if (!words.length) return;

  const maxCount = words[0][1];
  const colors = ['#c084fc', '#818cf8', '#f472b6', '#34d399', '#fb923c', '#60a5fa', '#a78bfa'];

  const particles = words.map(([word, count], i) => ({
    word,
    count,
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    size: Math.max(8, (count / maxCount) * 28),
    color: colors[i % colors.length],
    alpha: 0.5 + (count / maxCount) * 0.5
  }));

  // Build connection map based on co-occurrence
  const topSet = new Set(words.map(w => w[0]));
  const connections = {};
  rawData.forEach(d => {
    const ws = [...new Set(
      (d.display || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
        .filter(w => topSet.has(w))
    )];
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const key = [ws[i], ws[j]].sort().join('|');
        connections[key] = (connections[key] || 0) + 1;
      }
    }
  });

  const strongConnections = Object.entries(connections)
    .filter(([, v]) => v >= 2)
    .map(([k, v]) => ({ pair: k.split('|'), strength: v }));

  function animate() {
    ctx.clearRect(0, 0, W, H);

    // Draw connections
    strongConnections.forEach(({ pair, strength }) => {
      const a = particles.find(p => p.word === pair[0]);
      const b = particles.find(p => p.word === pair[1]);
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 200) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(192,132,252,${Math.min(0.3, strength / 20 * (1 - dist / 200))})`;
      ctx.lineWidth = Math.min(2, strength / 5);
      ctx.stroke();
    });

    // Draw & move particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      p.x = Math.max(0, Math.min(W, p.x));
      p.y = Math.max(0, Math.min(H, p.y));

      // Glow
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.5);
      gradient.addColorStop(0, p.color + '40');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Text
      ctx.font = `${500} ${p.size}px 'Space Grotesk', sans-serif`;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.word, p.x, p.y);
      ctx.globalAlpha = 1;
    });

    particleAnimId = requestAnimationFrame(animate);
  }

  cancelAnimationFrame(particleAnimId);
  animate();
}
