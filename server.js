// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const questions = require("./questions");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function makePin() {
  return "PUBLIC";
}

// ترتيب: Correct أكثر، وإذا تعادلوا => TotalTime أقل
function leaderboard(room) {
  const list = Array.from(room.players.values());
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.totalTimeMs || 0) - (b.totalTimeMs || 0);
  });
  return list;
}

function startQuestion(room) {
  room.state = "QUESTION";
  room.answers.clear();
  room.qStart = Date.now();

  const q = questions[room.qIndex];

  // 🔥 الوقت كيهبط حسب رقم السؤال
  const durationSec = Math.max(5, 20 - room.qIndex);
  room.durationSec = durationSec;

  // 🔹 إرسال للـ Host
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit("hostQuestion", {
      qNumber: room.qIndex + 1,
      total: questions.length,
      durationSec,
      prompt: q.prompt,
      imageUrl: q.imageUrl,
    });
  }

  // 🔹 إرسال للـ Players
  io.to(room.pin).emit("playerQuestion", {
    durationSec,
    labels: q.choices,
  });

  clearTimeout(room.timer);
  clearInterval(room.tickIv);

  // 🔥 countdown للـ host
  room.tickIv = setInterval(() => {
    const elapsed = Math.floor((Date.now() - room.qStart) / 1000);
    const secondsLeft = Math.max(0, durationSec - elapsed);

    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit("hostTick", {
        secondsLeft,
        answeredCount: room.answers.size,
        playerCount: room.players.size,
      });
    }

    if (secondsLeft <= 0) {
      clearInterval(room.tickIv);
    }
  }, 1000);

  room.timer = setTimeout(() => endQuestion(room), durationSec * 1000);
}

function endQuestion(room) {
  if (!room || room.state !== "QUESTION") return;

  room.state = "REVEAL";
  const q = questions[room.qIndex];
  const correct = q.correctIndex;
  const durationSec = room.durationSec || 20;

  clearTimeout(room.timer);
  clearInterval(room.tickIv);

  const results = [];

  for (const p of room.players.values()) {
    if (typeof p.score !== "number") p.score = 0;
    if (typeof p.totalTimeMs !== "number") p.totalTimeMs = 0;

    const a = room.answers.get(p.id);

    // ⏱️ للعرض: جاوب => tMs، ماجاوبش => مدة السؤال
    const answered = !!a;
    const tMs = answered ? (a.tMs || 0) : durationSec * 1000;
    const timeSec = Math.round((tMs / 1000) * 10) / 10; // 0.1s

    // ✅ نقطة لكل صحيح + ⏱️ الوقت يتحسب غير فالصحيح
    let gained = 0;
    let isCorrect = false;
    if (a && a.choice === correct) {
      isCorrect = true;
      gained = 1;
      p.score += 1;

      // ✅ نجمع الوقت غير للإجابة الصحيحة
      p.totalTimeMs += tMs;
    }

    results.push({
      name: p.name,
      choice: a ? a.choice : null,
      correct: isCorrect,
      gained,
      score: p.score,
      timeSec,
      totalTimeSec: Math.round((p.totalTimeMs / 1000) * 10) / 10,
    });
  }

  const lb = leaderboard(room);

  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit("hostReveal", {
      correctIndex: correct,
      results,
      leaderboard: lb,
    });
  }

  io.to(room.pin).emit("playerReveal", {});

  setTimeout(() => nextQuestion(room), 4000);
}

function nextQuestion(room) {
  room.qIndex++;
  if (room.qIndex >= questions.length) {
    const lb = leaderboard(room);

    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit("hostEnded", { leaderboard: lb });
    }
    io.to(room.pin).emit("playerEnded", { leaderboard: lb });

    room.state = "ENDED";
    return;
  }

  startQuestion(room);
}

io.on("connection", (socket) => {
  // HOST
  socket.on("host:create", () => {
    const pin = makePin();

    let room = rooms.get(pin);
    if (!room) {
      room = {
        pin,
        hostSocketId: socket.id,
        players: new Map(),
        answers: new Map(),
        qIndex: 0,
        state: "LOBBY",
        timer: null,
        tickIv: null,
        qStart: 0,
        durationSec: 20,
      };
      rooms.set(pin, room);
    }

    room.hostSocketId = socket.id;
    socket.join(pin);

    socket.emit("host:created", { pin, total: questions.length });
  });

  socket.on("host:start", () => {
    const room = rooms.get("PUBLIC");
    if (!room) return;

    room.qIndex = 0;
    room.answers.clear();

    // Reset players
    for (const p of room.players.values()) {
      p.score = 0;
      p.totalTimeMs = 0;
    }

    startQuestion(room);
  });

  // PLAYER JOIN
  socket.on("player:join", ({ name }) => {
    const pin = "PUBLIC";

    let room = rooms.get(pin);
    if (!room) {
      room = {
        pin,
        hostSocketId: null,
        players: new Map(),
        answers: new Map(),
        qIndex: 0,
        state: "LOBBY",
        timer: null,
        tickIv: null,
        qStart: 0,
        durationSec: 20,
      };
      rooms.set(pin, room);
    }

    const cleanName = String(name || "Player").trim().slice(0, 24);

    socket.join(pin);
    room.players.set(socket.id, {
      id: socket.id,
      name: cleanName,
      score: 0,
      totalTimeMs: 0,
    });

    socket.emit("player:joined", {});

    // إذا دخل وسط السؤال: بعت ليه السؤال الحالي بالوقت الباقي
    if (room.state === "QUESTION") {
      const q = questions[room.qIndex];
      const durationSec = room.durationSec || 20;
      const elapsed = Math.floor(
        (Date.now() - (room.qStart || Date.now())) / 1000
      );
      const left = Math.max(0, durationSec - elapsed);

      socket.emit("playerQuestion", {
        durationSec: left,
        labels: q.choices,
      });
    } else {
      socket.emit("playerWaiting", {
        message: "🟡 Joined. Waiting for host to start…",
      });
    }
  });

  // PLAYER ANSWER (choice + time)
  socket.on("player:answer", ({ choice }) => {
    const room = rooms.get("PUBLIC");
    if (!room || room.state !== "QUESTION") return;
    if (room.answers.has(socket.id)) return;

    const tMs = Date.now() - room.qStart;
    room.answers.set(socket.id, { choice: Number(choice), tMs });
  });

  socket.on("disconnect", () => {
    const room = rooms.get("PUBLIC");
    if (!room) return;

    room.players.delete(socket.id);
    room.answers.delete(socket.id);

    if (room.hostSocketId === socket.id) room.hostSocketId = null;
  });
});

const PORT = 3000;
server.listen(PORT, () =>
  console.log("✅ Server running on http://localhost:3000")
);
