# Automatic pnpm-lock.yaml Conflict Resolution Design

## Overview

Enhance the sync-upstream workflow to automatically resolve pnpm-lock.yaml merge conflicts when they are the only conflicted file, while preserving manual intervention for complex conflicts.

## Problem Statement

When syncing with upstream t3-oss/create-t3-turbo, pnpm-lock.yaml frequently conflicts during merges. Currently, any conflict causes the workflow to abort the merge and create an issue for manual resolution. Since lockfiles should always be regenerated rather than manually merged, this creates unnecessary manual work for a solved problem.

## Requirements

1. **Auto-fix lockfile-only conflicts**: When pnpm-lock.yaml is the ONLY conflicted file, automatically regenerate it and complete the merge
2. **Transparency**: Create PR with notification comment explaining the auto-resolution
3. **Preserve manual flow**: If ANY other files conflict, abort and create issue (current behavior)
4. **No silent failures**: Every scenario must have clear outcome (PR created, issue created, or workflow failed)

## Design

### Architecture

Conditional workflow steps approach - minimal modification to existing `.github/workflows/sync-upstream.yml` using GitHub Actions conditional execution.

### Component Design

#### 1. Conflict Detection Logic

**New step: "Analyze conflicts"**
- Runs when: merge fails
- Location: After merge attempt (after line 58)
- Actions:
  - List conflicted files: `git diff --name-only --diff-filter=U`
  - Check if only pnpm-lock.yaml conflicts
  - Set outputs: `only_lockfile` (true/false), `conflicted_files` (list)

**Implementation:**
```bash
CONFLICTED_FILES=$(git diff --name-only --diff-filter=U)
if [ "$CONFLICTED_FILES" = "pnpm-lock.yaml" ]; then
  echo "only_lockfile=true" >> $GITHUB_OUTPUT
else
  echo "only_lockfile=false" >> $GITHUB_OUTPUT
fi
echo "conflicted_files<<EOF" >> $GITHUB_OUTPUT
echo "$CONFLICTED_FILES" >> $GITHUB_OUTPUT
echo "EOF" >> $GITHUB_OUTPUT
```

#### 2. Auto-Resolution Steps

**New step: "Auto-resolve lockfile conflict"**
- Runs when: `only_lockfile == 'true'`
- Location: After conflict analysis step
- Actions:
  1. Remove conflicted lockfile: `rm pnpm-lock.yaml`
  2. Regenerate: `pnpm install`
  3. Stage: `git add pnpm-lock.yaml`
  4. Complete merge: `git commit --no-edit`
  5. Push: `git push origin $BRANCH_NAME`
- Output: `resolution_status=success`

**Error handling:**
- pnpm install failure → workflow fails (GitHub marks as failed)
- Uses `--no-edit` to preserve automatic merge commit message

#### 3. PR Creation with Notification

**Updated step: "Create Pull Request"**
- Runs when: `already_synced == 'false'` AND:
  - Original path: `merge_status == 'success'`, OR
  - Auto-fix path: `only_lockfile == 'true'` AND `resolution_status == 'success'`

**PR body enhancement:**
- Standard sync PR body (unchanged)
- Conditional auto-resolution notice:
  ```markdown
  ## ⚠️ Auto-Resolution Notice

  The pnpm-lock.yaml file had merge conflicts and was automatically regenerated.
  Please verify the lockfile changes are correct before merging.
  ```

**Implementation:**
- Use environment variable or step output to detect auto-resolution
- Conditionally append notice section to PR body

#### 4. Fallback Behavior

**Updated step: "Create Issue for Merge Conflict"**
- Runs when: `already_synced == 'false'` AND `merge_status == 'conflict'` AND `only_lockfile == 'false'`
- Body: unchanged (uses existing conflicted_files list)

### Flow Diagram

```
Merge upstream
    ↓
Success? → Yes → Create PR (standard)
    ↓
   No (conflict)
    ↓
Analyze conflicts
    ↓
Only pnpm-lock.yaml? → No → Create issue (manual resolution)
    ↓
   Yes
    ↓
Auto-resolve:
- rm pnpm-lock.yaml
- pnpm install
- git add & commit
- git push
    ↓
Success? → No → Workflow fails visibly
    ↓
   Yes
    ↓
Create PR with auto-resolution notice
```

### Success Criteria

1. Lockfile-only conflicts result in automatic PR creation
2. PRs include clear notice about auto-resolution
3. Non-lockfile conflicts preserve current manual flow
4. No silent failures - every outcome is visible
5. Workflow remains maintainable (no excessive complexity)

## Trade-offs

### Chosen Approach: Conditional Workflow Steps

**Pros:**
- Minimal changes to existing workflow
- Easy to understand and maintain
- All logic in one place
- No additional files to manage

**Cons:**
- Workflow file gets longer
- Logic not reusable across repositories
- All in bash, not independently testable

### Alternative Approaches Considered

**Composite GitHub Action:**
- Pros: Reusable, testable, clean separation
- Cons: More files, added complexity, overkill for single-repo use

**External Script:**
- Pros: Testable independently, keeps workflow clean
- Cons: Another file to maintain, bash testing complexity

## Implementation Notes

1. Modify `.github/workflows/sync-upstream.yml`
2. Add steps after line 58 (merge failure)
3. Update conditions for existing PR and issue creation steps
4. Test with manual workflow trigger
5. Monitor first automated run on next monthly sync

## Future Enhancements

- Support additional lockfile types (package-lock.json, yarn.lock, Cargo.lock)
- Add Slack/Discord notification for auto-resolutions
- Metrics tracking for auto-fix success rate
