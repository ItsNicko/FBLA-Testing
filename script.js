let allTests = [];
let questions = [];
let currentTest = null;
let currentQuestionIndex = 0;
let scores = { test: 0, topics: {} };

// Fetch tests JSON
fetch('tests.json')
  .then(res => res.json())
  .then(data => {
    allTests = data.tests;
    populateTestSelector();
  });

// Populate dropdown to select test
function populateTestSelector() {
  const selector = document.getElementById('test-selector');
  const startBtn = document.getElementById('start-test-btn');

  selector.innerHTML = '';
  allTests.forEach((t, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = t.testName;
    selector.appendChild(option);
  });

  startBtn.onclick = () => startTest(selector.value);
}

// Start the selected test
function startTest(testIndex) {
  currentTest = allTests[testIndex];

  // Hide selector and button
  document.getElementById('test-selector').style.display = 'none';
  document.getElementById('start-test-btn').style.display = 'none';

  // Flatten questions
  questions = currentTest.topics.flatMap(topic =>
    topic.questions.map(q => ({ ...q, topic: topic.topic }))
  );

  // Shuffle questions
  shuffleArray(questions);

  // Reset score
  scores = { test: 0, topics: {} };
  currentQuestionIndex = 0;

  displayProgress();
  generateFlashcard();
}

// Shuffle array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Generate flashcard
function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  // End of test
  if (currentQuestionIndex >= questions.length) {
    container.innerHTML = `
      <h3>Test completed!</h3>
      <p>You got ${scores.test} out of ${questions.length} correct.</p>
      <canvas id="topicChart" width="400" height="400"></canvas>
      <button id="restart-btn">Restart Test</button>
    `;
    showTopicChart();
    document.getElementById('restart-btn').onclick = () => restartTest();
    return;
  }

  const q = questions[currentQuestionIndex];

  const card = document.createElement('div');
  card.className = 'flashcard';

  // Question
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = q.question;
  card.appendChild(questionDiv);

  // Options
  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  // Explanation (hidden initially)
  const explanationDiv = document.createElement('div');
  explanationDiv.className = 'explanation';
  explanationDiv.style.display = 'none';
  explanationDiv.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanationDiv);

  q.options.forEach(option => {
    const li = document.createElement('li');
    li.textContent = option;
    li.onclick = () => {
      // Track topic
      if (!scores.topics[q.topic]) {
        scores.topics[q.topic] = { correct: 0, total: 0 };
      }
      scores.topics[q.topic].total++;

      if (option === q.correctAnswer) {
        li.classList.add('correct');
        scores.test++;
        scores.topics[q.topic].correct++;
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
      }

      setTimeout(() => {
        currentQuestionIndex++;
        displayProgress();
        generateFlashcard();
      }, 800);
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

// Display progress only (no score during test)
function displayProgress() {
  const progressDiv = document.getElementById('score');
  progressDiv.innerHTML = `Questions completed: ${currentQuestionIndex} / ${questions.length}`;
}

// Show per-topic chart at the end
function showTopicChart() {
  const ctx = document.getElementById('topicChart').getContext('2d');

  const labels = Object.keys(scores.topics);
  const percentages = labels.map(topic => {
    const { correct, total } = scores.topics[topic];
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  });

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        label: 'Score %',
        data: percentages,
        backgroundColor: [
          '#4CAF50', '#2196F3', '#FFC107', '#FF5722',
          '#9C27B0', '#00BCD4', '#795548', '#8BC34A'
        ],
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              const topic = labels[context.dataIndex];
              const { correct, total } = scores.topics[topic];
              return `${topic}: ${correct}/${total} (${percentages[context.dataIndex]}%)`;
            }
          }
        }
      }
    }
  });
}

// Restart test
function restartTest() {
  scores = { test: 0, topics: {} };
  currentQuestionIndex = 0;
  shuffleArray(questions);
  displayProgress();
  generateFlashcard();
}
