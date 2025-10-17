#!/usr/bin/env python3
"""
Validate questions JSON files for placeholders and basic consistency.
Prints a report listing files with remaining placeholder explanations/options and any mismatched correctAnswer values.
"""
import json
import glob
import re
from pathlib import Path


PLACEHOLDER_EXPL_RE = re.compile(r'auto[- ]?generated', re.IGNORECASE)
RAW_OPTION_RE = re.compile(r'^\s*[A-Da-d]\s*$')
ANSWER_N_RE = re.compile(r'^Answer\s*\d+$', re.IGNORECASE)


def check_file(path: Path):
    issues = []
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception as e:
        return [f'PARSE ERROR: {e}']

    if 'topics' not in data or not isinstance(data['topics'], list):
        return ['MISSING topics array']

    for tix, topic in enumerate(data['topics']):
        qs = topic.get('questions', []) if isinstance(topic, dict) else []
        for qix, q in enumerate(qs):
            if not isinstance(q, dict):
                issues.append(f'topic[{tix}].questions[{qix}] not object')
                continue
            expl = q.get('explanation', '')
            if isinstance(expl, str) and PLACEHOLDER_EXPL_RE.search(expl):
                issues.append(f'topic[{tix}].questions[{qix}] placeholder explanation')

            opts = q.get('options')
            if not isinstance(opts, list) or len(opts) < 2:
                issues.append(f'topic[{tix}].questions[{qix}] options missing or too short')
                continue

            # detect single-letter or Answer N options
            if all(isinstance(o, str) and RAW_OPTION_RE.match(o) for o in opts):
                issues.append(f'topic[{tix}].questions[{qix}] options are single letters')

            if all(isinstance(o, str) and ANSWER_N_RE.match(o) for o in opts):
                issues.append(f'topic[{tix}].questions[{qix}] options are Answer N placeholders')

            ca = q.get('correctAnswer')
            if ca is None:
                issues.append(f'topic[{tix}].questions[{qix}] missing correctAnswer')
            else:
                # correctAnswer should match one of the options (string equality)
                if ca not in opts:
                    # but allow mapping if opts are Option 1..n
                    if isinstance(ca, str) and re.match(r'^Option\s*\d+$', ca, re.IGNORECASE) and ca not in opts:
                        issues.append(f'topic[{tix}].questions[{qix}] correctAnswer label not in options')
                    else:
                        issues.append(f'topic[{tix}].questions[{qix}] correctAnswer not among options')

    return issues


def main():
    files = sorted(glob.glob('questions/*.json'))
    total_files = 0
    files_with_issues = 0
    total_issues = 0

    for f in files:
        total_files += 1
        p = Path(f)
        issues = check_file(p)
        if issues:
            files_with_issues += 1
            total_issues += len(issues)
            print(f'ISSUES in {p}:')
            for it in issues[:200]:
                print('  -', it)
            print()
        else:
            print(f'OK: {p}')

    print('\nValidation summary:')
    print(f'Files checked: {total_files}')
    print(f'Files with issues: {files_with_issues}')
    print(f'Total issues: {total_issues}')


if __name__ == '__main__':
    main()
