# Auto-Resolve Lockfile Conflicts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance sync-upstream workflow to automatically resolve pnpm-lock.yaml conflicts when they are the only conflicted file.

**Architecture:** Add conditional workflow steps that detect lockfile-only conflicts, accept upstream's lockfile and update with `pnpm install`, then create PR with notification. Preserve manual intervention for complex conflicts.

**Tech Stack:** GitHub Actions, Bash, Git, pnpm

---

## Task 1: Add Conflict Analysis Step

**Files:**
- Modify: `.github/workflows/sync-upstream.yml:52-70`

**Step 1: Read the current merge step**

Run: `cat .github/workflows/sync-upstream.yml | sed -n '43,70p'`
Expected: See the current merge attempt logic

**Step 2: Update merge step to not abort on conflict**

The current merge step aborts on conflict (line 69). We need to remove the abort so we can analyze conflicts. Modify lines 43-70:

```yaml
      - name: Create sync branch and merge upstream
        if: steps.check.outputs.already_synced == 'false'
        id: merge
        run: |
          # Create a new branch for the sync
          BRANCH_NAME="sync-upstream-$(date +%Y%m%d-%H%M%S)"
          git checkout -b $BRANCH_NAME
          echo "branch_name=$BRANCH_NAME" >> $GITHUB_ENV

          # Attempt to merge upstream changes
          if git merge upstream/main --no-edit --allow-unrelated-histories; then
            echo "Merge successful"
            echo "merge_status=success" >> $GITHUB_OUTPUT
            # Push the branch
            git push origin $BRANCH_NAME
          else
            echo "Merge conflict detected"
            echo "merge_status=conflict" >> $GITHUB_OUTPUT
            # Don't abort - let analyze step handle conflicts
          fi
```

**Step 3: Add conflict analysis step after merge**

After the merge step (after line 70), add the analyze conflicts step:

```yaml
      - name: Analyze conflicts
        if: steps.check.outputs.already_synced == 'false' && steps.merge.outputs.merge_status == 'conflict'
        id: analyze
        run: |
          # Get list of conflicted files
          CONFLICTED_FILES=$(git diff --name-only --diff-filter=U)

          # Check if ONLY pnpm-lock.yaml conflicts
          if [ "$CONFLICTED_FILES" = "pnpm-lock.yaml" ]; then
            echo "only_lockfile=true" >> $GITHUB_OUTPUT
            echo "Only pnpm-lock.yaml conflicts detected - will auto-resolve"
          else
            echo "only_lockfile=false" >> $GITHUB_OUTPUT
            echo "Multiple files conflict - manual resolution required"
          fi

          # Store conflicted files for issue creation
          echo "conflicted_files<<EOF" >> $GITHUB_OUTPUT
          echo "$CONFLICTED_FILES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

          # Abort merge if not auto-resolving
          if [ "$CONFLICTED_FILES" != "pnpm-lock.yaml" ]; then
            git merge --abort
          fi
```

**Step 4: Verify changes**

Run: `git diff .github/workflows/sync-upstream.yml`
Expected: See merge step updated and analyze step added

**Step 5: Commit**

```bash
git add .github/workflows/sync-upstream.yml
git commit -m "feat: add conflict analysis step to sync-upstream workflow"
```

---

## Task 2: Add Auto-Resolution Step

**Files:**
- Modify: `.github/workflows/sync-upstream.yml` (after analyze step)

**Step 1: Add Node.js and pnpm setup steps**

After the analyze step, add setup steps needed for pnpm install:

```yaml
      - name: Setup Node.js
        if: steps.check.outputs.already_synced == 'false' && steps.analyze.outputs.only_lockfile == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup pnpm
        if: steps.check.outputs.already_synced == 'false' && steps.analyze.outputs.only_lockfile == 'true'
        uses: pnpm/action-setup@v4
        with:
          version: 10.19.0
```

**Step 2: Add auto-resolution step**

After the setup steps, add the auto-resolution logic:

```yaml
      - name: Auto-resolve lockfile conflict
        if: steps.check.outputs.already_synced == 'false' && steps.analyze.outputs.only_lockfile == 'true'
        id: auto_resolve
        run: |
          echo "Auto-resolving pnpm-lock.yaml conflict..."

          # Accept upstream's lockfile (preserves their dependency resolutions)
          git checkout --theirs pnpm-lock.yaml

          # Update lockfile based on merged package.json
          pnpm install

          # Stage the updated lockfile
          git add pnpm-lock.yaml

          # Complete the merge commit
          git commit --no-edit

          # Push the branch
          git push origin ${{ env.branch_name }}

          echo "resolution_status=success" >> $GITHUB_OUTPUT
          echo "Lockfile conflict auto-resolved successfully"
```

