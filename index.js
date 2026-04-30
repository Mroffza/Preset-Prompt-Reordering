import { saveSettingsDebounced, eventSource, event_types, this_chid } from "../../../../script.js";
import { oai_settings } from "../../../openai.js";

const LIST_ID = 'completion_prompt_manager_list';
const ITEM_SELECTOR = 'li.completion_prompt_manager_prompt';

function getCurrentCharId() {
    // ลองหา character_id จากหลายแหล่ง
    if (typeof this_chid !== 'undefined' && this_chid !== undefined && this_chid !== null) {
        return Number(this_chid);
    }
    // fallback: default order id
    return 100001;
}

function getActiveOrder() {
    if (!oai_settings || !Array.isArray(oai_settings.prompt_order)) return null;

    const charId = getCurrentCharId();
    let entry = oai_settings.prompt_order.find(o => Number(o.character_id) === Number(charId));

    // fallback ไป default
    if (!entry) {
        entry = oai_settings.prompt_order.find(o => Number(o.character_id) === 100001);
    }
    // ถ้ายังไม่เจอ ใช้อันแรกที่มี
    if (!entry && oai_settings.prompt_order.length > 0) {
        entry = oai_settings.prompt_order[0];
    }

    return entry ? entry.order : null;
}

function addEntryNumbers() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    const items = list.querySelectorAll(ITEM_SELECTOR);
    let visibleIndex = 0;

    items.forEach((li) => {
        if (li.classList.contains('completion_prompt_manager_list_head')) return;
        if (li.classList.contains('completion_prompt_manager_list_separator')) return;

        visibleIndex++;
        const currentPos = visibleIndex;

        const nameSpan = li.querySelector('.completion_prompt_manager_prompt_name')
                      || li.querySelector('span');
        if (!nameSpan) return;

        let input = nameSpan.querySelector('.entry-number-input');

        if (!input) {
            input = document.createElement('input');
            input.type = 'number';
            input.className = 'entry-number-input';
            input.min = '1';
            input.title = 'แก้เลข + Enter เพื่อย้ายตำแหน่ง';

            ['click', 'mousedown', 'pointerdown', 'touchstart', 'dblclick'].forEach(ev => {
                input.addEventListener(ev, (e) => e.stopPropagation());
            });

            const trigger = (e) => {
                e.stopPropagation();
                const val = parseInt(input.value, 10);
                if (isNaN(val)) return;
                const identifier = li.getAttribute('data-pm-identifier');
                if (identifier) reorderPrompt(identifier, val - 1, li);
            };

            input.addEventListener('change', trigger);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    trigger(e);
                    input.blur();
                }
            });

            nameSpan.insertBefore(input, nameSpan.firstChild);
        }

        // อัพเดทค่าทุกครั้ง (เพื่อ realtime)
        if (document.activeElement !== input) {
            input.value = String(currentPos);
        }
    });
}

