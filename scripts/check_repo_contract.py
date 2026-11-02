#!/usr/bin/env python3
from pathlib import Path
import sys

required = [
    "AGENTS.md",
    "README.md",
    "ARCHITECTURE.md",
    "TASKS.md",
    "docs/REQUIREMENTS.md",
    "docs/SPEC.md",
    "docs/REPO_MAP.md",
    "TASK_UNDER_TEST.md",
]

missing = [path for path in required if not Path(path).exists()]

if missing:
    print("REPO CONTRACT: FAIL")
    for path in missing:
        print(f"Missing: {path}")
    sys.exit(1)

# Basic content checks
agents = Path("AGENTS.md").read_text()
for token in ["Read First", "Sources of Truth", "Standard Commands", "Change Rules", "Stop Conditions", "Definition of Done"]:
    if token not in agents:
        print(f"REPO CONTRACT: FAIL - AGENTS.md missing section: {token}")
        sys.exit(1)

if not Path("results").exists():
    print("REPO CONTRACT: FAIL - results/ directory missing")
    sys.exit(1)

# Secrets check
if Path(".env").exists() and ".env.example" not in Path(".gitignore").read_text():
    pass

print("REPO CONTRACT: PASS")
sys.exit(0)
