#!/usr/bin/env python3
"""Replace placeholder question options in questions/*.json.

This script:
- Creates a .bak backup for each file it will modify (keeps existing .bak if present by appending timestamp).
- Looks for question objects where options are single-letter placeholders like ["A","B","C","D"] and an explanation containing "auto-added".
- Replaces options with ["Answer 1","Answer 2","Answer 3","Answer 4"], maps the correct answer letter to the corresponding "Answer X", and updates the explanation to ask for review.
- Writes the modified JSON back with indentation for readability.

Run from repository root: python scripts/replace_placeholders.py
"""
from __future__ import annotations

import glob
import json
import os
import re
import shutil
import datetime
from typing import Any


PLACEHOLDER_OPTIONS = ["A", "B", "C", "D"]
NEW_OPTIONS = ["Answer 1", "Answer 2", "Answer 3", "Answer 4"]
REPLACED_EXPLANATION = "Replaced placeholder options — please review and update with accurate answers."


def is_placeholder_options(options: Any) -> bool:
    if not isinstance(options, list):
        return False
    # All options are single letters A-D (maybe with whitespace)
    for o in options:
        if not isinstance(o, str):
            return False
        if not re.fullmatch(r"\s*[A-D]\s*", o):
            return False
    return True


def map_correct_answer(old: Any) -> Any:
    # If it's a single letter A-D, map to Answer X
    if isinstance(old, str):
        s = old.strip().upper()
        if s in PLACEHOLDER_OPTIONS:
            idx = PLACEHOLDER_OPTIONS.index(s)
            return NEW_OPTIONS[idx]
    # If it's numeric index 0-3
    if isinstance(old, int) and 0 <= old < len(NEW_OPTIONS):
        return NEW_OPTIONS[old]
    # Unknown format: leave as-is
    return old


def find_question_list(root: Any) -> tuple[list, str] | tuple[None, None]:
    """Return (questions_list_or_container, container_type)
    container_type can be:
      - 'list' : root is a list of questions
      - 'dict_questions' : root is a dict with top-level 'questions' list
      - 'topics' : root is a dict with 'topics', each topic has 'questions' list
    """
    if isinstance(root, list):
        return root, 'list'
    if isinstance(root, dict) and 'questions' in root and isinstance(root['questions'], list):
        return root['questions'], 'dict_questions'
    if isinstance(root, dict) and 'topics' in root and isinstance(root['topics'], list):
        # return the topics container so caller can iterate topics
        return root['topics'], 'topics'
    return None, None


def backup_file(path: str) -> str:
    bak = path + '.bak'
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
        return bak
    # if bak exists, append timestamp
    ts = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    bak_ts = f"{path}.bak.{ts}"
    shutil.copy2(path, bak_ts)
    return bak_ts


def process_file(path: str) -> tuple[int, int]:
    # returns (questions_scanned, replaced_count)
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    container_list, container = find_question_list(data)
    if container_list is None:
        print(f"Skipping {path}: unknown root structure")
        return 0, 0

    replaced = 0
    scanned = 0

    if container == 'list' or container == 'dict_questions':
        # container_list is the questions list
        for q in container_list:
            scanned += 1
            if not isinstance(q, dict):
                continue
            options = q.get('options')
            explanation = q.get('explanation', '')
            if options is None:
                continue
            if is_placeholder_options(options) and isinstance(explanation, str) and re.search(r'auto-?added', explanation, re.IGNORECASE):
                q['options'] = NEW_OPTIONS.copy()
                old_correct = q.get('correctAnswer')
                q['correctAnswer'] = map_correct_answer(old_correct)
                q['explanation'] = REPLACED_EXPLANATION
                replaced += 1

    elif container == 'topics':
        # Each topic is a dict with 'questions' list
        for topic in container_list:
            if not isinstance(topic, dict):
                continue
            questions = topic.get('questions')
            if not isinstance(questions, list):
                continue
            for q in questions:
                scanned += 1
                if not isinstance(q, dict):
                    continue
                options = q.get('options')
                explanation = q.get('explanation', '')
                if options is None:
                    continue
                if is_placeholder_options(options) and isinstance(explanation, str) and re.search(r'auto-?added', explanation, re.IGNORECASE):
                    q['options'] = NEW_OPTIONS.copy()
                    old_correct = q.get('correctAnswer')
                    q['correctAnswer'] = map_correct_answer(old_correct)
                    q['explanation'] = REPLACED_EXPLANATION
                    replaced += 1

    if replaced > 0:
        bak = backup_file(path)
        with open(path, 'w', encoding='utf-8') as f:
            # Try to preserve ASCII non-ASCII properly by using ensure_ascii=False
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {path}: scanned={scanned}, replaced={replaced}, backup={bak}")
    else:
        print(f"No placeholders in {path} (scanned={scanned})")

    return scanned, replaced


def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    qglob = os.path.join(repo_root, 'questions', '*.json')
    files = sorted(glob.glob(qglob))
    total_scanned = 0
    total_replaced = 0
    modified_files = 0

    for path in files:
        try:
            scanned, replaced = process_file(path)
            total_scanned += scanned
            total_replaced += replaced
            if replaced > 0:
                modified_files += 1
        except Exception as e:
            print(f"Error processing {path}: {e}")

    print("--- Summary ---")
    print(f"Files checked: {len(files)}")
    print(f"Files modified: {modified_files}")
    print(f"Questions scanned: {total_scanned}")
    print(f"Placeholders replaced: {total_replaced}")


if __name__ == '__main__':
    main()
