#!/usr/bin/env python3
"""Final pass: detect remaining placeholder option patterns across all questions, replace them,
and report which files are fully clean (no placeholders remain).

Patterns considered placeholders:
- options are exactly ["A","B","C","D"] or similar single letters
- options start with 'Answer ' (from previous pass)
- options like 'A: ...', 'B: ...' where options are letter-prefixed

The script will back up each changed file (timestamped) and write updates.
"""
from __future__ import annotations

import glob
import json
import os
import re
import shutil
import datetime
from typing import Any, List, Tuple


TS = datetime.datetime.now().strftime('%Y%m%d%H%M%S')


def backup_file(path: str) -> str:
    bak_ts = f"{path}.bak.{TS}"
    shutil.copy2(path, bak_ts)
    return bak_ts


def is_single_letter_options(options: List[Any]) -> bool:
    if not isinstance(options, list) or len(options) == 0:
        return False
    for o in options:
        if not isinstance(o, str):
            return False
        if not re.fullmatch(r"\s*[A-D]\s*", o):
            return False
    return True


def is_answerN_options(options: List[Any]) -> bool:
    if not isinstance(options, list) or len(options) == 0:
        return False
    for o in options:
        if not isinstance(o, str):
            return False
        if not re.match(r"\s*Answer\s*\d+", o, re.IGNORECASE):
            return False
    return True


def is_letter_colon_options(options: List[Any]) -> bool:
    if not isinstance(options, list) or len(options) == 0:
        return False
    count = 0
    for o in options:
        if isinstance(o, str) and re.match(r"\s*[A-D]\s*[:\-]\s*", o):
            count += 1
    return count == len(options)


def is_placeholder_options(options: Any) -> bool:
    return is_single_letter_options(options) or is_answerN_options(options) or is_letter_colon_options(options)


def topic_short(topic: str) -> str:
    if not topic:
        return 'this topic'
    t = re.sub(r"[^\w\s]", ' ', topic)
    parts = [w for w in t.split() if w.lower() not in ('and', 'the', 'of', 'part')]
    return ' '.join(parts[:5]).strip()


def generate_generic_options(question: str, topic: str) -> Tuple[List[str], str]:
    # reuse a simple heuristic similar to the earlier generator
    qlow = (question or '').lower()
    tshort = topic_short(topic)
    if 'which of the following best' in qlow or 'which of the following is' in qlow:
        correct = f"{tshort.capitalize()} focuses on core principles and practices"
        opts = [correct,
                f"A related but less central aspect of {tshort}",
                f"An unrelated activity such as marketing or sales",
                f"A technical detail not central to {tshort}"]
        expl = f"{tshort.capitalize()} is best captured by the first choice; review distractors for clarity."
        return opts, expl
    if '(hard)' in qlow or 'challenging' in qlow:
        correct = f"Apply advanced {tshort} concepts to complex scenarios"
        opts = [correct,
                f"Use simple memorization",
                f"Ignore context and select random ideas",
                f"Rely only on intuition without methodology"]
        expl = f"Hard questions typically require higher-level reasoning in {tshort}."
        return opts, expl
    # fallback
    correct = f"{tshort.capitalize()} focuses on its main practices and principles"
    opts = [correct,
            f"A narrower detail related to {tshort}",
            f"An unrelated subject",
            f"A procedural step that isn't central"]
    expl = f"{tshort.capitalize()} relates to the primary practices described above."
    return opts, expl


def parse_old_correct(old: Any) -> int:
    if isinstance(old, str):
        m = re.search(r'answer\s*(\d+)', old, re.IGNORECASE)
        if m:
            return int(m.group(1)) - 1
        m2 = re.match(r"\s*([A-D])\s*", old, re.IGNORECASE)
        if m2:
            return ord(m2.group(1).upper()) - ord('A')
        m3 = re.match(r"\s*([A-D])\s*[:\-]", old, re.IGNORECASE)
        if m3:
            return ord(m3.group(1).upper()) - ord('A')
    if isinstance(old, int):
        return old
    return 0


def scan_and_replace_file(path: str) -> Tuple[int, int]:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    modified = 0
    scanned = 0

    topics = data.get('topics', []) if isinstance(data, dict) else []
    for topic in topics:
        tname = topic.get('topic', '')
        qs = topic.get('questions', [])
        for q in qs:
            scanned += 1
            opts = q.get('options')
            if not isinstance(opts, list):
                continue
            if is_placeholder_options(opts):
                gen_opts, gen_expl = generate_generic_options(q.get('question',''), tname)
                # ensure length 4
                if len(gen_opts) < 4:
                    gen_opts = (gen_opts + [f"Other option {i}" for i in range(4)])[:4]
                old = q.get('correctAnswer')
                idx = parse_old_correct(old)
                if idx < 0 or idx >= len(gen_opts):
                    idx = 0
                q['options'] = gen_opts
                q['correctAnswer'] = gen_opts[idx]
                q['explanation'] = "Auto-generated — please review — " + gen_expl
                modified += 1

    if modified > 0:
        bak = backup_file(path)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated {os.path.basename(path)}: scanned={scanned}, modified={modified}, backup={os.path.basename(bak)}")
    else:
        print(f"No placeholders found in {os.path.basename(path)} (scanned={scanned})")

    return scanned, modified


def detect_placeholders(path: str) -> int:
    # return count of placeholder questions remaining
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    cnt = 0
    topics = data.get('topics', []) if isinstance(data, dict) else []
    for topic in topics:
        for q in topic.get('questions', []):
            opts = q.get('options')
            if isinstance(opts, list) and is_placeholder_options(opts):
                cnt += 1
    return cnt


def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    qfiles = sorted(glob.glob(os.path.join(repo_root, 'questions', '*.json')))
    total_scanned = 0
    total_modified = 0
    files_modified = 0

    for p in qfiles:
        try:
            scanned, modified = scan_and_replace_file(p)
            total_scanned += scanned
            total_modified += modified
            if modified > 0:
                files_modified += 1
        except Exception as e:
            print(f"Error processing {p}: {e}")

    # final detection pass
    clean_files = []
    files_with_placeholders = []
    for p in qfiles:
        rem = detect_placeholders(p)
        if rem == 0:
            clean_files.append((os.path.basename(p), rem))
        else:
            files_with_placeholders.append((os.path.basename(p), rem))

    print('\n--- FINAL REPORT ---')
    print(f'Files checked: {len(qfiles)}')
    print(f'Files modified this run: {files_modified}')
    print(f'Questions scanned: {total_scanned}')
    print(f'Questions modified: {total_modified}')
    print('\nFiles with no placeholders:')
    for name, _ in clean_files:
        print('  -', name)
    print('\nFiles still containing placeholders:')
    for name, cnt in files_with_placeholders:
        print(f'  - {name}: {cnt} placeholder questions remain')


if __name__ == '__main__':
    main()
