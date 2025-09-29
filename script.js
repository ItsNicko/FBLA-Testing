let allTests = [];
let questions = [];
let currentTest = null;
let currentQuestionIndex = 0;
let scores = { topic: {}, test: 0 };

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
  selector.innerHTML = '';

  allTests.forEach((t, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = t.testName;
    selector.appendChild(option);
  });

  selector.onchange = () => startTest(selector.value);
  // Auto-select first test
  startTest(0);
}

function startTest(testIndex) {
  currentTest = allTests[testIndex];

  // Flatten questions with topics
  questions = currentTest.topics.flatMap(topic =>
    topic.questions.map(q => ({ ...q, topic: topic.topic }))
  );

  // Shuffle questions
  shuffleArray(questions);

  // Load previous scores if they exist
  const loadedScores = loadScore(currentTest.testName);
  if (loadedScores) {
    scores = loadedScores;
  } else {
    // Initialize scores if no previous data
    scores = { topic: {}, test: 0 };
    questions.forEach(q => {
      if (!scores.topic[q.topic]) scores.topic[q.topic] = { correct: 0, total: 0 };
    });
  }

  currentQuestionIndex = 0;
  displayScore();
  generateFlashcard();
}

// Shuffle array (Fisher-Yates)
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

  if (currentQuestionIndex >= questions.length) {
    container.textContent = 'Test completed!';
    saveScore();
    displayScore();
    return;
  }

  const q = questions[currentQuestionIndex];

  const card = document.createElement('div');
  card.className = 'flashcard';

  // Topic
  const topicDiv = document.createElement('div');
  topicDiv.className = 'topic';
  topicDiv.textContent = `Topic: ${q.topic}`;
  card.appendChild(topicDiv);

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
      // Count total for topic
      scores.topic[q.topic].total++;

      if (option === q.correctAnswer) {
        li.classList.add('correct');
        scores.topic[q.topic].correct++;
        scores.test++;
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block'; // show explanation only on wrong attempt
      }

      // Move to next question after short delay
      setTimeout(() => {
        currentQuestionIndex++;
        displayScore();
        saveScore(); // save after each question
        generateFlashcard();
      }, 800);
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

// Display scores
function displayScore() {
  const scoreDiv = document.getElementById('score');
  if (!scoreDiv) return;

  let html = `<strong>Test Score:</strong> ${scores.test} / ${questions.length}<br>`;
  html += `<strong>Topic Scores:</strong><br>`;
  for (let topic in scores.topic) {
    const t = scores.topic[topic];
    html += `${topic}: ${t.correct} / ${t.total}<br>`;
  }

  scoreDiv.innerHTML = html;
}

// Save scores in localStorage (per test)
function saveScore() {
  localStorage.setItem(`score_${currentTest.testName}`, JSON.stringify(scores));
}

// Load scores from localStorage
function loadScore(testName) {
  const stored = localStorage.getItem(`score_${testName}`);
  return stored ? JSON.parse(stored) : null;
}
