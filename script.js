let questions = [];

// Fetch JSON and flatten all questions from all topics into a single array
fetch('tests.json')
  .then(response => response.json())
  .then(data => {
    // Flatten questions and keep track of their topic
    questions = data.tests[0].topics.flatMap(topic =>
      topic.questions.map(q => ({ ...q, topic: topic.topic }))
    );
    generateFlashcard();
  });

function scrambleText(text) {
  // Split text into words, shuffle, and join back
  const words = text.split(' ');
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.join(' ');
}

function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  if (questions.length === 0) return;

  // Pick a random question
  const q = questions[Math.floor(Math.random() * questions.length)];

  // Create card container
  const card = document.createElement('div');
  card.className = 'flashcard';

  // Topic name
  const topicDiv = document.createElement('div');
  topicDiv.className = 'topic';
  topicDiv.textContent = `Topic: ${q.topic}`;
  card.appendChild(topicDiv);

  // Scrambled question text
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question';
  questionDiv.textContent = scrambleText(q.question);
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
        // Show explanation only after wrong attempt
        explanationDiv.style.display = 'block';
      }
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);
  container.appendChild(card);
}
