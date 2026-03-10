const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.Port || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const questionsPath = path.join(__dirname, "questions.json");
let questions = [];

try {
  questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
} catch (error) {
  console.error("Erreur lors du chargement de questions.json :", error);
  questions = [];
}

const state = {
  teams: {},
  currentQuestion: null,
  currentQuestionIndex: -1,
  phase: "idle", // idle | answering | revealed
  responses: {},
  scoreboard: {},
  timerEndAt: null,
  questionStartedAt: null,
  teamSpeedStats: {}
};

function sanitizeQuestionForPlayers(question) {
  if (!question) return null;
  return {
    id: question.id,
    theme: question.theme,
    question: question.question,
    choices: question.choices,
    points: question.points || 10,
    duration: question.duration || 20
  };
}

function sanitizeQuestionForReveal(question) {
  if (!question) return null;
  return {
    id: question.id,
    theme: question.theme,
    question: question.question,
    choices: question.choices,
    answerIndex: question.answerIndex,
    points: question.points || 10,
    duration: question.duration || 20
  };
}

function getPublicTeams() {
  return Object.values(state.teams)
    .filter((team) => team.connected)
    .map((team) => {
      const stats = state.teamSpeedStats[team.teamId] || {
        totalCorrectResponseTime: 0,
        correctAnswersCount: 0,
        lastCorrectResponseTime: 999999
      };

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        connected: team.connected,
        score: state.scoreboard[team.teamId] || 0,
        hasAnswered: !!state.responses[team.teamId],
        totalCorrectResponseTime: stats.totalCorrectResponseTime,
        correctAnswersCount: stats.correctAnswersCount,
        lastCorrectResponseTime: stats.lastCorrectResponseTime
      };
    });
}

function emitStateToEveryone() {
  const screenPayload = {
    phase: state.phase,
    currentQuestion:
      state.phase === "revealed"
        ? sanitizeQuestionForReveal(state.currentQuestion)
        : state.phase === "answering"
        ? sanitizeQuestionForPlayers(state.currentQuestion)
        : null,
    teams: getPublicTeams(),
    scoreboard: state.scoreboard,
    timerEndAt: state.timerEndAt
  };

  io.to("screens").emit("screen:update", screenPayload);

  for (const team of Object.values(state.teams)) {
    const answer = state.responses[team.teamId]?.selectedIndex;
    io.to(team.socketId).emit("player:update", {
      phase: state.phase,
      currentQuestion:
        state.phase === "answering"
          ? sanitizeQuestionForPlayers(state.currentQuestion)
          : state.phase === "revealed"
          ? sanitizeQuestionForReveal(state.currentQuestion)
          : null,
      submittedAnswer: answer ?? null,
      score: state.scoreboard[team.teamId] || 0,
      teamName: team.teamName,
      hasAnswered: !!state.responses[team.teamId],
      timerEndAt: state.timerEndAt
    });
  }
}

function startQuestionByIndex(index) {
  if (index < 0 || index >= questions.length) return false;

  state.currentQuestionIndex = index;
  state.currentQuestion = questions[index];
  state.phase = "answering";
  state.responses = {};
  state.questionStartedAt = Date.now();
  state.timerEndAt = Date.now() + ((state.currentQuestion.duration || 20) * 1000);

  emitStateToEveryone();
  return true;
}

function revealCurrentQuestion() {
  if (!state.currentQuestion) return;
  if (state.phase === "revealed") return;

  state.phase = "revealed";
  state.timerEndAt = null;

  const correctIndex = state.currentQuestion.answerIndex;
  const points = state.currentQuestion.points || 10;

for (const teamId of Object.keys(state.responses)) {
  const isCorrect = state.responses[teamId].selectedIndex === correctIndex;
  state.responses[teamId].isCorrect = isCorrect;

  if (isCorrect) {
    state.scoreboard[teamId] = (state.scoreboard[teamId] || 0) + points;

    if (!state.teamSpeedStats[teamId]) {
      state.teamSpeedStats[teamId] = {
        totalCorrectResponseTime: 0,
        correctAnswersCount: 0,
        lastCorrectResponseTime: 999999
      };
    }

    state.teamSpeedStats[teamId].totalCorrectResponseTime += state.responses[teamId].responseTimeMs;
    state.teamSpeedStats[teamId].correctAnswersCount += 1;
    state.teamSpeedStats[teamId].lastCorrectResponseTime = state.responses[teamId].responseTimeMs;
  }
}

  emitStateToEveryone();
}

