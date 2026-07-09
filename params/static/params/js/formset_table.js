// This script manages dynamic addition/removal of rows in a form table
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".add-row").forEach(addButton => {
        const prefix = addButton.dataset.formset;
        const table = document.getElementById(`table-${prefix}`);
        const totalForms = document.querySelector(`#id_${prefix}-TOTAL_FORMS`);

        addButton.addEventListener("click", function () {
            const formCount = parseInt(totalForms.value);
            const tbody = table.querySelector("tbody");
            const newRow = tbody.rows[0].cloneNode(true);

            // Replace all occurrences of the current index with the new index
            newRow.innerHTML = newRow.innerHTML.replace(
                new RegExp(`${prefix}-(\\d+)-`, 'g'),
                `${prefix}-${formCount}-`
            );

            // Reset input values
            Array.from(newRow.querySelectorAll("input, select, textarea")).forEach(input => {
                input.value = "";
            });

            table.appendChild(newRow);
            totalForms.value = formCount + 1;
        });
    });

    // Handle Delete Row for All Tables
    document.querySelectorAll("table[data-formset]").forEach(table => {
        const prefix = table.dataset.formset;
        const totalForms = document.querySelector(`#id_${prefix}-TOTAL_FORMS`);

        table.addEventListener("click", function (e) {
            console.log("Table clicked", e.target);
            const button = e.target.closest(".delete-row");
            const tbody = table.querySelector("tbody");
            if (button) {
                console.log("Delete button clicked", button);
                const rowCount = Array.from(tbody.querySelectorAll("tr"))
                    .filter(row => getComputedStyle(row).display !== "none")
                    .length;
                console.log("Current row count", rowCount);
                console.log(tbody);
                if (rowCount <= 1) {
                    alert("At least one row must remain.");
                    return;
                }
                const row = button.closest("tr");
                console.log("Row to delete", row);
                const deleteInput = row.querySelector('input[type="hidden"][name$="-DELETE"]');
                if (deleteInput) {
                    console.log("Marking row for deletion");
                    deleteInput.value = 'on'; // Mark for deletion
                    row.style.display = 'none'; // Hide row visually
                }
            }
        });
    });

    // Handle time input arrow keys (skip parse/format code)
    document.querySelectorAll(".time-input").forEach(input => {
        input.addEventListener("keydown", function (e) {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                let totalMinutes = parseHHMM(input.value);
                totalMinutes += (e.key === "ArrowUp" ? 1 : -1);
                input.value = formatHHMM(totalMinutes);
            }
        });
    });

    function parseHHMM(value) {
        value = value.trim();
        if (!value) return 0;

        let isNegative = false;
        if (value.startsWith("-")) {
            isNegative = true;
            value = value.slice(1);
        }

        const parts = value.split(":");
        let hours = parseInt(parts[0], 10) || 0;
        let minutes = parseInt(parts[1], 10) || 0;

        let totalMinutes = hours * 60 + minutes;
        return isNegative ? -totalMinutes : totalMinutes;
    }

    function formatHHMM(totalMinutes) {
        const sign = totalMinutes < 0 ? "-" : "";
        const absMinutes = Math.abs(totalMinutes);
        const hours = Math.floor(absMinutes / 60);
        const minutes = absMinutes % 60;
        return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    function reindexFormsetRows(table, prefix) {
        const rows = table.querySelectorAll("tr");
        rows.forEach((row, index) => {
            // For each input/select/textarea in the row
            row.querySelectorAll("input, select, textarea, label").forEach(el => {
                // Update name attribute if present
                if (el.name) {
                    el.name = el.name.replace(new RegExp(`${prefix}-(\\d+)-`), `${prefix}-${index}-`);
                }
                // Update id attribute if present
                if (el.id) {
                    el.id = el.id.replace(new RegExp(`${prefix}-(\\d+)-`), `${prefix}-${index}-`);
                }
                // Update label "for" attribute if present
                if (el.tagName.toLowerCase() === "label" && el.htmlFor) {
                    el.htmlFor = el.htmlFor.replace(new RegExp(`${prefix}-(\\d+)-`), `${prefix}-${index}-`);
                }
            });
        });
    }
});
