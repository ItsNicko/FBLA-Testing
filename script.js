let questions = [];

fetch('tests.json')
  .then(response => response.json())
  .then(data => {
    questions = data.tests[0].questions;
    generateFlashcard();
  });

function generateFlashcard() {
  const container = document.getElementById('flashcard-container');
  container.innerHTML = '';

  const q = questions[Math.floor(Math.random() * questions.length)];

  const card = document.createElement('div');
  card.className = 'flashcard';

  const question = document.createElement('div');
  question.className = 'question';
  question.textContent = q.question;
  card.appendChild(question);

  const optionsList = document.createElement('ul');
  optionsList.className = 'options';

  q.options.forEach(option => {
    const li = document.createElement('li');
    li.textContent = option;
    li.onclick = () => {
      li.classList.add(option === q.correctAnswer ? 'correct' : 'incorrect');
    };
    optionsList.appendChild(li);
  });

  card.appendChild(optionsList);

  const explanation = document.createElement('div');
  explanation.className = 'explanation';
  explanation.textContent = `Explanation: ${q.explanation}`;
  card.appendChild(explanation);

  container.appendChild(card);
}