function resetScores() {
  state.currentQuestion = null;
  state.currentQuestionIndex = -1;
  state.phase = "idle";
  state.responses = {};
  state.timerEndAt = null;
  state.questionStartedAt = null;
  state.teamSpeedStats = {};

  const connectedTeams = {};

  for (const [teamId, team] of Object.entries(state.teams)) {
    if (team.connected) {
      connectedTeams[teamId] = team;
    }
  }

  state.teams = connectedTeams;
  state.scoreboard = {};

  for (const teamId of Object.keys(state.teams)) {
    state.scoreboard[teamId] = 0;
  }

  emitStateToEveryone();
}

setInterval(() => {
  if (state.phase === "answering" && state.timerEndAt && Date.now() >= state.timerEndAt) {
    state.timerEndAt = null;
    emitStateToEveryone();
  }
}, 500);

app.get("/api/questions", (req, res) => {
  res.json(
    questions.map((q, index) => ({
      index,
      id: q.id,
      theme: q.theme,
      question: q.question,
      points: q.points || 10,
      duration: q.duration || 20
    }))
  );
});

io.on("connection", (socket) => {
  socket.on("screen:join", () => {
    socket.join("screens");
    emitStateToEveryone();
  });

  socket.on("player:join", ({ teamId, teamName }) => {
    if (!teamId || !teamName) return;

    state.teams[teamId] = {
      teamId,
      teamName,
      socketId: socket.id,
      connected: true
    };

    if (typeof state.scoreboard[teamId] !== "number") {
      state.scoreboard[teamId] = 0;
    }

    socket.data.teamId = teamId;
    emitStateToEveryone();
  });

  socket.on("player:submit", ({ selectedIndex }) => {
    const teamId = socket.data.teamId;

    if (!teamId) return;
    if (state.phase !== "answering") return;
    if (!state.currentQuestion) return;
    if (state.responses[teamId]) return;
    if (typeof selectedIndex !== "number") return;

    const submittedAt = Date.now();
    const responseTimeMs = 
    state.questionStartedAt
      ? submittedAt - 
    state.questionStartedAt
        : 999999;

    state.responses[teamId] = {
        selectedIndex,
        submittedAt,
        responseTimeMs
};

    emitStateToEveryone();

  });

  socket.on("host:startQuestion", ({ index }) => {
    startQuestionByIndex(index);
  });

  socket.on("host:reveal", () => {
    revealCurrentQuestion();
  });

  socket.on("host:nextInTheme", ({ theme }) => {
    const startIndex = state.currentQuestionIndex + 1;

    let nextQuestion = null;
    for (let i = startIndex; i < questions.length; i += 1) {
      if (theme === "ALL" || questions[i].theme === theme) {
        nextQuestion = i;
        break;
      }
    }

    if (nextQuestion !== null) {
      startQuestionByIndex(nextQuestion);
    }
  });

  socket.on("host:adjustScore", ({ teamId, delta }) => {
    if (!teamId || typeof delta !== "number") return;
    state.scoreboard[teamId] = (state.scoreboard[teamId] || 0) + delta;
    emitStateToEveryone();
  });

  socket.on("host:reset", () => {
    resetScores();
  });

  socket.on("disconnect", () => {
    const teamId = socket.data.teamId;
    if (teamId && state.teams[teamId]) {
      state.teams[teamId].connected = false;
      emitStateToEveryone();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur par le port ${PORT}`);
});