document.addEventListener("DOMContentLoaded", function () {
    const path = window.location.pathname;
    const match = path.match(/^\/params\/(\d+)\/$/);
    if (match) {
      const paramId = match[1];
      localStorage.setItem("prevParamId", paramId);
    }
});
// Listen for keydown
document.addEventListener("keydown", function (event) {
// Check if Ctrl (Windows/Linux) or Meta (Command on Mac) + S is pressed
if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault(); // Stop the browser’s default "Save" action
    console.log("Saving...");
    postSave();
}
});
function postSave() {
  // Trigger form submission programmatically
  const form = document.getElementById("params-form");
  if (form) {
    form.submit();
  }
}
window.addEventListener("beforeunload", function () {
    localStorage.setItem("scrollPosition", window.scrollY);

    const active = document.activeElement;

    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        // only store focused element if it's an input or textarea
        if (active.id) {
            localStorage.setItem("focusedElementId", active.id);
        } else if (active.name) {
            localStorage.setItem("focusedElementName", active.name);
        }
    } else {
        // remove if not an input
        localStorage.removeItem("focusedElementId");
        localStorage.removeItem("focusedElementName");
    }
});


// Restore scroll and focus after load
window.addEventListener("load", function () {
    const scrollPos = localStorage.getItem("scrollPosition");
    const errorElements = document.getElementsByClassName("error");
    if (errorElements.length > 0) {
        return; // don't scroll if errors
    }
    if (scrollPos !== null) {
        window.scrollTo(0, parseInt(scrollPos, 10));
    }

    // Try to restore focus
    let focusedElement = null;
    const focusedId = localStorage.getItem("focusedElementId");
    const focusedName = localStorage.getItem("focusedElementName");

    if (focusedId) {
        focusedElement = document.getElementById(focusedId);
    } else if (focusedName) {
        focusedElement = document.getElementsByName(focusedName)[0];
    }

    if (focusedElement) {
        const type = focusedElement.type?.toLowerCase();

        // Only focus if it's not a checkbox or radio
        if (type !== "checkbox" && type !== "radio") {
            focusedElement.focus();

            // Optional: move cursor to end for text-like inputs
            if (focusedElement.setSelectionRange && focusedElement.value) {
                const len = focusedElement.value.length;
                focusedElement.setSelectionRange(len, len);
            }
        }
    }

    // Clear storage if you like
    localStorage.removeItem("scrollPosition");
    localStorage.removeItem("focusedElementId");
    localStorage.removeItem("focusedElementName");

});