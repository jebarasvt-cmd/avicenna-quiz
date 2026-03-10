const socket = io();

const roundFlash = document.getElementById("roundFlash");
const soundCountdown = new Audio("/sounds/countdown.mpeg");
const soundReveal = new Audio("/sounds/reveal.mp3");
const soundRoundEnd = new Audio("/sounds/roundEnd.mp3");
const questionCounter = document.getElementById("questionCounter");
const phaseText = document.getElementById("phaseText");
const phaseSubtext = document.getElementById("phaseSubtext");
const roundBadge = document.getElementById("roundBadge");
const questionBlock = document.getElementById("questionBlock");
const screenTheme = document.getElementById("screenTheme");
const screenQuestion = document.getElementById("screenQuestion");
const screenChoices = document.getElementById("screenChoices");
const scoreboard = document.getElementById("scoreboard");
const questionSelect = document.getElementById("questionSelect");
const roundButtons = document.querySelectorAll(".round-pill");
let currentRoundTheme = "Culture générale";
const startBtn = document.getElementById("startBtn");
const revealBtn = document.getElementById("revealBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");
const timerBox = document.getElementById("timerBox");
const timerValue = document.getElementById("timerValue");
const timerFill = document.getElementById("timerFill");
const waitingStage = document.getElementById("waitingStage");
const waitingIcon = document.getElementById("waitingIcon");
const waitingTitle = document.getElementById("waitingTitle");
const waitingSubtitle = document.getElementById("waitingSubtitle");

let allQuestions = [];
let filteredQuestions = [];
let timerInterval = null;

async function loadQuestions() {
  const res = await fetch("/api/questions");
  const data = await res.json();

  allQuestions = data.map((q, i) => ({
    ...q,
    index: i
  }));

  applyRoundFilter();
}

function playSound(sound) {
  try {
    sound.currentTime = 0;
    sound.play();
  } catch (e) {
    console.log("Son non lu :", e);
  }
}

function applyRoundFilter() {
  const round = currentRoundTheme;

  filteredQuestions =
    round === "ALL"
      ? allQuestions
      : allQuestions.filter((q) => q.theme === round);

  questionSelect.innerHTML = filteredQuestions
    .map((q, i) => `<option value="${q.index}">Question ${i + 1}</option>`)
    .join("");

  roundBadge.textContent = round === "ALL" ? "Round libre" : `Round : ${round}`;
  roundButtons.forEach((btn) => {
  btn.classList.remove("active");

  if (
    (round === "Culture générale" && btn.dataset.round === "1") ||
    (round === "Religion" && btn.dataset.round === "2") ||
    (round === "Science" && btn.dataset.round === "3")
  ) {
    btn.classList.add("active");
  }
});
}

function renderScoreboard(teams) {
  if (!teams.length) {
    scoreboard.innerHTML = `<p style="opacity:.85;">Aucune équipe connectée.</p>`;
    return;
  }

const sorted = [...teams].sort((a, b) => {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const aTime =
    a.correctAnswersCount > 0
      ? a.totalCorrectResponseTime / a.correctAnswersCount
      : 999999;

  const bTime =
    b.correctAnswersCount > 0
      ? b.totalCorrectResponseTime / b.correctAnswersCount
      : 999999;

  return aTime - bTime;
});
  scoreboard.innerHTML = sorted
.map((team, index) => {
  let rowStyle = "";
  let textColor = "#fff";

  if (index === 0) {
    rowStyle = "background: linear-gradient(90deg, #ffd700, #ffb700);";
    textColor = "#000";
  } else if (index === 1) {
    rowStyle = "background: linear-gradient(90deg, #d9d9d9, #a8a8a8);";
    textColor = "#000";
  } else if (index === 2) {
    rowStyle = "background: linear-gradient(90deg, #cd7f32, #b86b24);";
    textColor = "#fff";
  }

  const medal =
  index === 0 ? "🥇" :
  index === 1 ? "🥈" :
  index === 2 ? "🥉" : "";

  return `
    <div class="score-row" style="${rowStyle} color:${textColor};">
      <div class="score-left">
        <span class="rank-badge">${medal || index + 1}</span>
        <span class="team-name">${team.teamName}</span>
      </div>
      <div class="team-score">${team.score}</div>
    </div>
  `;
})
    .join("");
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  soundCountdown.pause();
  soundCountdown.currentTime = 0;
}

function showWaitingDefault() {
  waitingStage.style.display = "block";
  waitingIcon.innerHTML = '<img src="av.png" class="timer-logo">';
  waitingTitle.textContent = "3";
  waitingSubtitle.textContent = "Préparez-vous...";
}