**Step 3: Verify auto-resolution logic**

Run: `cat .github/workflows/sync-upstream.yml | grep -A 25 "Auto-resolve"`
Expected: See setup steps and auto-resolve step with git checkout --theirs

**Step 4: Commit**

```bash
git add .github/workflows/sync-upstream.yml
git commit -m "feat: add auto-resolution for lockfile-only conflicts"
```

---

## Task 3: Update PR Creation Step

**Files:**
- Modify: `.github/workflows/sync-upstream.yml:72-97`

**Step 1: Update PR creation condition**

Find the "Create Pull Request" step and update its condition to include auto-resolve path:

```yaml
      - name: Create Pull Request
        if: steps.check.outputs.already_synced == 'false' && (steps.merge.outputs.merge_status == 'success' || (steps.analyze.outputs.only_lockfile == 'true' && steps.auto_resolve.outputs.resolution_status == 'success'))
        uses: actions/github-script@v7
```

**Step 2: Update PR body to include auto-resolution notice**

Modify the script section to conditionally add notice:

```yaml
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const branchName = process.env.branch_name;
            const autoResolved = '${{ steps.analyze.outputs.only_lockfile }}' === 'true';

            let prBody = 'This PR syncs changes from the upstream repository [t3-oss/create-t3-turbo](https://github.com/t3-oss/create-t3-turbo).\n\n## Changes\nThis automated sync includes the latest changes from the upstream repository.\n\n';

            // Add auto-resolution notice if applicable
            if (autoResolved) {
              prBody += '## ⚠️ Auto-Resolution Notice\n\nThe pnpm-lock.yaml file had merge conflicts and was automatically resolved by accepting upstream\'s lockfile and running `pnpm install`.\nPlease verify the lockfile changes are correct before merging.\n\n';
            }

            prBody += '## Review Notes\n- Please review the changes carefully before merging\n- Check for any conflicts with custom modifications in this fork\n- Ensure CI passes before merging\n\n---\n🤖 This PR was automatically created by the sync-upstream workflow.';

            try {
              const { data: pr } = await github.rest.pulls.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: 'Sync with upstream t3-oss/create-t3-turbo',
                head: branchName,
                base: 'main',
                body: prBody,
              });

              console.log(`Pull request created: ${pr.html_url}`);
            } catch (error) {
              if (error.status === 422) {
                console.log('Pull request already exists or no changes to sync');
              } else {
                throw error;
              }
            }
```

**Step 3: Verify PR body logic**

Run: `cat .github/workflows/sync-upstream.yml | grep -A 35 "Create Pull Request"`
Expected: See condition updated and autoResolved variable with conditional notice

**Step 4: Commit**

```bash
git add .github/workflows/sync-upstream.yml
git commit -m "feat: add auto-resolution notice to PR body"
```

---

## Task 4: Update Issue Creation Step

**Files:**
- Modify: `.github/workflows/sync-upstream.yml:99-155`

**Step 1: Update issue creation condition**

Find the "Create Issue for Merge Conflict" step and update condition to only run when NOT lockfile-only:

```yaml
      - name: Create Issue for Merge Conflict
        if: steps.check.outputs.already_synced == 'false' && steps.merge.outputs.merge_status == 'conflict' && steps.analyze.outputs.only_lockfile == 'false'
        uses: actions/github-script@v7
```

**Step 2: Update issue to use analyze step outputs**

The issue body should already use conflicted_files, but verify it uses `steps.analyze.outputs.conflicted_files`:

```yaml
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const branchName = process.env.branch_name;
            const conflictedFiles = `${{ steps.analyze.outputs.conflicted_files }}`;
```

**Step 3: Verify issue condition and body**

Run: `cat .github/workflows/sync-upstream.yml | grep -A 5 "Create Issue for Merge"`
Expected: See condition includes `only_lockfile == 'false'`

**Step 4: Commit**

```bash
git add .github/workflows/sync-upstream.yml
git commit -m "feat: update issue creation to only run for non-lockfile conflicts"
```

---

## Task 5: Add Documentation and Final Review

**Files:**
- Modify: `.github/workflows/sync-upstream.yml:1-8`

**Step 1: Add workflow documentation**

Update the top of the workflow file to document the auto-resolution behavior:

```yaml
name: Sync Upstream

# This workflow syncs changes from t3-oss/create-t3-turbo upstream repository.
# When merge conflicts occur:
# - If ONLY pnpm-lock.yaml conflicts: automatically resolve by accepting upstream's
#   lockfile and running 'pnpm install', then create PR with notice
# - If other files conflict: abort merge and create issue for manual resolution

on:
  schedule:
    # Run the first of every month
    - cron: '0 2 1 * *'
  workflow_dispatch: # Allow manual triggering
```

