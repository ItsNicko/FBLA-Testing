let tests = [];
let currentTest = null;
let questions = [];
let progress = { done: 0, total: 0 };
let scores = { topics: {} };

// Scoring
let totalPoints = 0;
let streak = 0;
let loseStreak = 0;

// Track first attempt
let firstAttempt = true;

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
  // Flatten all questions from all topics
  questions = currentTest.topics.flatMap(topic =>
    topic.questions.map(q => ({ ...q, topic: topic.topic }))
  );

  shuffleArray(questions); // Shuffle only questions, not options

  progress = { done: 0, total: questions.length };
  scores = { topics: {} };
  totalPoints = 0;
  streak = 0;
  loseStreak = 0;
  firstAttempt = true;

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
  firstAttempt = true; // reset first attempt

  const card = document.createElement('div');
  card.className = 'flashcard';

  // Stats
  const statsRow = document.createElement('div');
  statsRow.style.display = 'flex';
  statsRow.style.justifyContent = 'space-between';
  statsRow.style.marginBottom = '10px';

  const pointsDiv = document.createElement('div');
  pointsDiv.id = 'livePoints';
  pointsDiv.textContent = `Points: ${totalPoints}`;

  const streakDiv = document.createElement('div');
  streakDiv.id = 'liveStreak';
  streakDiv.textContent = `Streak: ${streak}`;

  const progressDiv = document.createElement('div');
  progressDiv.id = 'liveProgress';
  progressDiv.textContent = `Q: ${progress.done}/${progress.total}`;

  statsRow.appendChild(pointsDiv);
  statsRow.appendChild(streakDiv);
  statsRow.appendChild(progressDiv);
  card.appendChild(statsRow);

  // Question
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = q.question;
  card.appendChild(questionDiv);

  // Options
  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  // Explanation hidden until wrong
  const explanationDiv = document.createElement('div');
  explanationDiv.className = 'explanation';
  explanationDiv.style.display = 'none';
  explanationDiv.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanationDiv);

  q.options.forEach(option => {
    const li = document.createElement('li');
    li.textContent = option;
    li.onclick = () => {
      if (li.classList.contains('answered')) return;

      if (option === q.correctAnswer) {
        handleCorrect(q.topic);
        li.classList.add('correct');
        li.classList.add('answered');
        setTimeout(generateFlashcard, 800);
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
        handleWrong();
      }
      firstAttempt = firstAttempt && option !== q.correctAnswer ? false : firstAttempt;
      updateStats();
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

// Keyboard support: 1-4 clicks corresponding options
document.addEventListener('keydown', (e) => {
  if (!['1','2','3','4'].includes(e.key)) return;

  const card = document.querySelector('.flashcard');
  if (!card) return;

  const optionElements = card.querySelectorAll('.options li');
  const index = parseInt(e.key, 10) - 1; // 0-based index
  if (optionElements[index]) optionElements[index].click();
});

function handleCorrect(topic) {
  if (firstAttempt) {
    streak++;
    loseStreak = 0;
    const gained = Math.round((100 * streak * 0.15) + 100);
    totalPoints += gained;
  } else {
    streak = 0;
    loseStreak = 0;
  }
  updateScores(topic, true);
}

function handleWrong() {
  streak = 0;
  loseStreak++;
  const lost = Math.round(50 + (50 * loseStreak * 0.15));
  totalPoints = Math.max(0, totalPoints - lost);
}

function updateScores(topic, isCorrect) {
  if (!scores.topics[topic]) scores.topics[topic] = { correct: 0, total: 0 };
  scores.topics[topic].total++;
  if (isCorrect) scores.topics[topic].correct++;
}

function updateStats() {
  document.getElementById('livePoints').textContent = `Points: ${totalPoints}`;
  document.getElementById('liveStreak').textContent = `Streak: ${streak}`;
  document.getElementById('liveProgress').textContent = `Q: ${progress.done}/${progress.total}`;
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
      plugins: { legend: { position: 'bottom' } }
    }
  });
}
