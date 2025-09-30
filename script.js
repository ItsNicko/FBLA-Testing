let tests = [];
let currentTest = null;
let questions = [];
let progress = { done: 0, total: 0 };
let scores = { topics: {} };

let totalPoints = 0;
let streak = 0;
let loseStreak = 0;
let firstAttempt = true;

// Load JSON tests
fetch('tests.json')
  .then(res => res.json())
  .then(data => {
    tests = data.tests;
    populateTestDropdown();
  });

// Populate dropdown
function populateTestDropdown() {
  const dropdown = document.getElementById('testSelect');
  tests.forEach((test, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = test.testName;
    dropdown.appendChild(option);
  });
}

// Start test
function startTest() {
  const dropdown = document.getElementById('testSelect');
  const startBtn = document.getElementById('startBtn');
  const endBtn = document.getElementById('endBtn');
  const selectedIndex = dropdown.value;
  if (selectedIndex === '') return;

  currentTest = tests[selectedIndex];
  questions = currentTest.topics.flatMap(t =>
    t.questions.map(q => ({ ...q, topic: t.topic }))
  );
  shuffleArray(questions);

  progress = { done: 0, total: questions.length };
  scores = {};
  totalPoints = 0;
  streak = 0;
  loseStreak = 0;
  firstAttempt = true;

  dropdown.style.display = 'none';
  startBtn.style.display = 'none';
  endBtn.style.display = 'inline-block';

  generateFlashcard();
}

// Shuffle array
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Generate flashcard
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

  statsRow.append(pointsDiv, streakDiv, progressDiv);
  card.appendChild(statsRow);

  // Question
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = q.question;
  card.appendChild(questionDiv);

  // Options
  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  const explanationDiv = document.createElement('div');
  explanationDiv.className = 'explanation';
  explanationDiv.style.display = 'none';
  explanationDiv.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanationDiv);

  let answeredCorrectly = false;

  q.options.forEach(option => {
    const li = document.createElement('li');
    li.textContent = option;

    li.onclick = () => {
      if (answeredCorrectly) return;

      if (option === q.correctAnswer) {
        handleCorrect(q.topic);
        li.classList.add('correct');
        answeredCorrectly = true;

        // Lock all options visually
        Array.from(optionsList.children).forEach(opt => opt.classList.add('answered'));
        setTimeout(generateFlashcard, 800);
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
        handleWrong(q.topic);
      }

      if (firstAttempt && option !== q.correctAnswer) firstAttempt = false;
      updateStats();
    };

    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

// Keyboard support
document.addEventListener('keydown', e => {
  if (!['1','2','3','4'].includes(e.key)) return;
  const card = document.querySelector('.flashcard');
  if (!card) return;
  const options = card.querySelectorAll('.options li');
  const idx = parseInt(e.key, 10) - 1;
  if (options[idx]) options[idx].click();
});

// Correct answer handling
function handleCorrect(topic) {
  if (!scores.topics) scores.topics = {};
  if (!scores.topics[topic]) 
    scores.topics[topic] = { correct:0, total:0, firstAttemptCorrect:0 };

  scores.topics[topic].total++;
  scores.topics[topic].correct++;

  if (firstAttempt) {
    scores.topics[topic].firstAttemptCorrect++;
    streak++;
    loseStreak = 0;
    totalPoints += Math.round(100 + 100 * streak * 0.15);
  } else {
    streak = 0;
    loseStreak = 0;
  }
}

// Wrong answer handling
function handleWrong(topic) {
  if (!scores.topics[topic]) 
    scores.topics[topic] = { correct:0, total:0, firstAttemptCorrect:0 };

  scores.topics[topic].total++;

  streak = 0;
  loseStreak++;
  totalPoints = Math.max(0, totalPoints - Math.round(50 + 50 * loseStreak * 0.15));
}

// Update stats display
function updateStats() {
  document.getElementById('livePoints').textContent = `Points: ${totalPoints}`;
  document.getElementById('liveStreak').textContent = `Streak: ${streak}`;
  document.getElementById('liveProgress').textContent = `Q: ${progress.done}/${progress.total}`;
}

// End test now
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

  const percentages = labels.map(topic => {
    const { firstAttemptCorrect, total } = scores.topics[topic];
    return total > 0 ? (firstAttemptCorrect / total) * 100 : 0;
  });

  const weights = labels.map(topic => scores.topics[topic].total);
  const data = percentages.map((pct, idx) => pct * weights[idx]);

  new Chart(document.getElementById('topicChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#4CAF50','#2196F3','#FFC107','#E91E63','#9C27B0']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function(context) {
              const topic = context.label;
              const { firstAttemptCorrect, total } = scores.topics[topic];
              const pct = total > 0 ? Math.round((firstAttemptCorrect / total) * 100) : 0;
              return `${topic}: ${pct}% (${firstAttemptCorrect}/${total})`;
            }
          }
        }
      }
    }
  });

  // Hide "End Test Now" button
  const endBtn = document.getElementById('endBtn');
  endBtn.style.display = 'none';

  // Show "Start New Test" button
  const startBtn = document.createElement('button');
  startBtn.id = 'newTestBtn';
  startBtn.textContent = 'Start New Test';
  startBtn.onclick = () => {
    container.innerHTML = '';
    chartContainer.style.display = 'none';
    document.getElementById('testSelect').style.display = 'inline-block';
    document.getElementById('startBtn').style.display = 'inline-block';
    startBtn.remove();
  };

  container.appendChild(startBtn);
}