function reorderPrompt(identifier, newIndex, liElement) {
    const order = getActiveOrder();
    if (!order) {
        console.error('[PER] prompt_order not found for current character');
        console.log('[PER] this_chid:', this_chid);
        console.log('[PER] available orders:', oai_settings?.prompt_order?.map(o => o.character_id));
        return;
    }

    const currentIndex = order.findIndex(p => p.identifier === identifier);
    if (currentIndex === -1) {
        console.error('[PER] identifier not in order:', identifier);
        return;
    }

    if (newIndex < 0) newIndex = 0;
    if (newIndex >= order.length) newIndex = order.length - 1;
    if (newIndex === currentIndex) {
        addEntryNumbers();
        return;
    }

    console.log(`[PER] moving "${identifier}" from ${currentIndex} → ${newIndex}`);

    // 1) ขยับใน data array
    const [moved] = order.splice(currentIndex, 1);
    order.splice(newIndex, 0, moved);

    // 2) ขยับ DOM ทันที (realtime)
    const list = document.getElementById(LIST_ID);
    if (list && liElement) {
        const allItems = Array.from(list.querySelectorAll(ITEM_SELECTOR))
            .filter(el => !el.classList.contains('completion_prompt_manager_list_head')
                       && !el.classList.contains('completion_prompt_manager_list_separator'));

        // ตำแหน่งใน DOM ตาม order ใหม่ (จะมี offset จาก head/separator)
        const targetIdentifier = order[newIndex].identifier;
        // หา target li ในจาก order ใหม่ (ใช้ neighbor เพื่อหาตำแหน่งวาง)
        const allItemsNow = Array.from(list.querySelectorAll(ITEM_SELECTOR));
        const movableItems = allItemsNow.filter(el =>
            !el.classList.contains('completion_prompt_manager_list_head') &&
            !el.classList.contains('completion_prompt_manager_list_separator'));

        // ลบ liElement ออกจาก DOM ชั่วคราว
        liElement.remove();

        // หา list ปัจจุบัน หลังลบ
        const currentMovable = Array.from(list.querySelectorAll(ITEM_SELECTOR))
            .filter(el => !el.classList.contains('completion_prompt_manager_list_head') &&
                          !el.classList.contains('completion_prompt_manager_list_separator'));

        if (newIndex >= currentMovable.length) {
            list.appendChild(liElement);
        } else {
            list.insertBefore(liElement, currentMovable[newIndex]);
        }
    }

    // 3) Save
    saveSettingsDebounced();

    // 4) Re-number
    setTimeout(addEntryNumbers, 50);
}

let debounceTimer = null;
function scheduleAdd() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(addEntryNumbers, 80);
}

// Observer ระดับ document.body เพื่อจับ list ที่ถูก recreate
let listObserver = null;
function attachListObserver() {
    const list = document.getElementById(LIST_ID);
    if (!list) return false;

    if (listObserver) listObserver.disconnect();

    listObserver = new MutationObserver((mutations) => {
        const fromOurInput = mutations.every(m =>
            m.target instanceof Element &&
            (m.target.classList?.contains('entry-number-input') ||
             m.target.closest?.('.entry-number-input'))
        );
        if (fromOurInput) return;
        scheduleAdd();
    });

    listObserver.observe(list, { childList: true, subtree: true });
    addEntryNumbers();
    return true;
}

// Observer ระดับสูง — จับการที่ list หายแล้วโผล่ใหม่
function attachGlobalObserver() {
    const globalObserver = new MutationObserver(() => {
        const list = document.getElementById(LIST_ID);
        if (list && (!listObserver || !list.contains(list.querySelector('.entry-number-input')))) {
            attachListObserver();
        }
    });

    globalObserver.observe(document.body, { childList: true, subtree: true });
}

// Periodic safety check (ทุก 2 วินาที) — กันกรณี observer พลาด
function startPeriodicCheck() {
    setInterval(() => {
        const list = document.getElementById(LIST_ID);
        if (!list) return;

        const items = list.querySelectorAll(ITEM_SELECTOR);
        let needsUpdate = false;

        items.forEach(li => {
            if (li.classList.contains('completion_prompt_manager_list_head')) return;
            if (li.classList.contains('completion_prompt_manager_list_separator')) return;
            if (!li.querySelector('.entry-number-input')) {
                needsUpdate = true;
            }
        });

        if (needsUpdate) addEntryNumbers();
    }, 2000);
}

jQuery(async () => {
    console.log('[PER] Loading Preset Entry Reordering v3');

    const checkInterval = setInterval(() => {
        if (document.getElementById(LIST_ID)) {
            clearInterval(checkInterval);
            attachListObserver();
            attachGlobalObserver();
            startPeriodicCheck();
        }
    }, 500);

    if (eventSource && event_types) {
        const refreshEvents = [
            event_types.SETTINGS_UPDATED,
            event_types.CHAT_CHANGED,
            event_types.CHATCOMPLETION_SOURCE_CHANGED,
            event_types.CHARACTER_EDITED,
            event_types.CHARACTER_PAGE_LOADED,
        ].filter(Boolean);

        refreshEvents.forEach(ev => {
            eventSource.on(ev, () => {
                setTimeout(() => {
                    attachListObserver();
                    addEntryNumbers();
                }, 300);
            });
        });
    }
});
