# UI/UX Refactor Plan: File Operations & Discoverability

## Context & Objective
We are improving the discoverability and usability of file operations in our React Native (Expo + Tamagui) E-ink companion app. 
Currently, actions are hidden behind swipe gestures. We need to transition to an explicit "More Options" menu via a vertical dots icon, update the swipe gestures to focus on **Rename** and **Delete**, and build a dedicated, focused UI for moving files between directories.

## Phase 1: Codebase Audit
**Agent Task:** Before making changes, review the following files:
1. `components/BookRow.tsx` (or the equivalent component rendering list items).
2. `hooks/use-file-browser.ts` (to understand current file system operations).
3. The component rendering the main list (likely `app/(tabs)/index.tsx`).

Ensure you understand how file paths and metadata are currently passed and stored.

---

## Phase 2: Component Specifications

### 1. Update List Item (`components/BookRow.tsx`)
* **Visual Affordance:** Add a `MoreVertical` icon to the far right of the row, next to the file size or sync status.
* **Swipe Gestures:** Update the existing `Swipeable` wrapper logic:
    * **Swipe Right:** Trigger **Rename**. (Background: Blue or Gray, Icon: Pencil/Edit).
    * **Swipe Left:** Trigger **Delete**. (Background: Red, Icon: Trash).
* **Interaction:** Tapping the `MoreVertical` icon or long-pressing the row must trigger the new `FileActionSheet`, passing the selected file's data.

### 2. Create `components/FileActionSheet.tsx`
* **Type:** A Tamagui `Sheet` (Bottom Modal) configured to snap to its content height (`snapPoints={[fit]}`).
* **Props:** Needs to accept `file` (the selected item), `isOpen`, and `onOpenChange`.
* **Header:** Display the name of the selected file or folder contextually.
* **Menu Items (Vertical layout via `YStack`):**
    * **Upload / Save** (If applicable based on connection/sync state)
    * **Move** (Tapping this closes this sheet and opens the `MoveFileSheet`)
    * **Rename** (Triggers an OS-native Alert prompt or inline dialog to input the new name)
    * **Delete** (Destructive action: render icon and text in Red)

### 3. Create `components/MoveFileSheet.tsx`
* **Type:** A Tamagui `Sheet` or standard React Native `Modal`. It should cover most of the screen (e.g., 90% snap point) to provide focus for directory navigation.
* **Props:** `fileToMove` (the file object), `isOpen`, `onClose`.
* **Header (`XStack`):**
    * Left: "Cancel" button.
    * Center: Title "Move to...".
    * Right: `FolderPlus` icon button (allows creating a new destination folder on the fly).
* **Body (Directory Browser):**
    * Render a `ScrollView` or `FlatList` of available directories.
    * Include a "Home" or "/" root option at the top to allow moving items out of nested folders.
    * **Visual cue:** If the user is viewing the directory where the `fileToMove` currently resides, indicate it visually (e.g., a checkmark or disabled state) so they don't try moving it to its current location.
    * **Navigation:** Tapping a nested folder should update the list state to show the contents of that directory.
* **Footer:**
    * A sticky, full-width "Move Here" button pinned to the bottom.
    * Disable this button if the current view is the exact directory where the file already exists.

---

## Phase 3: Logic & State Management Updates

### 1. Update `hooks/use-file-browser.ts`
Ensure the file system hook exports robust functions for these operations. If they don't exist, implement them using Expo FileSystem:
* `renameItem(currentPath: string, newName: string)`
* `moveItem(sourcePath: string, destinationDirectory: string)`
* `createFolder(parentDirectory: string, folderName: string)`

### 2. State Integration
* The main screen (`app/(tabs)/index.tsx`) should likely hold the state for which file is currently "selected" for operations (`activeFile`) and pass this down to the modals.
* Ensure UI feedback (e.g., a Toast notification) is triggered upon successful completion of Rename, Move, or Delete operations.

---

## Phase 4: Execution Steps for Agent
1.  **Analyze** the file system hooks and existing list components.
2.  **Implement** the updated hooks (`renameItem`, `moveItem`, `createFolder`).
3.  **Build** the UI components (`FileActionSheet`, `MoveFileSheet`).
4.  **Integrate** the new UI into the main Library screen and connect the hook logic.
5.  **Refactor** `BookRow.tsx` to include the `MoreVertical` button and updated `Swipeable` actions.
6.  **Test** the flow conceptually: verify that selecting "Move" successfully passes the file context to the directory browser.
