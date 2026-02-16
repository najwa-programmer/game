const socket = io();

const elPin = document.getElementById("pin");
const btnCreate = document.getElementById("btnCreate");
const btnStart = document.getElementById("btnStart");

const elTimer = document.getElementById("timer");
const elAnswered = document.getElementById("answered");

const elQMeta = document.getElementById("qMeta");
const elImg = document.getElementById("qImg");
const elPrompt = document.getElementById("qPrompt");

const elResults = document.getElementById("results");
const elLeaderboard = document.getElementById("leaderboard");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

btnCreate.onclick = () => socket.emit("host:create");
btnStart.onclick = () => socket.emit("host:start");

socket.on("host:created", ({ pin, total }) => {
  if (elPin) elPin.textContent = pin;
  btnStart.disabled = false;

  if (elQMeta) elQMeta.textContent = `Ready • ${total} questions`;
  elResults.innerHTML = `<div class="muted">Waiting…</div>`;
  elLeaderboard.innerHTML = `<div class="muted">Leaderboard will update each question.</div>`;
});

socket.on("hostTick", ({ secondsLeft, answeredCount, playerCount }) => {
  if (elTimer) elTimer.textContent = `${secondsLeft}s`;
  if (elAnswered) elAnswered.textContent = `${answeredCount}/${playerCount} answered`;
});

socket.on("hostQuestion", ({ qNumber, total, durationSec, prompt, imageUrl }) => {
  if (elQMeta) elQMeta.textContent = `Question ${qNumber}/${total} • ${durationSec}s`;
  elImg.src = imageUrl || "";
  elPrompt.textContent = prompt || "";
  elResults.innerHTML = `<div class="muted">Collecting answers…</div>`;
});

socket.on("hostReveal", ({ correctIndex, results, leaderboard }) => {
  const correctLetter = String.fromCharCode(65 + correctIndex);

  elResults.innerHTML = `
    <div><b>Correct Answer: ${correctLetter}</b></div>
    ${results.map(r => `
      <div>
        ${escapeHtml(r.name)} -
        ${r.correct ? "✅" : "❌"} |
        Time: ${r.timeSec}s |
        Total: ${r.score} correct, ${r.totalTimeSec}s
      </div>
    `).join("")}
  `;

  elLeaderboard.innerHTML = (leaderboard || []).map((p, i) =>
    `<div>#${i+1} ${escapeHtml(p.name)} - ${p.score} correct - ${(Math.round((p.totalTimeMs/1000)*10)/10)}s</div>`
  ).join("");
});

socket.on("hostEnded", ({ leaderboard }) => {
  if (elQMeta) elQMeta.textContent = "Game Over";
  if (elTimer) elTimer.textContent = "—";
  if (elAnswered) elAnswered.textContent = "";

  elPrompt.textContent = "🏆 Final Ranking";
  elImg.removeAttribute("src");

  elResults.innerHTML = `<div class="muted">✅ Finished.</div>`;

  elLeaderboard.innerHTML = (leaderboard || []).map((p, i) =>
    `<div>#${i+1} ${escapeHtml(p.name)} - ${p.score} correct - ${(Math.round((p.totalTimeMs/1000)*10)/10)}s</div>`
  ).join("");
});
socket.on("host:playerJoined", ({ name, playerCount }) => {
  elResults.innerHTML =
    `<div><b>✅ ${escapeHtml(name)}</b> joined</div>
     <div class="muted">Players: ${playerCount}</div>`
    + elResults.innerHTML;
});

socket.on("host:playerLeft", ({ name, playerCount }) => {
  elResults.innerHTML =
    `<div><b>❌ ${escapeHtml(name)}</b> left</div>
     <div class="muted">Players: ${playerCount}</div>`
    + elResults.innerHTML;
});
