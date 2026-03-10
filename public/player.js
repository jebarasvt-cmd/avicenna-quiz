const socket = io();

const joinCard = document.getElementById("joinCard");
const gameArea = document.getElementById("gameArea");
const teamIdInput = document.getElementById("teamId");
const teamNameInput = document.getElementById("teamName");
const joinBtn = document.getElementById("joinBtn");
const teamDisplay = document.getElementById("teamDisplay");
const scoreEl = document.getElementById("score");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const questionCard = document.getElementById("questionCard");
const themeBadge = document.getElementById("themeBadge");
const questionText = document.getElementById("questionText");
const choicesList = document.getElementById("choicesList");
const submitBtn = document.getElementById("submitBtn");
const answerSentBox = document.getElementById("answerSentBox");

let selectedIndex = null;
let hasAnswered = false;
let lastQuestionId = null;
let currentTeamId = null;
let currentTeamName = null;

function saveTeam(teamId, teamName) {
  localStorage.setItem("quiz_team_id", teamId);
  localStorage.setItem("quiz_team_name", teamName);
}

function loadSavedTeam() {
  return {
    teamId: localStorage.getItem("quiz_team_id") || "",
    teamName: localStorage.getItem("quiz_team_name") || ""
  };
}

function showGame(teamName) {
  joinCard.style.display = "none";
  gameArea.style.display = "block";
  teamDisplay.textContent = teamName;
}

function showJoin() {
  joinCard.style.display = "block";
  gameArea.style.display = "none";
}

function joinTeam(teamId, teamName) {
  currentTeamId = teamId;
  currentTeamName = teamName;
  saveTeam(teamId, teamName);
  socket.emit("player:join", { teamId, teamName });
  showGame(teamName);
}

function resetSelectionState() {
  selectedIndex = null;
  submitBtn.disabled = true;
  answerSentBox.style.display = "none";
}

function setAnsweredState() {
  submitBtn.disabled = true;
  answerSentBox.style.display = "block";
}

joinBtn.addEventListener("click", () => {
  const teamId = teamIdInput.value.trim();
  const teamName = teamNameInput.value.trim();

  if (!teamId || !teamName) {
    alert("Veuillez saisir l'identifiant de l'équipe et son nom.");
    return;
  }

  joinTeam(teamId, teamName);
});

function renderChoices(choices, locked = false, correctIndex = null) {
  choicesList.innerHTML = "";
  resetSelectionState();

  choices.forEach((choice, index) => {
    if (!locked) {
      const button = document.createElement("button");
      button.className = "player-choice-btn";
      button.type = "button";
      button.innerHTML = `
        <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
        <span class="choice-text">${choice}</span>
      `;

      button.addEventListener("click", () => {
        if (hasAnswered) return;

        selectedIndex = index;

        document.querySelectorAll(".player-choice-btn").forEach((btn) => {
          btn.classList.remove("selected");
        });

        button.classList.add("selected");
        submitBtn.disabled = false;
      });

      choicesList.appendChild(button);
    } else {
      const line = document.createElement("div");
      line.className = "choice-line";

      if (index === correctIndex) {
        line.classList.add("correct");
      }

      line.innerHTML = `
        <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
        <span class="choice-text">${choice}</span>
      `;

      choicesList.appendChild(line);
    }
  });
}

submitBtn.addEventListener("click", () => {
  if (selectedIndex === null || hasAnswered) return;

  socket.emit("player:submit", { selectedIndex });

  hasAnswered = true;
  setAnsweredState();
  statusTitle.textContent = "Réponse envoyée";
  statusText.textContent = "Votre réponse a bien été enregistrée. Attendez la révélation.";
});

socket.on("connect", () => {
  const saved = loadSavedTeam();

  if (saved.teamId && saved.teamName) {
    currentTeamId = saved.teamId;
    currentTeamName = saved.teamName;
    teamIdInput.value = saved.teamId;
    teamNameInput.value = saved.teamName;

    socket.emit("player:join", {
      teamId: saved.teamId,
      teamName: saved.teamName
    });

    showGame(saved.teamName);
    statusTitle.textContent = "Connecté";
    statusText.textContent = "Connexion au jeu établie.";
  }
});

socket.on("disconnect", () => {
  statusTitle.textContent = "Connexion perdue";
  statusText.textContent = "Le téléphone a perdu la connexion. Reconnexion automatique...";
});

socket.on("player:update", (payload) => {
  scoreEl.textContent = payload.score;
  teamDisplay.textContent = payload.teamName || teamDisplay.textContent;

  if (payload.currentQuestion && payload.currentQuestion.id !== lastQuestionId) {
    hasAnswered = false;
    lastQuestionId = payload.currentQuestion.id;
  } else {
    hasAnswered = payload.hasAnswered;
  }

  if (payload.phase === "idle") {
    questionCard.style.display = "none";
    answerSentBox.style.display = "none";
    statusTitle.textContent = "En attente...";
    statusText.textContent = "L’animateur n’a pas encore lancé de question.";
    return;
  }

  if (payload.phase === "answering" && payload.currentQuestion) {
    questionCard.style.display = "block";
    themeBadge.textContent = payload.currentQuestion.theme;
    questionText.textContent = payload.currentQuestion.question;

    if (!payload.hasAnswered) {
      renderChoices(payload.currentQuestion.choices, false);
      answerSentBox.style.display = "none";
      submitBtn.style.display = "block";
      statusTitle.textContent = "Question en cours";
      statusText.textContent = "Choisissez une réponse puis validez.";
    } else {
      renderChoices(payload.currentQuestion.choices, false);
      document.querySelectorAll(".player-choice-btn").forEach((btn) => {
        btn.disabled = true;
        btn.classList.add("disabled");
      });
      submitBtn.disabled = true;
      answerSentBox.style.display = "block";
      submitBtn.style.display = "none";
      statusTitle.textContent = "Réponse envoyée";
      statusText.textContent = "Votre réponse a bien été enregistrée. Attendez la révélation.";
    }

    return;
  }

  if (payload.phase === "revealed" && payload.currentQuestion) {
    questionCard.style.display = "block";
    themeBadge.textContent = payload.currentQuestion.theme;
    questionText.textContent = payload.currentQuestion.question;
    submitBtn.style.display = "none";
    answerSentBox.style.display = "none";

    renderChoices(
      payload.currentQuestion.choices,
      true,
      payload.currentQuestion.answerIndex
    );

    statusTitle.textContent = "Révélation";
    statusText.textContent = "La bonne réponse est maintenant affichée.";
  }
});

window.addEventListener("load", () => {
  const saved = loadSavedTeam();

  if (saved.teamId && saved.teamName) {
    teamIdInput.value = saved.teamId;
    teamNameInput.value = saved.teamName;
  } else {
    showJoin();
  }
});