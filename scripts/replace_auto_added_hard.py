#!/usr/bin/env python3
"""
Replace exact explanation text 'Auto-added hard question.' with a contextual hard-question explanation.
Creates timestamped backups for each modified file and prints a report.
"""
import glob
import json
import re
from pathlib import Path
from datetime import datetime


def ts():
    return datetime.now().strftime('%Y%m%d%H%M%S')


def generate_hard_explanation(question_text, correct_answer):
    q = (question_text or '').strip()
    ca = (correct_answer or '').strip()
    if q.lower().startswith('(hard)') or 'hard' in q.lower():
        # If it's already marked hard, give a note about reasoning
        return f"This is a higher-difficulty item; {ca} is correct because it requires analysis beyond simple recall."

    # If it's a scenario
    if 'scenario' in q.lower():
        return f"Hard scenario: {ca} is the most defensible answer given the constraints in the prompt and requires applied judgment."

    # Fallback hard explanation
    return f"Hard question: {ca} is the best answer after careful consideration of the facts in the question."


def process(path: Path):
    data = json.loads(path.read_text(encoding='utf-8'))
    changed = False
    count = 0

    if 'topics' not in data:
        return False, 0

    for topic in data.get('topics', []):
        for q in topic.get('questions', []):
            expl = q.get('explanation')
            if isinstance(expl, str) and expl.strip() == 'Auto-added hard question.':
                new_expl = generate_hard_explanation(q.get('question',''), q.get('correctAnswer',''))
                q['explanation'] = new_expl
                changed = True
                count += 1

    if changed:
        bak = path.with_suffix(path.suffix + f'.bak.{ts()}')
        path.rename(bak)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

    return changed, count


def main():
    files = sorted(glob.glob('questions/*.json'))
    total_files = 0
    modified_files = 0
    total_replaced = 0

    for f in files:
        total_files += 1
        p = Path(f)
        try:
            changed, count = process(p)
            if changed:
                modified_files += 1
                total_replaced += count
                print(f'Updated {p} — explanations replaced: {count}')
            else:
                # silent for files with no matches
                pass
        except Exception as e:
            print(f'Error processing {p}: {e}')

    print('\nDone')
    print(f'Files checked: {total_files}')
    print(f'Files modified: {modified_files}')
    print(f'Explanations replaced: {total_replaced}')


if __name__ == '__main__':
    main()
