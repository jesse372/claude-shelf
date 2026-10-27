---
name: memory
description: Capture and recall this machine's long-term agent memory (decisions, notes, context). Shared by Claude Code and Codex. Use to remember a decision or look something up. TRIGGERS: 'remember', 'recall', 'what did we decide', 'save this', 'look it up', 'past notes'.
---
# memory
Shared long-term memory for both Claude Code and Codex.
- Capture: `~/.claude/skills/memory/capture.sh "what happened / was decided"`
- Search:  `~/.claude/skills/memory/search.sh "query"`
Memory lives in `~/JesseOS/vault/50-memory/`, context in `~/JesseOS/vault/00-context/`.
