let tests = [];
let currentTest = null;
let questions = [];
let progress = { done: 0, total: 0 };
let scores = { topics: {} };

// Load JSON tests
fetch('tests.json')
  .then(response => response.json())
  .then(data => {
    tests = data.tests;
    populateTestDropdown();
  });

// Populate dropdown for test selection
function populateTestDropdown() {
  const dropdown = document.getElementById('testSelect');
  tests.forEach((test, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = test.testName;
    dropdown.appendChild(option);
  });
}

// Start test
function startTest() {
  const dropdown = document.getElementById('testSelect');
  const startBtn = document.getElementById('startBtn');
  const selectedIndex = dropdown.value;

  if (selectedIndex === '') return;

  currentTest = tests[selectedIndex];
  questions = currentTest.topics.flatMap(topic =>
    topic.questions.map(q => ({ ...q, topic: topic.topic }))
  );

  // Shuffle questions
  shuffleArray(questions);

  // Reset progress + scores
  progress = { done: 0, total: questions.length };
  scores = { topics: {} };

  // Hide selection UI
  dropdown.style.display = 'none';
  startBtn.style.display = 'none';

  // Start first flashcard
  generateFlashcard();
}

// Fisher-Yates shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Generate a flashcard
function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  if (questions.length === 0) {
    endTest();
    return;
  }

  const q = questions.shift(); // take next question
  progress.done++;

  const card = document.createElement('div');
  card.className = 'flashcard';

  // Progress counter
  const progressDiv = document.createElement('div');
  progressDiv.className = 'progress';
  progressDiv.textContent = `Question ${progress.done} of ${progress.total}`;
  card.appendChild(progressDiv);

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
        li.classList.add('correct');
        updateScores(q.topic, true);
        setTimeout(generateFlashcard, 800);
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
        updateScores(q.topic, false);
      }
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

// Update scores per topic
function updateScores(topic, isCorrect) {
  if (!scores.topics[topic]) {
    scores.topics[topic] = { correct: 0, total: 0 };
  }
  scores.topics[topic].total++;
  if (isCorrect) scores.topics[topic].correct++;
}

// End of test
function endTest() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = `
    <h2>Test Complete!</h2>
    <p>You answered ${progress.done} out of ${progress.total} questions.</p>
  `;

  // Show chart
  const chartContainer = document.getElementById('chart-container');
  chartContainer.style.display = 'block';

  // Chart data
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
