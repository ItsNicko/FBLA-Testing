#!/usr/bin/env python3
"""Auto-generate plausible answer options for placeholder questions.

Finds questions where options are the generic ['Answer 1', 'Answer 2', ...] and replaces them with
generated, topic-aware options. Preserves the original 'Answer N' index as the correct answer.

Backups: if a .bak from the earlier replace exists it will create a timestamped backup before writing.

Usage: python scripts/generate_real_answers.py
"""
from __future__ import annotations

import glob
import json
import os
import re
import shutil
import datetime
from typing import Any, List, Tuple


NEW_MARK = "Auto-generated — please review"


def timestamp() -> str:
    return datetime.datetime.now().strftime('%Y%m%d%H%M%S')


def backup_file(path: str) -> str:
    bak = path + '.bak'
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
        return bak
    bak_ts = f"{path}.bak.{timestamp()}"
    shutil.copy2(path, bak_ts)
    return bak_ts


def topic_short(topic: str) -> str:
    if not topic:
        return 'this topic'
    t = re.sub(r"[^\w\s]", ' ', topic)
    parts = [w for w in t.split() if w.lower() not in ('and', 'the', 'of', 'part')]
    return ' '.join(parts[:5]).strip()


def generate_options_and_explanation(question: str, topic: str) -> Tuple[List[str], str]:
    # lightweight heuristic generator based on question phrasing
    qlow = question.lower()
    tshort = topic_short(topic)

    if any(keyword in qlow for keyword in ('which of the following best explains', 'which of the following best describes', 'which of the following best')):
        correct = f"{tshort.capitalize()} focuses on core practices and principles"
        distractors = [
            f"It mainly concerns unrelated business activities such as marketing",
            f"It primarily aims to maximize short-term profit without regard to practice",
            f"It refers to low-level implementation details not central to {tshort}"
        ]
        opts = [correct] + distractors
        explanation = f"{tshort.capitalize()} is correctly described by the first option; the other choices are plausible distractors and need review."
        return opts, explanation

    if '(hard)' in qlow or 'challenging' in qlow:
        correct = f"Apply advanced {tshort} concepts to analyze edge-case scenarios"
        opts = [
            correct,
            f"Rely on rote memorization of basic facts",
            f"Use unrelated heuristics that don't apply to {tshort}",
            f"Make decisions without any methodology"
        ]
        explanation = f"Hard questions typically require applying higher-level {tshort} reasoning rather than recall."
        return opts, explanation

    if any(keyword in qlow for keyword in ('which is an example', 'which of the following is an example', 'which is an example of')):
        correct = f"An instance that demonstrates key aspects of {tshort}"
        opts = [
            correct,
            f"An unrelated example from a different domain",
            f"A superficially similar but incorrect instance",
            f"A nonsensical option"
        ]
        explanation = f"The correct option is the example that matches the defining properties of {tshort}."
        return opts, explanation

    # fallback generic
    correct = f"{tshort.capitalize()} primarily concerns its core principles and practices"
    opts = [
        correct,
        f"A related but narrower aspect of {tshort}",
        f"An unrelated business activity",
        f"A procedural detail not central to {tshort}"
    ]
    explanation = f"{tshort.capitalize()} relates to the main practices described above; please review for accuracy."
    return opts, explanation


def parse_answer_index(ans: Any) -> int:
    # ans might be 'Answer 1' or integer or option text
    if isinstance(ans, str):
        m = re.search(r'answer\s*(\d+)', ans, re.IGNORECASE)
        if m:
            idx = int(m.group(1)) - 1
            if idx >= 0:
                return idx
    if isinstance(ans, int):
        return ans
    return 0


def process_file(path: str) -> Tuple[int, int]:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    modified = 0
    total = 0

    topics = data.get('topics', []) if isinstance(data, dict) else []
    for topic in topics:
        topic_name = topic.get('topic', '')
        questions = topic.get('questions', [])
        for q in questions:
            total += 1
            opts = q.get('options', [])
            if not isinstance(opts, list):
                continue
            if all(isinstance(o, str) and o.strip().lower().startswith('answer') for o in opts):
                # generate options
                gen_opts, gen_expl = generate_options_and_explanation(q.get('question',''), topic_name)
                # ensure we have 4 options
                if len(gen_opts) < 4:
                    gen_opts = (gen_opts + [f"Other option {i}" for i in range(4)])[:4]
                # determine which option should be correct preserving index
                old_correct = q.get('correctAnswer')
                idx = parse_answer_index(old_correct)
                if idx < 0 or idx >= len(gen_opts):
                    idx = 0
                q['options'] = gen_opts
                q['correctAnswer'] = gen_opts[idx]
                q['explanation'] = NEW_MARK + (" — " + gen_expl if gen_expl else "")
                modified += 1

    if modified > 0:
        bak = backup_file(path)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {path}: total_questions={total}, modified={modified}, backup={bak}")
    else:
        print(f"No auto-generated replacements needed in {path} (total_questions={total})")

    return total, modified


def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    qglob = os.path.join(repo_root, 'questions', '*.json')
    files = sorted(glob.glob(qglob))
    t_q = 0
    t_mod = 0
    files_modified = 0
    for p in files:
        try:
            total, mod = process_file(p)
            t_q += total
            t_mod += mod
            if mod > 0:
                files_modified += 1
        except Exception as e:
            print(f"Error processing {p}: {e}")

    print('--- Summary ---')
    print(f'Files checked: {len(files)}')
    print(f'Files modified: {files_modified}')
    print(f'Questions scanned: {t_q}')
    print(f'Questions auto-generated: {t_mod}')


if __name__ == '__main__':
    main()
