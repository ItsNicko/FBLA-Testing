let questions = [];

// Fetch JSON and flatten all questions from all topics into a single array
fetch('tests.json')
  .then(response => response.json())
  .then(data => {
    // Flatten questions and keep track of their topic
    questions = data.tests[0].topics.flatMap(topic =>
      topic.questions.map(q => ({ ...q, topic: topic.topic }))
    );

    // Shuffle the array so the question order is random
    shuffleArray(questions);

    generateFlashcard();
  });

// Fisher-Yates shuffle to randomize question order
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  if (questions.length === 0) return;

  // Pick the first question in the shuffled array
  const q = questions.shift(); // removes it so next flashcard is different

  // Create card container
  const card = document.createElement('div');
  card.className = 'flashcard';

  // Topic name
  const topicDiv = document.createElement('div');
  topicDiv.className = 'topic';
  topicDiv.textContent = `Topic: ${q.topic}`;
  card.appendChild(topicDiv);

  // Question text (unaltered)
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = q.question; // Display exactly as in JSON
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
      } else {
        li.classList.add('incorrect');
        explanationDiv.style.display = 'block'; // show explanation only on wrong attempt
      }
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}
