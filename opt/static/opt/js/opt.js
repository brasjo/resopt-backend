let selectedOptRunId = localStorage.getItem('selectedOptRunId') || null;
let selectedParamSetId = localStorage.getItem('selectedParamSetId') || null;
let rulesHaveBeenModified = false;
let selectedTabId = localStorage.getItem('selectedTabId') || 'tab-rules';
const paramsSelectElement = document.getElementById('params-select');
const optRunAnchorElement = document.getElementById('open-opt-run-link');
const optSelectElement = document.getElementById('opt-select');
const chooseParamsLinkElement = document.getElementById('choose-params-link');
function setSelectedTabId(tabId) {
    console.log('Setting selectedTabId:', tabId);
    selectedTabId = tabId;
    localStorage.setItem('selectedTabId', tabId);
}
chooseParamsLinkElement.addEventListener('click', (event) => {
  event.preventDefault();

  const paramSetId = paramsSelectElement.value;
  const url = window.location.pathname + "choose-param/" + paramSetId + "/";

  // Try to get CSRF token (adjust selector for your framework)
  const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value
                 || document.querySelector('meta[name="csrf-token"]')?.content;

  // Create a hidden form
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;

  // Add paramSetId
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "paramSetId";
  input.value = paramSetId;
  form.appendChild(input);

  // Add CSRF token
  if (csrfToken) {
    const csrfInput = document.createElement("input");
    csrfInput.type = "hidden";
    csrfInput.name = "csrfmiddlewaretoken"; // Django expects this name
    csrfInput.value = csrfToken;
    form.appendChild(csrfInput);
  }

  document.body.appendChild(form);
  form.submit(); // Navigate with POST
});
optRunAnchorElement.addEventListener('click', (event) => {
    event.preventDefault();
    const optRunId = optSelectElement.value;
    console.log("optRunId:", optRunId);
    if (optRunId) {
        console.log("optRunId:", optRunId);
        window.location.href = `/opt/${optRunId}/`
    }
});
function setSelectedOptRunId(id) {
    console.log('Setting selectedOptRunId:', id);
    selectedOptRunId = id;
    localStorage.setItem('selectedOptRunId', id);
}
function setPrevOptId(id) {
    console.log('Setting prevOptId:', id);
    selectedOptRunId = id;
    localStorage.setItem('prevOptId', id);
}
optSelectElement.addEventListener('mouseenter', async () => {
    await loadOptRunsInSelect(selectedOptRunId);
});
optSelectElement.addEventListener('change', (event) => {
    const selectedId = event.target.value;
    setSelectedOptRunId(selectedId);
});
paramsSelectElement.addEventListener('change', (event) => {
    const selectedId = event.target.value;
    setSelectedParamSetId(selectedId);
});
async function loadOptRunsInSelect(selectId) {
    console.log('Loading opt runs in select...');
    console.log("selectedOptRunId:", selectedOptRunId);
    const response = await fetch(window.DJANGO.optRunsUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': window.DJANGO.csrfToken,
        },
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    optSelectElement.innerHTML = '';
    data.slice().reverse().forEach(run => {
        const optionElement = document.createElement('option');
        optionElement.value = run.id;
        optionElement.textContent = run.id + " " + run.run_directory;
        optSelectElement.appendChild(optionElement);
    });
    if (selectId) {
        optSelectElement.value = selectId;
        setSelectedOptRunId(selectId);
    }
}
function setSelectedParamSetId(id) {
    console.log('Setting selectedParamSetId:', id);
    selectedParamSetId = id;
    localStorage.setItem('selectedParamSetId', id);
}
function switchTab(tabId) {
    const tabList = document.querySelector('.tab-list');
    tabList.querySelectorAll('.tab-item').forEach(
        t => t.classList.remove('active')
    );
    const tab = tabList.querySelector(`[data-id="${tabId}"]`);
    if (tab) {
        console.log('Switching to tab:', tabId);
        tab.classList.add('active');
    }
    document.querySelectorAll('.tab-content').forEach((c, ix) => {
        if (c.id === tabId) {
            c.classList.add('active');
            c.style.order = 0; // Move active content to the front
        } else {
            c.classList.remove('active');
            c.style.order = ix + 1;
        }
    });
    setSelectedTabId(tabId);
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('opt.js initial load...');
    const path = window.location.pathname;
    const match = path.match(/^\/opt\/(\d+)\/$/);
    if (match) {
      console.log("Found optId in URL:", match[1]);
      const optId = match[1];
      setPrevOptId(optId);
    }
    await Promise.all([
        loadOptRunsInSelect(selectedOptRunId),
    ]);
    const optId = localStorage.getItem("prevOptId");
    if (optId) {
        const link = document.getElementById("opt-link");
        link.href = `/opt/${optId}/`;  // client-side rewrite
        console.log("Rewrote opt link to", link.href);
    }
    const paramId = localStorage.getItem("prevParamId");
    if (paramId) {
        const link = document.getElementById("params-link");
        link.href = `/params/${paramId}/`;  // client-side rewrite
    }
    const ruleContainer = document.getElementById('rule-formset-container');
    const addRuleBtn = document.getElementById('btn-add-rule');
    const ruleFormTemplate = document.getElementById('rule-form-template');

    const emptyRelationalConditionFormsetTemplate = document.getElementById(
        'empty-relational-condition-formset-template'
    );

    addRuleBtn.addEventListener('click', () => {
        const totalRulesInput = document.querySelector('[name="rules-TOTAL_FORMS"]');
        const ruleIndex = parseInt(totalRulesInput.value, 10);

        // Clone templates
        const ruleForm = document.getElementById('empty-rule-form-template').content.cloneNode(true);
        const relationalConditionFormset = document.getElementById('empty-relational-condition-formset-template').content.cloneNode(true);
        const activityConditionFormset = document.getElementById('empty-activity-condition-formset-template').content.cloneNode(true);
        const resourceConditionFormset = document.getElementById('empty-resource-condition-formset-template').content.cloneNode(true);

        // Replace __prefix__ in names, ids, for, and dataset attributes
        [
            ...ruleForm.querySelectorAll('[name], [id], [for], [data-rule-index], [data-condition-prefix]'),
            ...relationalConditionFormset.querySelectorAll('[name], [id], [for], [data-rule-index], [data-condition-prefix]'),
            ...activityConditionFormset.querySelectorAll('[name], [id], [for], [data-rule-index], [data-condition-prefix]'),
            ...resourceConditionFormset.querySelectorAll('[name], [id], [for], [data-rule-index], [data-condition-prefix]')
        ].forEach(el => {
            if (el.name) el.name = el.name.replace(/__prefix__/g, ruleIndex).replace(/rules_prototype-/g, 'rules-');
            if (el.id) el.id = el.id.replace(/__prefix__/g, ruleIndex).replace(/rules_prototype-/g, 'rules-');
            if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/__prefix__/g, ruleIndex).replace(/rules_prototype-/g, 'rules-');

            if (el.dataset.ruleIndex) el.dataset.ruleIndex = el.dataset.ruleIndex.replace(/__prefix__/g, ruleIndex);
            if (el.dataset.conditionPrefix) el.dataset.conditionPrefix = el.dataset.conditionPrefix.replace(/__prefix__/g, ruleIndex);
        });

        // Append nested formsets inside the main rule form
        const ruleFormContainer = ruleForm.querySelector('.rule-form');
        ruleFormContainer.appendChild(relationalConditionFormset);
        ruleFormContainer.appendChild(activityConditionFormset);
        ruleFormContainer.appendChild(resourceConditionFormset);

        // Add to the DOM
        ruleContainer.appendChild(ruleForm);

        // Increment TOTAL_FORMS
        totalRulesInput.value = ruleIndex + 1;
        rulesHaveBeenModified = true;
    });

    document.body.addEventListener('click', function (e) {
        if (!e.target.classList.contains('btn-add-activity-condition')) return;

        console.log('Add activity condition button clicked');

        const ruleForm = e.target.closest('.rule-form');
        const ruleIndex = ruleForm.dataset.ruleIndex;
        const activityFormset = ruleForm.querySelector('.activity-condition-formset');
        const activityConditionEmptyTemplate = activityFormset.querySelector('.activity-condition-empty-template');
        const emptyForm = activityConditionEmptyTemplate.content.cloneNode(true);

        const totalFormsInput = activityFormset.querySelector(
            'input[name$="-TOTAL_FORMS"]'
        );

        const formIndex = Number(totalFormsInput.value);

        const conditionPrefix = `rules-${ruleIndex}-activity-conditions`;
        // Replace all __prefix__ placeholders with the actual index
        emptyForm.querySelectorAll('[name], [id], [for]').forEach(el => {
            if (el.name) el.name = el.name.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
            if (el.name) el.name = el.name.replace(/activity_conditions_prototype-/g, '');
            if (el.id) el.id = el.id.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
            if (el.id) el.id = el.id.replace(/activity_conditions_prototype-/g, '');
            if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
            if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/activity_conditions_prototype-/g, '');
        });
        // The root element of the cloned form
        const conditionForm = emptyForm.firstElementChild;

        // 🔑 CRITICAL: stable index for DELETE logic
        conditionForm.dataset.formIndex = formIndex;

        activityFormset.appendChild(emptyForm);

        // Increment TOTAL_FORMS LAST
        totalFormsInput.value = formIndex + 1;
        rulesHaveBeenModified = true;
    });

    document.body.addEventListener('click', function (e) {
        if (!e.target.classList.contains('btn-add-resource-condition')) return;

        console.log('Add resource condition button clicked');

        const ruleForm = e.target.closest('.rule-form');
        const ruleIndex = ruleForm.dataset.ruleIndex;
        const resourceFormset = ruleForm.querySelector('.resource-condition-formset');
        const resourceConditionEmptyTemplate = resourceFormset.querySelector('.resource-condition-empty-template');
        const emptyForm = resourceConditionEmptyTemplate.content.cloneNode(true);

        const totalFormsInput = resourceFormset.querySelector(
            'input[name$="-TOTAL_FORMS"]'
        );

        const formIndex = Number(totalFormsInput.value);

        const conditionPrefix = `rules-${ruleIndex}-resource-conditions`;
        // Replace all __prefix__ placeholders with the actual index
        emptyForm.querySelectorAll('[name], [id], [for]').forEach(el => {
            if (el.name) el.name = el.name.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
            if (el.name) el.name = el.name.replace(/resource_conditions_prototype-/g, '');
            if (el.id) el.id = el.id.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
            if (el.id) el.id = el.id.replace(/resource_conditions_prototype-/g, '');
            if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
            if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/resource_conditions_prototype-/g, '');
        });
        // The root element of the cloned form
        const conditionForm = emptyForm.firstElementChild;

        // 🔑 CRITICAL: stable index for DELETE logic
        conditionForm.dataset.formIndex = formIndex;

        resourceFormset.appendChild(emptyForm);

        // Increment TOTAL_FORMS LAST
        totalFormsInput.value = formIndex + 1;
        rulesHaveBeenModified = true;
    });
    const tabList = document.querySelector('.tab-list');
    if (selectedTabId) {
        switchTab(selectedTabId);
    }
    for (const tab of tabList.querySelectorAll('.tab-item')) {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and contents
            switchTab(tab.dataset.id);
        });
    }

    document.body.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('btn-add-relational-condition')) {
            console.log('Add relational condition button clicked');
            const addButton = e.target;

            // Find the closest rule-form
            const ruleForm = addButton.closest('.rule-form');
            const ruleIndex = ruleForm.dataset.ruleIndex;

            // Find the condition formset container
            const conditionFormset = ruleForm.querySelector('.relational-condition-formset');

            const totalFormsInput = conditionFormset.querySelector(
                'input[name$="-TOTAL_FORMS"]'
            );

            const formIndex = parseInt(totalFormsInput.value, 10);

            // Get the empty condition template
            const emptyTemplate = conditionFormset.querySelector('.relational-condition-empty-template');
            const newCondition = emptyTemplate.content.cloneNode(true);
            console.log('Cloned new condition form');
            console.log(newCondition);

            const conditionPrefix = `rules-${ruleIndex}-relational-conditions`;
            // Replace all __prefix__ placeholders with the actual index
            newCondition.querySelectorAll('[name], [id], [for]').forEach(el => {
                if (el.name) el.name = el.name.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
                if (el.name) el.name = el.name.replace(/relational_conditions_prototype-/g, '');
                if (el.id) el.id = el.id.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
                if (el.id) el.id = el.id.replace(/relational_conditions_prototype-/g, '');
                if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/__prefix__/g, conditionPrefix + '-' + formIndex);
                if (el.htmlFor) el.htmlFor = el.htmlFor.replace(/relational_conditions_prototype-/g, '');
            });

            // Increment TOTAL_FORMS
            totalFormsInput.value = formIndex + 1;

            // Append to container
            conditionFormset.appendChild(newCondition);
        }
    });

    document.addEventListener('click', e => {
        if (!e.target.classList.contains('btn-remove-condition')) return;

        const conditionForm = e.target.closest('.condition-form');
        if (!conditionForm) return;

        const ruleForm = conditionForm.closest('.rule-form');
        numConditions = ruleForm.querySelectorAll('.condition-form:not(.hide)').length;
        if (numConditions <= 1) {
            alert("Each rule must have at least one condition. Please add another condition before removing this one.");
            return;
        }

        const formset = conditionForm.closest('.condition-formset');
        const prefix = formset.dataset.conditionPrefix;
        const index = conditionForm.dataset.formIndex;

        // Look for existing DELETE checkbox
        let deleteInput = conditionForm.querySelector(
            'input[name$="-DELETE"]'
        );

        if (!deleteInput) {
            // New form → create DELETE field dynamically
            deleteInput = document.createElement('input');
            deleteInput.type = 'hidden';
            deleteInput.name = `${prefix}-${index}-DELETE`;
            deleteInput.value = 'on';
            conditionForm.appendChild(deleteInput);
        } else {
            deleteInput.checked = true;
        }
        conditionForm.classList.add('hide')
        setTimeout(() => {
            conditionForm.style.display = 'none';
        }, 400);
    });



    document.addEventListener('click', e => {
        if (!e.target.classList.contains('btn-remove-rule')) return;
        console.log('Remove rule button clicked');

        const ruleForm = e.target.closest('.rule-form');

        // 1️⃣ If DELETE checkbox exists → mark for deletion
        const deleteInput = ruleForm.querySelector(
            'input[type="checkbox"][name$="-DELETE"]'
        );

        if (deleteInput) {
            deleteInput.checked = true;
            ruleForm.style.display = 'none';
            return;
        }

        // 2️⃣ Otherwise it's a new (unsaved) form → remove from DOM
        const formset = document.getElementById('rule-formset-container');
        const totalForms = formset.querySelector('[name="rules-TOTAL_FORMS"]');

        ruleForm.classList.add('hide');
        totalForms.value = Number(totalForms.value) - 1;
        setTimeout(() => {
            ruleForm.style.display = 'none';
        }, 400);
    });

    const errors = document.querySelectorAll(".errorlist");
    if (errors.length > 0) {
        const rect = errors[0].getBoundingClientRect();

        const targetY =
            rect.top +
            window.scrollY -
            (window.innerHeight / 2) +
            (rect.height / 2);

        window.scrollTo({
            top: Math.max(0, targetY),
            behavior: "smooth"
        });
        console.log("Scrolled to first error at Y:", targetY);
    } else {
        const scrollPos = localStorage.getItem("scrollPosition");
        if (scrollPos !== null) {
            window.scrollTo(0, parseInt(scrollPos, 10));
            console.log("Restored scroll position to:", scrollPos);
        }
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
    localStorage.removeItem("focusedElementId");
    localStorage.removeItem("focusedElementName");



});
document.addEventListener("keydown", function(e) {
    if (e.key === "F5" || e.keyCode === 116) {
        if (rulesHaveBeenModified) {
            const confirmRefresh = confirm("You have unsaved rule changes. Refresh anyway?");
            if (!confirmRefresh) {
                e.preventDefault(); // Cancel the refresh
            }
        }
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
    localStorage.setItem("scrollPosition", window.scrollY);
    // Trigger form submission programmatically
    const form = document.getElementById("opt-run-form");
    if (form) {
        form.submit();
    }
}
window.addEventListener("beforeunload", function () {
    localStorage.setItem("scrollPosition", window.scrollY);
    console.log("Saving scroll position:", window.scrollY);

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
