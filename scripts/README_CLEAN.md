This folder contains a cleanup script for the `questions/` dataset.

How to run (PowerShell):

```powershell
python scripts/clean_questions.py
```

What it does:

- Creates `.bak` backups for every `questions/*.json` that doesn't already have one.
- Removes questions that appear to be placeholders:
  - Options that are single letters (e.g., ["A","B","C","D"]) or start with letter+colon ("A: ...").
  - Explanations containing "auto-generated" / "auto-added" (case-insensitive).
  - Questions containing the token "abcd".
- Writes cleaned JSON back and prints a summary.

Notes:

- This script does NOT auto-generate replacement content; it removes placeholders safely.
- Review the `.bak` files if you need to restore any removed content.