function showCenterCountdown(endAt) {
  clearTimer();

  waitingStage.style.display = "block";
  waitingStage.classList.add("countdown-mode");

    soundCountdown.currentTime = 0;
    soundCountdown.play();  

    waitingIcon.innerHTML = '<img src="av.png" class="timer-logo">';
  waitingSubtitle.textContent = "Préparez-vous...";

  const tick = () => {
    const remainingMs = Math.max(0, endAt - Date.now());
    const remaining = Math.ceil(remainingMs / 1000);

    waitingTitle.textContent = remaining > 0 ? remaining : "0";

    if (remainingMs <= 0) {
      clearTimer();
    }
  };

  tick();
  timerInterval = setInterval(tick, 250);
}

function renderChoices(question, reveal = false) {
  screenChoices.innerHTML = question.choices
    .map((choice, index) => {
      const letter = String.fromCharCode(65 + index);
      let cls = "answer-option";

      if (reveal && index === question.answerIndex) {
        cls += " correct";
      }

      return `
        <div class="${cls}">
          <span class="answer-letter">${letter}</span>
          <span class="answer-text">${choice}</span>
        </div>
      `;
    })
    .join("");
}

roundButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roundButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    currentRoundTheme = btn.dataset.theme;
    applyRoundFilter();
  });
});

startBtn.addEventListener("click", () => {
  const index = Number(questionSelect.value);
  if (!Number.isNaN(index)) {
    socket.emit("host:startQuestion", { index });
  }
});

function triggerRoundFlash() {
  roundFlash.classList.remove("active");
  void roundFlash.offsetWidth;
  roundFlash.classList.add("active");
}

revealBtn.addEventListener("click", () => {

  const currentIndex = questionSelect.selectedIndex;
  const lastIndex = questionSelect.options.length - 1;

  if (currentIndex === lastIndex) {
    soundRoundEnd.currentTime = 0;
    soundRoundEnd.play();
    triggerRoundFlash();
  } else {
    playSound(soundReveal);
  }

  socket.emit("host:reveal");

});


nextBtn.addEventListener("click", () => {
  socket.emit("host:nextInTheme", { theme: currentRoundTheme });
});

resetBtn.addEventListener("click", () => {
  socket.emit("host:reset");
});

socket.on("screen:update", (payload) => {
  renderScoreboard(payload.teams || []);

  if (payload.phase === "idle") {
    phaseText.textContent = "En attente...";
    phaseSubtext.textContent = "Les équipes répondront depuis leurs téléphones.";
    questionBlock.style.display = "none";
    waitingStage.style.display = "block";
    waitingStage.classList.remove("countdown-mode");
    waitingIcon.innerHTML = '<i class="fa-solid fa-bullseye"></i>';
    waitingTitle.textContent = "Question en attente";
    waitingSubtitle.textContent = "Les équipes recevront la prochaine question sur leurs téléphones.";
    timerBox.style.display = "none";
    clearTimer();
    return;
  }

  if (payload.phase === "answering" && payload.currentQuestion) {
    roundBadge.textContent = `Round : ${payload.currentQuestion.theme}`;
    
   const currentQuestionNumber = filteredQuestions.findIndex(
     q => q.id === payload.currentQuestion.id
);

    if (currentQuestionNumber !== -1) {
     questionSelect.selectedIndex = currentQuestionNumber;
     questionCounter.textContent = "Question " + (currentQuestionNumber + 1) + " / " + filteredQuestions.length;
}
    if (payload.timerEndAt) {
      phaseText.textContent = "Compte à rebours";
      phaseSubtext.textContent = "La question arrive dans quelques secondes.";
      questionBlock.style.display = "none";
      showCenterCountdown(payload.timerEndAt);
    } else {
      phaseText.textContent = "Question en cours";
      phaseSubtext.textContent = "Cliquez sur “Révéler la réponse” pour afficher la bonne.";
      waitingStage.style.display = "none";
      questionBlock.style.display = "block";
      timerBox.style.display = "none";
      clearTimer();

      screenTheme.textContent = payload.currentQuestion.theme;
      screenQuestion.textContent = payload.currentQuestion.question;
      renderChoices(payload.currentQuestion, false);
    }

    return;
  }

  if (payload.phase === "revealed" && payload.currentQuestion) {
    phaseText.textContent = "Révélation";
    phaseSubtext.textContent = "La bonne réponse est mise en évidence.";
    waitingStage.style.display = "none";
    questionBlock.style.display = "block";
    timerBox.style.display = "none";
    clearTimer();

    screenTheme.textContent = payload.currentQuestion.theme;
    screenQuestion.textContent = payload.currentQuestion.question;
    roundBadge.textContent = `Round : ${payload.currentQuestion.theme}`;
    renderChoices(payload.currentQuestion, true);
  }
});

socket.emit("screen:join");
loadQuestions();


roundButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roundButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const theme = btn.dataset.theme;
    currentRoundTheme = theme;
    applyRoundFilter();
  });
});