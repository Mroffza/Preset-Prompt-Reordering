import { saveSettingsDebounced } from "../../../script.js";
import { extension_settings, getContext } from "../../extensions.js";

const extensionName = "Preset-Entry-Reordering";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

let currentPreset = null;

function addEntryNumbers() {
    const entryElements = document.querySelectorAll('.world_entry');

    entryElements.forEach((entryEl, index) => {
        // Check if number input already exists
        if (entryEl.querySelector('.entry-number-input')) return;

        const entryHeader = entryEl.querySelector('.world_entry_form_header');
        if (!entryHeader) return;

        // Create number input
        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.className = 'entry-number-input text_pole';
        numberInput.value = index + 1;
        numberInput.min = 1;
        numberInput.style.width = '60px';
        numberInput.style.marginRight = '10px';
        numberInput.title = 'Entry position (change to reorder)';

        // Add change event
        numberInput.addEventListener('change', (e) => {
            handleEntryReorder(entryEl, parseInt(e.target.value) - 1);
        });

        // Insert at the beginning of header
        entryHeader.insertBefore(numberInput, entryHeader.firstChild);
    });
}

function handleEntryReorder(entryElement, newIndex) {
    const context = getContext();
    const worldInfo = context.worldInfoData;

    if (!worldInfo || !worldInfo.entries) return;

    // Get current entry UID
    const entryUid = entryElement.getAttribute('data-uid');
    if (!entryUid) return;

    // Find entry in data
    const currentIndex = worldInfo.entries.findIndex(e => e.uid === parseInt(entryUid));
    if (currentIndex === -1) return;

    // Validate new index
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= worldInfo.entries.length) newIndex = worldInfo.entries.length - 1;

    // Reorder entries
    const [movedEntry] = worldInfo.entries.splice(currentIndex, 1);
    worldInfo.entries.splice(newIndex, 0, movedEntry);

    // Save and refresh
    saveSettingsDebounced();
    refreshEntryList();
}

function refreshEntryList() {
    // Trigger SillyTavern's native refresh
    const context = getContext();
    if (context.worldInfoGrid) {
        context.worldInfoGrid.refresh();
    }

    // Re-add numbers after refresh
    setTimeout(() => {
        addEntryNumbers();
    }, 100);
}

// Observer to detect when entries are loaded/changed
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            const hasEntries = Array.from(mutation.addedNodes).some(node =>
                node.classList && (node.classList.contains('world_entry') ||
                node.querySelector && node.querySelector('.world_entry'))
            );

            if (hasEntries) {
                setTimeout(() => addEntryNumbers(), 50);
                break;
            }
        }
    }
});

// Initialize extension
jQuery(async () => {
    console.log('Loading Preset Entry Reordering extension');

    // Wait for world info to be available
    const checkInterval = setInterval(() => {
        const worldInfoContainer = document.querySelector('#world_info');
        if (worldInfoContainer) {
            clearInterval(checkInterval);

            // Start observing
            observer.observe(worldInfoContainer, {
                childList: true,
                subtree: true
            });

            // Initial add
            addEntryNumbers();
        }
    }, 500);
});