**Step 2: Review entire workflow file**

Run: `cat .github/workflows/sync-upstream.yml`
Expected: Complete workflow with all changes integrated

**Step 3: Validate YAML syntax**

Run: `yamllint .github/workflows/sync-upstream.yml` (if available) or check manually
Expected: No syntax errors

**Step 4: Commit documentation**

```bash
git add .github/workflows/sync-upstream.yml
git commit -m "docs: document auto-resolution behavior in workflow"
```

**Step 5: Verify all changes committed**

Run: `git status`
Expected: "nothing to commit, working tree clean"

---

## Task 6: Update Design Document and Push

**Files:**
- Modify: `docs/plans/2025-11-17-lockfile-conflict-auto-resolution-design.md`

**Step 1: Add implementation date to design doc**

Add an implementation section at the end of the design doc:

```markdown
## Implementation

**Implemented:** 2025-11-17
**Branch:** feature/auto-resolve-lockfile-conflicts
**Status:** Complete

All workflow changes have been implemented using the `git checkout --theirs` approach
to preserve upstream's dependency resolutions while updating based on merged package.json.
```

**Step 2: Commit design doc update**

```bash
git add docs/plans/2025-11-17-lockfile-conflict-auto-resolution-design.md
git commit -m "docs: mark design as implemented"
```

**Step 3: Push feature branch**

```bash
git push origin feature/auto-resolve-lockfile-conflicts
```

---

## Task 7: Create Pull Request

**Files:**
- N/A (git operations)

**Step 1: Create pull request**

```bash
gh pr create \
  --title "Automatically resolve pnpm-lock.yaml conflicts in upstream sync" \
  --body "$(cat <<'EOF'
## Summary

Enhances the sync-upstream workflow to automatically resolve pnpm-lock.yaml merge conflicts when they are the only conflicted file.

## Changes

- **Conflict Analysis**: Detects if only pnpm-lock.yaml conflicts
- **Auto-Resolution**: Accepts upstream's lockfile and runs `pnpm install` to update based on merged package.json
- **PR Notifications**: Adds notice to PR when lockfile was auto-resolved
- **Fallback Behavior**: Preserves manual intervention for complex conflicts

## Resolution Method

Uses `git checkout --theirs pnpm-lock.yaml` to preserve upstream's dependency resolutions, then runs `pnpm install` to update only what's necessary based on the merged package.json. This minimizes divergence from upstream.

## Implementation Details

See design document: `docs/plans/2025-11-17-lockfile-conflict-auto-resolution-design.md`

### New Workflow Steps

1. **Analyze conflicts** - Determines if only lockfile conflicts
2. **Setup Node.js and pnpm** - Prepares environment for pnpm install
3. **Auto-resolve lockfile conflict** - Accepts upstream's lockfile and updates it
4. **Updated PR creation** - Includes auto-resolution notice when applicable
5. **Updated issue creation** - Only triggers for non-lockfile conflicts

## Safety

- Only auto-resolves when pnpm-lock.yaml is the ONLY conflicted file
- This ensures package.json merged cleanly (no real dependency conflicts)
- Preserves upstream's resolutions, minimizes divergence
- Full transparency through PR notifications

## Testing Plan

- [ ] Manual workflow trigger with no upstream changes (should skip)
- [ ] Test with lockfile-only conflict (should auto-resolve and create PR)
- [ ] Test with mixed conflicts (should create issue)
- [ ] Verify PR includes auto-resolution notice
- [ ] Verify CI passes

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 2: Verify PR created**

Run: `gh pr view --web`
Expected: PR opens in browser with correct title and body

---

## Verification Steps

After PR is created and reviewed:

1. **Manual workflow test**:
   ```bash
   # After PR is merged, trigger workflow manually
   gh workflow run sync-upstream.yml
   ```

2. **Monitor workflow run**:
   ```bash
   gh run list --workflow=sync-upstream.yml
   gh run watch
   ```

3. **Verify behavior**:
   - Lockfile-only conflicts → PR with auto-resolution notice
   - Mixed conflicts → Issue for manual resolution
   - No conflicts → Standard PR

## Success Criteria

- ✅ Workflow YAML is syntactically valid
- ✅ All steps have correct conditions
- ✅ Auto-resolution uses `git checkout --theirs` approach
- ✅ PR body includes conditional notice
- ✅ Issue creation only runs for non-lockfile conflicts
- ✅ Documentation is updated
- ✅ All changes committed and pushed
- ✅ PR is created and ready for review
