# PR 5d-12 — FileDropzone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear ledger entry `man-t12` by moving the hand-made upload drop zone in the product image manager onto one shared `FileDropzone`, keep the existing drag-and-drop behaviour exactly as it is, and make the file picker reachable and usable with the keyboard (it is not today).

**Architecture:** One new `@bomy/ui` piece, `FileDropzone` (`packages/ui/src/components/file-dropzone.tsx`, export `@bomy/ui/file-dropzone`). It owns the drag state (the enter/leave counter and `isDragOver`), the `label` box with the dashed look, and the file input. It calls `onFile(file)` with the first chosen or dropped file. What it shows inside (idle text, "Drop to upload", the upload percentage and bar) stays in the caller and is passed as `children` (a render function that receives `{ isDragOver }`). File checks (image type, 2 MB), the upload to storage and the toasts stay in `image-manager.tsx`. The keyboard fix: the input is visually hidden (`sr-only`) instead of `display: none`, so it is in the Tab order and Enter or Space opens the picker; the dashed box shows a focus ring when the input has keyboard focus.

**Tech Stack:** React 19, class-variance-authority is not needed (one look), Tailwind 3.4 (`has-[:focus-visible]`), Vitest 2.1.9 (jsdom per file), Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-12).

## The problem today

`image-manager.tsx` lines 283-318: the file input has `className="hidden"` (`display: none`). A hidden input cannot take focus, so a keyboard or screen-reader user cannot reach "Add image" at all. Only a mouse click on the label or a drag works. Nothing else is wrong with the drop behaviour; it is kept.

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d12` from `main` (`1c88a55`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Out of scope:** the magnetic effect (parked) and hold-to-confirm; any change to what is uploaded, to the 2 MB / image-type rules, to the presigned upload, the toasts, or the reorder thumbnails; 5d-7 and D6; 5d-2 and D3; `man-5a3`; `man-b9b`.
- Keep the look: 96 px square (`h-24 w-24`), dashed 2 px border, rounded, the drag-over scale/colour/icon lift, the progress bar. Contrast: text 4.5:1, focus indicators 3:1. Report env-limited tests as "not evaluated". Evidence text may cite only what was actually verified.

## Review Focus

- **The picker works from the keyboard.** Tab reaches the upload box after the last thumbnail; the box shows a visible focus ring (and only for keyboard focus, not after a mouse click); Enter and Space open the file chooser; choosing a file runs the same upload as a click. While an upload runs the input is disabled, as today.
- **The control has a name.** The input has an accessible name ("Upload image") and is described by the hint text under the grid (JPEG, PNG, WebP, 2 MB). The old `aria-label` sat on the `label`, which does not name the input it wraps.
- **Drag and drop behaves as before.** Enter shows "Drop to upload" and the primary colours; leave (including leaving onto a child element) clears them only when the counter reaches 0; drop clears the state, ignores the drop while uploading, and takes the first file only; a non-image or an over-2 MB file shows the same error text and toast.
- **Nothing looks different when idle, dragging or uploading.** Box size, border, fill, text colour, icon and the progress bar are the same, measured before and after in light and dark.
- **Choosing the same file twice still works.** The input value is cleared after each pick (see D26).
- **Nothing else in the page moves.** Reorder grip, remove button and the hint paragraph are unchanged.

## File Structure

- Create `packages/ui/src/components/file-dropzone.tsx`; modify `packages/ui/package.json` (add `"./file-dropzone": "./src/components/file-dropzone.tsx"`).
- Modify `apps/web/src/app/seller/dashboard/products/[id]/edit/image-manager.tsx` (the label, input and the four drag handlers go; `onFile` and `children` come in).
- Create `apps/web/tests/components/file-dropzone.test.tsx` (the shared piece) and `apps/web/tests/seller-dashboard/image-manager.test.tsx` (no test exists for this file today).
- Modify `scripts/ui-audit/findings.json` and `scripts/ui-audit/exceptions.json` (the `R1-input` and `R1-label` entries for `image-manager.tsx` should go stale and be removed; `R1-button` and `R5-inline-style` stay).

## Decisions for Bob and Charlie

- **D24 (shared piece):** `FileDropzone` lives in `@bomy/ui` (the ledger and the approved inventory name it as the candidate), although it has one caller today. The alternative is to fix the input in place and keep the local label, which clears the keyboard bug but leaves `man-t12` deferred. Recommended: shared piece.
- **D25 (keyboard fix):** the input becomes `sr-only` (still focusable) inside the `label`; the ring is drawn on the dashed box with `has-[:focus-visible]:ring-2 ring-ring ring-offset-2`. No separate button is added. Recommended over a visible "Browse" button, which would change the look.
- **D26 (input reset):** the shared piece clears the input value right after it hands the file to `onFile` (today `image-manager` clears it at the end of the upload). Same effect (the same file can be picked again), one less thing for the caller to hold. Small timing change, disclosed.
- **D27 (accessible name):** the name changes from "Upload image. Drag and drop or click to browse" to "Upload image", plus `aria-describedby` pointing at the existing hint paragraph. "Drag and drop" is noise for a keyboard user. Recommended; Bob may prefer to keep the old wording.

## Edit

1. `file-dropzone.tsx` (sketch):

```tsx
type FileDropzoneProps = {
  onFile: (file: File) => void
  accept?: string
  disabled?: boolean // disables the input and ignores drag/drop (the upload is running)
  "aria-label": string
  "aria-describedby"?: string
  className?: string
  children: React.ReactNode | ((state: { isDragOver: boolean }) => React.ReactNode)
}
```

It renders `<label ...drag handlers... className={cn(base, isDragOver ? over : idle, disabled && "pointer-events-none", className)}>` with the same class strings as today plus the focus ring, then `{children}`, then `<input ref type="file" className="sr-only" accept disabled aria-label aria-describedby onChange>`. `onChange` calls `onFile(file)` then clears the value. The drag handlers are copied unchanged (counter ref; `handleDragEnter` returns early when `disabled`; `handleDrop` resets, returns early when `disabled`, passes `files[0]`).

2. `image-manager.tsx`: `processFile` stays; the `<label>` block becomes `<FileDropzone onFile={(f) => void processFile(f)} accept="image/*" disabled={uploading} aria-label="Upload image" aria-describedby={hintId}>{({ isDragOver }) => uploading ? (progress text + bar) : (icon + "Add image"/"Drop to upload")}</FileDropzone>`; `fileInputRef`, `dragCounter`, `isDragOver` state and the four handlers are removed; the hint `<p>` gets `id={hintId}` from `useId()`.

---

### Task 1: Baselines on today's markup (no source change)

**Files:** create `apps/web/tests/seller-dashboard/image-manager.test.tsx`; create (uncommitted) `.andy/pr5d12-baseline.json`.

- [ ] **Step 1 (jsdom):** mock `../../actions`, `@/components/toaster`; stub `XMLHttpRequest`. Tests on the current markup: the box exists with the idle classes and text "Add image"; drag enter shows "Drop to upload" and the over classes; drag leave with an inner-element enter/leave pair keeps the state until the counter hits 0; drop with an image file calls `getPresignedUploadUrl(type, size)` then the PUT then `addProductImage`, adds the thumbnail and toasts "Image uploaded"; drop with a non-image shows "Only image files are allowed"; an over-2 MB file shows "Image must be smaller than 2 MB"; while uploading the input is disabled, the percentage shows and a second drop is ignored; choosing a file through the input's `change` does the same as a drop. A baseline test named `file input is display:none today` asserts the input has class `hidden` (Task 3 flips it).
- [ ] **Step 2 (browser baseline, Playwright, uncommitted):** sign in as the seeded seller (Mailhog magic link), open the edit page of one of that seller's products. Measure the upload box idle, with the real `browser_drop` drag-over, and mid-upload (slow the PUT if possible; otherwise report as not evaluated): box size, border style/width/colour, fill, text colour, icon box, light and dark, at 390 and 1280 px. Record that a real Tab sequence skips the upload box (the baseline of the gap). Save to `.andy/pr5d12-baseline.json`.
- [ ] **Step 3:** run on unchanged source: PASS. Mutation-check four (drop the `dragCounter` reset in drop; remove the `uploading` early return in drop; change the 2 MB limit; remove `accept`); each must fail; restore.
- [ ] **Step 4:** commit the test by explicit path: `test(ui): baseline of the product image drop zone (5d-12)`.

### Task 2: `FileDropzone` in `@bomy/ui`

**Files:** `packages/ui/src/components/file-dropzone.tsx`, `packages/ui/package.json`, `apps/web/tests/components/file-dropzone.test.tsx`.

- [ ] **Step 1:** write `file-dropzone.test.tsx` first (fails: module missing): renders a label with a file input that is focusable (not `display: none`, no `hidden` class; has `sr-only`); the input has the given name, `accept` and `aria-describedby`; Tab-order check via `tabIndex`/`disabled`; `change` calls `onFile` once with the first file and clears the value; drag enter/leave/over/drop (counter, child enter/leave, drop with several files takes the first, drop and enter ignored when `disabled`); children as node and as render function receive `isDragOver`; the idle and over class sets equal the strings in `image-manager.tsx` today; the focus-ring tokens are present; `className` merges last.
- [ ] **Step 2:** implement and add the package export. Run the new test, `@bomy/ui` typecheck and lint. Commit: `feat(ui): FileDropzone piece with a keyboard-reachable file input (5d-12)`.

### Task 3: Image manager

- [ ] **Step 1:** Apply Edit 2. Flip the baseline test: the input is no longer `hidden`; it has the name "Upload image" and the `aria-describedby`. All other baseline tests pass unchanged. Commit: `refactor(ui): product image upload uses FileDropzone (5d-12)`.

### Task 4: Ledger

- [ ] **Step 1:** Run the scanner; remove the stale `R1-input` and `R1-label` exceptions for `image-manager.tsx`. Resolve `man-t12` with evidence limited to what was verified. Expect **11 deferred, 86 resolved** (97 entries); scanner 0 deferred, 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit.

### Task 5: Browser proof and gates; stop before the push

- [ ] **Step 1 (compare with the baseline):** repeat the Task 1 capture; expected visual differences: none while idle, dragging or uploading.
- [ ] **Step 2 (real keys):** Tab from the last thumbnail's controls to the upload box: the ring shows, on both themes, at 3:1 or better; a mouse click does not leave the ring; Enter and Space open the file chooser (`browser_file_upload` supplies a small image) and the upload completes with the toast and a new thumbnail; the real `browser_drop` still uploads; a text file is rejected with the same message.
- [ ] **Step 3:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites, `@bomy/ui` typecheck, `pnpm build` (`loading.tsx` moved aside, restored after; `rm -rf apps/admin/.next` after), prettier on the diff, `git diff --check`, audit gate and tests; `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 4:** Write `.andy/pr5d12-pr-body.md` (format of the 5d-8 body; ends with the 🤖 line; D24 to D27, measured deltas, visible and non-visual changes, observations, not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d12-file-dropzone.md`, handoff, memory, delete branch.

## Visible and non-visual changes to disclose

1. Keyboard users can now reach and use the upload box (focus ring on keyboard focus only). New behaviour, small visual addition.
2. The input is named "Upload image" and described by the hint (D27).
3. New shared piece `@bomy/ui/file-dropzone`; two scanner exceptions removed.
4. No other visual change expected; measured.

## Observations (not changed here)

- While an upload runs, the box is `pointer-events-none`, so a file dropped on it falls through to the page and the browser may open the image. Unchanged; a separate fix.
- A multi-file drop uploads the first file only, silently. Unchanged.

## Self-review

- **Coverage:** `man-t12` and the keyboard gap → Tasks 2 and 3; baselines in Task 1; ledger and exceptions in Task 4.
- **Risks, in order:** a hidden file input losing its keyboard focus when it is disabled during the upload (focus drops to the page; announced by the existing toasts, noted in the PR); `has-[:focus-visible]` showing the ring after a mouse click in some browsers (check in Chromium; Firefox and Safari not evaluated); `sr-only` input inside `overflow-hidden` label clipping the native focus UI (the ring is on the label, so it is fine); `tailwind-merge` reordering classes when `className` is merged (check computed styles); the drag counter going out of step when `disabled` flips mid-drag.
