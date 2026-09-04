---
description: Rule requiring committing and pushing changes to Git after each considerable code change.
always_on: true
---

# Git Workflow & Commit Rule

Whenever considerable or significant changes are made to the codebase (such as completing a sprint, feature, refactor, bugfix, or test suite):

1. **Verify Integrity**: Ensure all relevant automated tests pass and typechecks/builds succeed.
2. **Stage & Commit**: Stage changed files (`git add`) and create a meaningful, structured commit message describing the changes clearly (`git commit -m "..."`).
3. **Push to Remote**: Push the committed changes to the active branch (`git push origin <branch>`).
