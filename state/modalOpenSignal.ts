// A count of open modal dialogs. Global key bindings check it so a key
// pressed while a dialog is open belongs to the dialog, not the screen behind.
let openCount = 0;

export function isModalOpen(): boolean {
  return openCount > 0;
}

// Marks a modal open; returns the function that marks it closed.
export function markModalOpen(): () => void {
  openCount += 1;
  let isClosed = false;
  return () => {
    if (isClosed) return;
    isClosed = true;
    openCount -= 1;
  };
}
