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

// Optional auto-click sequence: string of numbers corresponding to options (1-based)
window.autoSequence = ''; // e.g., '1234'

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
  firstAttempt = true;

  const card = document.createElement('div');
  card.className = 'flashcard';

  // Stats row
  const statsRow = document.createElement('div');
  statsRow.id = 'statsRow';
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

  // Shuffle options
  const shuffledOptions = [...q.options];
  shuffleArray(shuffledOptions);

  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  // Explanation (hidden until wrong)
  const explanationDiv = document.createElement('div');
  explanationDiv.className = 'explanation';
  explanationDiv.style.display = 'none';
  explanationDiv.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanationDiv);

  shuffledOptions.forEach((option, idx) => {
    const li = document.createElement('li');
    li.textContent = option;

    const clickHandler = () => {
      if (option === q.correctAnswer) {
        if (!li.classList.contains('answered')) {
          handleCorrect(q.topic);
          li.classList.add('correct', 'answered');
          // Immediately go to next flashcard
          generateFlashcard();
        }
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
        handleWrong();
        firstAttempt = false;
      }
      updateStats();
    };

    li.onclick = clickHandler;
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);

  // Auto-click sequence
  if (window.autoSequence) {
    const clicks = window.autoSequence.split('').map(n => parseInt(n, 10) - 1);
    const optionElements = optionsList.querySelectorAll('li');
    clicks.forEach(idx => {
      if (optionElements[idx]) optionElements[idx].click();
    });
  }
}

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
  if (!scores.topics[topic]) {
    scores.topics[topic] = { correct: 0, total: 0 };
  }
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
        backgroundColor: [
          '#4CAF50', '#2196F3', '#FFC107', '#E91E63', '#9C27B0',
          '#00BCD4', '#FF5722', '#8BC34A', '#607D8B', '#FF9800'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}
