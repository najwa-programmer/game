const socket = io();

const elName = document.getElementById("name");
const btnJoin = document.getElementById("btnJoin");
const elStatus = document.getElementById("status");
const elTimer = document.getElementById("timer");
const elChoices = document.getElementById("choices");

let joined = false;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

socket.on("connect", () => {
  elStatus.textContent = "🟡 Connected. Enter your name and Join.";
});

socket.on("connect_error", (err) => {
  elStatus.textContent = "❌ Connection error: " + (err?.message || err);
});

btnJoin.onclick = () => {
  const name = (elName.value || "").trim();
  if (!name) {
    elStatus.textContent = "⚠️ Write your name first.";
    return;
  }
  socket.emit("player:join", { name });
};

socket.on("player:joined", () => {
  joined = true;
  elStatus.textContent = "✅ Joined. Wait for the next question…";
  btnJoin.disabled = true;
  elName.disabled = true;
});

socket.on("playerWaiting", ({ message }) => {
  elStatus.textContent = message || "Wait…";
});

socket.on("playerQuestion", ({ durationSec, labels }) => {
  if (!joined) {
    elStatus.textContent = "⚠️ Please join with your name first.";
    return;
  }

  elStatus.textContent = "🟢 Answer now!";
  let left = Number(durationSec) || 0;
  elTimer.textContent = `${left}s`;

  elChoices.innerHTML = (labels || []).map((c, i) => `
    <button class="choiceBtn" data-i="${i}">
      <b>${String.fromCharCode(65 + i)}</b> ${escapeHtml(c)}
    </button>
  `).join("");

  document.querySelectorAll(".choiceBtn").forEach((btn) => {
    btn.onclick = () => {
      const choice = Number(btn.getAttribute("data-i"));
      socket.emit("player:answer", { choice });
      elStatus.textContent = "✅ Answer sent!";
      document.querySelectorAll(".choiceBtn").forEach((b) => (b.disabled = true));
    };
  });

  const iv = setInterval(() => {
    left -= 1;
    elTimer.textContent = `${Math.max(0, left)}s`;
    if (left <= 0) clearInterval(iv);
  }, 1000);
});

socket.on("playerReveal", () => {
  elStatus.textContent = "⏳ Time’s up…";
  elChoices.innerHTML = "";
});

socket.on("playerEnded", ({ leaderboard }) => {
  elStatus.textContent = "🏁 Game ended!";
  elChoices.innerHTML = (leaderboard || []).slice(0, 5).map((p, idx) =>
    `<div class="rowLine"><span>#${idx + 1} ${escapeHtml(p.name)}</span><b>${p.score}</b></div>`
  ).join("");
});
