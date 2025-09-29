let allTests = [];
let questions = [];
let currentTest = null;
let currentQuestionIndex = 0;
let scores = { test: 0 };

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

  // Remove selector and button
  document.getElementById('test-selector').style.display = 'none';
  document.getElementById('start-test-btn').style.display = 'none';

  // Flatten questions
  questions = currentTest.topics.flatMap(topic =>
    topic.questions.map(q => ({ ...q, topic: topic.topic }))
  );

  // Shuffle questions
  shuffleArray(questions);

  // Load previous score if exists
  const loadedScores = loadScore(currentTest.testName);
  scores = loadedScores ? loadedScores : { test: 0 };

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

  if (currentQuestionIndex >= questions.length) {
    container.textContent = `Test completed! You got ${scores.test} out of ${questions.length} correct.`;
    saveScore();
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
      if (option === q.correctAnswer) {
        li.classList.add('correct');
        scores.test++;
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block';
      }

      setTimeout(() => {
        currentQuestionIndex++;
        displayProgress();
        saveScore();
        generateFlashcard();
      }, 800);
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}

// Display progress
function displayProgress() {
  const progressDiv = document.getElementById('score');
  progressDiv.innerHTML = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
}

// Save scores in localStorage
function saveScore() {
  localStorage.setItem(`score_${currentTest.testName}`, JSON.stringify(scores));
}

// Load scores from localStorage
function loadScore(testName) {
  const stored = localStorage.getItem(`score_${testName}`);
  return stored ? JSON.parse(stored) : null;
}
