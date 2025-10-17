"""
Safe cleanup script for questions/*.json
- Creates .bak backups (if not already present)
- Removes questions where:
  * options are single letters like ["A","B","C","D"] or options entries start with a single letter plus punctuation (e.g., "A:")
  * explanation contains 'auto-' (case-insensitive) or is clearly placeholder
  * question contains "abcd" (case-insensitive)
- Writes cleaned JSON with indentation and prints a summary per file

Run locally from repository root:
  python scripts/clean_questions.py

This script does not auto-generate replacement content; it removes placeholders safely and keeps backups.
"""

from pathlib import Path
import json
import shutil
import re

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_DIR = ROOT / 'questions'
BAK_SUFFIX = '.bak'

placeholder_expl_re = re.compile(r'auto[-_\s]*(generated|added|-?question)', re.I)
single_letter_option_re = re.compile(r'^[A-D]$')
letter_colon_re = re.compile(r'^[A-D]:')
abcd_word_re = re.compile(r'\babcd\b', re.I)

summary = []

files = sorted(QUESTIONS_DIR.glob('*.json'))
if not files:
    print('No question JSON files found in', QUESTIONS_DIR)

for fp in files:
    try:
        with fp.open('r', encoding='utf8') as f:
            data = json.load(f)
    except Exception as e:
        print(f'ERROR: failed to parse {fp}: {e}')
        summary.append({'file': str(fp.name), 'error': str(e)})
        continue

    # Backup
    bak = fp.with_suffix(fp.suffix + BAK_SUFFIX)
    if not bak.exists():
        shutil.copy2(fp, bak)

    topics = data.get('topics', [])
    orig_q_count = sum(len(t.get('questions', [])) for t in topics if isinstance(t, dict))
    removed_questions = 0

    new_topics = []
    for t in topics:
        if not isinstance(t, dict):
            continue
        qs = t.get('questions') or []
        new_qs = []
        for q in qs:
            if not isinstance(q, dict):
                continue
            expl = (q.get('explanation') or '')
            qtext = (q.get('question') or '')
            opts = q.get('options') or []

            # Condition: explanation placeholder
            if expl and placeholder_expl_re.search(expl):
                removed_questions += 1
                continue

            # Condition: question contains 'abcd'
            if qtext and abcd_word_re.search(qtext):
                removed_questions += 1
                continue

            # Condition: options are single letters or simple letter-colon forms
            if isinstance(opts, list) and opts:
                opts_clean = [ (o.strip() if isinstance(o,str) else '') for o in opts ]
                if all(single_letter_option_re.match(o) for o in opts_clean):
                    removed_questions += 1
                    continue
                if all(letter_colon_re.match(o) for o in opts_clean):
                    removed_questions += 1
                    continue
                # also treat options where every option starts with 'A: It involves' or similar filler
                if all(re.match(r'^[A-D]:\s*It involves', o, re.I) for o in opts_clean if isinstance(o,str)):
                    removed_questions += 1
                    continue

            new_qs.append(q)
        if new_qs:
            t['questions'] = new_qs
            new_topics.append(t)
        else:
            # keep the topic only if it had questions originally but now none; we drop empty topics to keep dataset tidy
            pass

    data['topics'] = new_topics
    new_q_count = sum(len(t.get('questions', [])) for t in new_topics if isinstance(t, dict))

    # Write back if changed
    if new_q_count != orig_q_count:
        try:
            with fp.open('w', encoding='utf8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f'ERROR: failed to write {fp}: {e}')
            summary.append({'file': str(fp.name), 'error_write': str(e)})
            continue

    summary.append({'file': str(fp.name), 'original_questions': orig_q_count, 'new_questions': new_q_count, 'removed': orig_q_count-new_q_count})

# Print summary
print('\nCLEANUP SUMMARY:')
for s in summary:
    print(s)
