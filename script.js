let tests = [];
let currentTest = null;
let questions = [];
let progress = { done: 0, total: 0 };
let scores = { topics: {} };

// Scoring variables
let totalPoints = 0;
let streak = 0;
let wrongStreak = 0;
let nextQuestionValue = 100; // base

// Load JSON tests
fetch('tests.json')
  .then(response => response.json())
  .then(data => {
    tests = data.tests;
    populateTestDropdown();
  });

function populateTestDropdown() {
  const dropdown = document.getElementById('testSelect');
  tests.forEach((test, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = test.testName;
    dropdown.appendChild(option);
  });
}

function startTest() {
  const dropdown = document.getElementById('testSelect');
  const startBtn = document.getElementById('startBtn');
  const selectedIndex = dropdown.value;

  if (selectedIndex === '') return;

  currentTest = tests[selectedIndex];
  questions = currentTest.topics.flatMap(topic =>
    topic.questions.map(q => ({ ...q, topic: topic.topic }))
  );

  shuffleArray(questions);

  progress = { done: 0, total: questions.length };
  scores = { topics: {} };
  totalPoints = 0;
  streak = 0;
  wrongStreak = 0;
  nextQuestionValue = 100;

  dropdown.style.display = 'none';
  startBtn.style.display = 'none';

  generateFlashcard();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  if (questions.length === 0) {
    endTest();
    return;
  }

  const q = questions.shift();
  progress.done++;

  const card = document.createElement('div');
  card.className = 'flashcard';

  // Progress counter
  const progressDiv = document.createElement('div');
  progressDiv.className = 'progress';
  progressDiv.textContent = `Question ${progress.done} of ${progress.total}`;
  card.appendChild(progressDiv);

  // Live points + streak tracker
  const statsDiv = document.createElement('div');
  statsDiv.id = 'stats';
  statsDiv.innerHTML = `
    <p id="livePoints">Points: ${totalPoints}</p>
    <p id="liveStreak">Streak: ${streak} | Next Question Value: ${nextQuestionValue} pts</p>
  `;
  card.appendChild(statsDiv);

  // Question
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = q.question;
  card.appendChild(questionDiv);

  // Options
  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  // Explanation (hidden until wrong)
  const explanationDiv = document.createElement('div');
  explanationDiv.className = 'explanation';
  explanationDiv.style.display = 'none';
  explanationDiv.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanationDiv);

  q.options.forEach(option => {
    const li = document.createElement('li');
    li.textContent = option;
    li.onclick = () => {
      if (option === q.correctAnswer) {
        if (!li.classList.contains('answered')) {
          handleCorrect(q.topic);
          updateStats();
          li.classList.add('correct');
          setTimeout(generateFlashcard, 800);
        }
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
        handleWrong();
        updateStats();
      }
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

function handleCorrect(topic) {
  if (wrongStreak === 0) {
    totalPoints += nextQuestionValue;
    streak++;
    wrongStreak = 0;
    nextQuestionValue = Math.round(nextQuestionValue * 1.15);
  } else {
    streak = 0;
    nextQuestionValue = 100;
    wrongStreak = 0;
  }

  updateScores(topic, true);
}

function handleWrong() {
  wrongStreak++;
  streak = 0;
  nextQuestionValue = 100;

  if (wrongStreak === 2) {
    totalPoints = Math.max(0, totalPoints - 50);
    wrongStreak = 0;
  }
}

function updateScores(topic, isCorrect) {
  if (!scores.topics[topic]) {
    scores.topics[topic] = { correct: 0, total: 0 };
  }
  scores.topics[topic].total++;
  if (isCorrect) scores.topics[topic].correct++;
}

function updateStats() {
  const pointsDiv = document.getElementById('livePoints');
  const streakDiv = document.getElementById('liveStreak');
  if (pointsDiv && streakDiv) {
    pointsDiv.textContent = `Points: ${totalPoints}`;
    streakDiv.textContent = `Streak: ${streak} | Next Question Value: ${nextQuestionValue} pts`;
  }
}

function endTest() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = `
    <h2>Test Complete!</h2>
    <p>You answered ${progress.done} of ${progress.total} questions.</p>
    <p><strong>Total Points: ${totalPoints}</strong></p>
  `;

  const chartContainer = document.getElementById('chart-container');
  chartContainer.style.display = 'block';

  const labels = Object.keys(scores.topics);
  const data = labels.map(topic => {
    const { correct, total } = scores.topics[topic];
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  });

  new Chart(document.getElementById('topicChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#4CAF50', '#2196F3', '#FFC107', '#E91E63', '#9C27B0']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}
