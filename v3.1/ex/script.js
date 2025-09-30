/* CONFIG */
const DATA_URL = 'https://usis-cdn.eniamza.com/connect.json';
const LOCAL_FALLBACK = 'connect.json';
const POLL_INTERVAL = 60000;
const START_OF_DAY = timeToMinutes('08:00:00');
const END_OF_DAY = timeToMinutes('18:20:00');
const DAY_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const TIME_SLOTS = [
    { label: '08:00 - 09:20', start: '08:00:00', end: '09:20:00' },
    { label: '09:30 - 10:50', start: '09:30:00', end: '10:50:00' },
    { label: '11:00 - 12:20', start: '11:00:00', end: '12:20:00' },
    { label: '12:30 - 13:50', start: '12:30:00', end: '13:50:00' },
    { label: '14:00 - 15:20', start: '14:00:00', end: '15:20:00' },
    { label: '15:30 - 16:50', start: '15:30:00', end: '16:50:00' },
    { label: '17:00 - 18:20', start: '17:00:00', end: '18:20:00' }
];

let rawData = [];
let cart = [];
let mountedGhosts = [];
let tempHiddenCourse = null;
let selectedCourses = ['', '', '', '', '']; // 5 slots, initially empty
let selectedTimeslots = [];
let activeCourseSlot = null;

function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m, s] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToPercent(minute) {
    const total = END_OF_DAY - START_OF_DAY;
    return ((minute - START_OF_DAY) / total) * 100;
}

async function fetchData() {
    try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error();
        return await res.json();
    } catch {
        try {
            const res2 = await fetch(LOCAL_FALLBACK);
            if (!res2.ok) throw new Error();
            return await res2.json();
        } catch {
            return [];
        }
    }
}

/* Refs */
const resultsEl = document.getElementById('results');
const searchEl = document.getElementById('search');
const selectedCoursesEl = document.getElementById('selected-courses');
const gridEl = document.getElementById('grid');
const timeGutterEl = document.getElementById('time-gutter');
const cartListEl = document.getElementById('cart-list');
const clearCartBtn = document.getElementById('clear-cart');
const goButton = document.getElementById('go-button');

clearCartBtn.addEventListener('click', () => {
    cart = [];
    renderCart();
    clearSolidEvents();
});
goButton.addEventListener('click', () => {
    animateCourseSlots();
    filterAndRenderSections(0); // Start with first slot
});

/* Build timetable */
function buildTimeGutter() {
    timeGutterEl.innerHTML = '';
    gridEl.innerHTML = '';
    
    TIME_SLOTS.forEach((slot, slotIndex) => {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-slot';
        timeDiv.textContent = slot.label;
        timeGutterEl.appendChild(timeDiv);

        DAY_ORDER.forEach((day, dayIndex) => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.day = day;
            cell.dataset.slotIndex = slotIndex;
            cell.addEventListener('click', () => toggleTimeslot(day, slotIndex));
            if (dayIndex === 0) {
                cell.style.borderLeft = 'none';
            }
            gridEl.appendChild(cell);
        });
    });
}

function toggleTimeslot(day, slotIndex) {
    const key = `${day}-${slotIndex}`;
    const index = selectedTimeslots.indexOf(key);
    if (index >= 0) {
        selectedTimeslots.splice(index, 1);
    } else {
        selectedTimeslots.push(key);
    }
    updateGridSelection();
    updateGoButtonState();
}

function updateGridSelection() {
    const cells = gridEl.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        const key = `${cell.dataset.day}-${cell.dataset.slotIndex}`;
        cell.classList.toggle('selected', selectedTimeslots.includes(key));
    });
}

function updateGoButtonState() {
    goButton.disabled = selectedTimeslots.length === 0 || selectedCourses.every(code => !code);
}

function animateCourseSlots() {
    const slots = selectedCoursesEl.querySelectorAll('.selected-course');
    slots.forEach(slot => {
        slot.classList.add('flash');
        setTimeout(() => slot.classList.remove('flash'), 500);
    });
}

buildTimeGutter();

/* Course selection */
function renderSelectedCourses() {
    const slots = selectedCoursesEl.querySelectorAll('.selected-course');
    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.toggle('empty', !selectedCourses[index]);
        slot.classList.toggle('filled', !!selectedCourses[index]);
        slot.classList.toggle('active', activeCourseSlot === index);
        if (selectedCourses[index]) {
            slot.innerHTML = `
                ${selectedCourses[index]}
                <button data-slot="${index}">Remove</button>
            `;
            slot.querySelector('button').addEventListener('click', () => {
                selectedCourses[index] = '';
                renderSelectedCourses();
                renderCourseResults(filterCourses(searchEl.value));
                if (activeCourseSlot === index) {
                    activeCourseSlot = null;
                    resultsEl.innerHTML = '';
                }
                updateGoButtonState();
            });
        }
        slot.addEventListener('click', () => {
            if (selectedCourses[index]) {
                activeCourseSlot = index;
                renderSelectedCourses();
                filterAndRenderSections(index);
            }
        });
    });
}

function renderCourseResults(courses) {
    resultsEl.innerHTML = '';
    if (!courses.length) return;
    courses.forEach(code => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3>${code}</h3>
            <div class="tiny">Click to add to selection</div>
        `;
        card.addEventListener('click', () => {
            const emptyIndex = selectedCourses.indexOf('');
            if (emptyIndex === -1) {
                alert('Maximum 5 courses can be selected.');
                return;
            }
            selectedCourses[emptyIndex] = code;
            renderSelectedCourses();
            renderCourseResults(filterCourses(searchEl.value));
            updateGoButtonState();
        });
        resultsEl.appendChild(card);
    });
}

function filterCourses(q) {
    if (!q) return [];
    q = q.trim().toLowerCase();
    const uniqueCodes = [...new Set(rawData.map(item => item.courseCode))]
        .filter(code => code.toLowerCase().includes(q) && !selectedCourses.includes(code));
    return uniqueCodes.sort();
}

/* Section filtering and rendering */
function filterAndRenderSections(slotIndex) {
    activeCourseSlot = slotIndex;
    renderSelectedCourses();
    const courseCode = selectedCourses[slotIndex];
    if (!courseCode) {
        resultsEl.innerHTML = '<div class="no-matches">Select a course to view sections</div>';
        return;
    }
    const matchingSections = filterSectionsByTimeslots(courseCode);
    renderResults(matchingSections);
}

function filterSectionsByTimeslots(courseCode) {
    const timeslotRanges = selectedTimeslots.map(key => {
        const [day, slotIndex] = key.split('-');
        const slot = TIME_SLOTS[parseInt(slotIndex)];
        return { day, startMin: timeToMinutes(slot.start), endMin: timeToMinutes(slot.end) };
    });

    return rawData.filter(section => {
        if (section.courseCode !== courseCode) return false;
        const blocks = getEventBlocksForSection(section);
        if (blocks.length === 0) return false;

        // Check if all blocks match a selected timeslot exactly
        return blocks.every(block => {
            return timeslotRanges.some(range =>
                range.day === DAY_ORDER[block.dayIndex] &&
                block.startMin === range.startMin &&
                block.endMin === range.endMin
            );
        });
    });
}

/* Render results carousel */
function renderResults(list) {
    resultsEl.innerHTML = '';
    if (!list.length) {
        resultsEl.innerHTML = '<div class="no-matches">No matching sections found</div>';
        return;
    }
    list.sort((a, b) => {
        const aSeats = Math.max(0, (a.capacity || 0) - (a.consumedSeat || 0));
        const bSeats = Math.max(0, (b.capacity || 0) - (b.consumedSeat || 0));
        if (bSeats !== aSeats) return bSeats - aSeats;
        const aSec = parseInt(a.sectionName, 10);
        const bSec = parseInt(b.sectionName, 10);
        if (!isNaN(aSec) && !isNaN(bSec)) return aSec - bSec;
        return String(a.sectionName).localeCompare(String(b.sectionName));
    });

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        const seatsAvailable = Math.max(0, (item.capacity || 0) - (item.consumedSeat || 0));
        const pct = item.capacity ? Math.round((seatsAvailable / item.capacity) * 100) : 0;
        let fillClass = 'fill-gray';
        if (pct >= 80) fillClass = 'fill-green';
        else if (pct >= 50) fillClass = 'fill-yellow';
        else if (pct >= 20) fillClass = 'fill-orange';
        else if (pct > 0) fillClass = 'fill-red';
        const isLab = (item.sectionType || '').toUpperCase() === 'LAB';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <h3>${item.courseCode} — ${item.sectionName}</h3>
                    <div class="meta">${item.roomName || ''} · ${item.faculties || ''}</div>
                    <div class="tiny">${item.courseCredit} cr • ${isLab ? 'Lab' : 'Class'}</div>
                </div>
                <div class="right">
                    <div class="seats" title="Seats available: ${seatsAvailable}/${item.capacity || 'N/A'}">
                        <div class="seat-bar"><div class="seat-fill ${fillClass}" style="width:${pct}%"></div></div>
                    </div>
                    <div class="tiny seat-text ${fillClass}">${seatsAvailable}/${item.capacity || 0} seats</div>
                </div>
            </div>
        `;
        card.addEventListener('mouseenter', () => showGhostForSection(item));
        card.addEventListener('mouseleave', () => clearGhosts());
        card.addEventListener('click', ev => {
            ev.preventDefault();
            tryToggleAdd(item);
        });
        resultsEl.appendChild(card);
    });
}

/* Timetable blocks */
function showGhostForSection(section) {
    clearGhosts();
    tempHiddenCourse = section.courseCode;
    removeSolidEventsForCourse(tempHiddenCourse);
    const blocks = getEventBlocksForSection(section);
    const conflict = blocks.some(b => isConflictWithCartBlock(b, section.courseCode));
    blocks.forEach(b => {
        const dom = createEventDom(b, true, conflict);
        gridEl.appendChild(dom);
        mountedGhosts.push(dom);
    });
}

function clearGhosts() {
    mountedGhosts.forEach(n => n.remove());
    mountedGhosts = [];
    if (tempHiddenCourse) {
        drawSolidEventsForCourse(tempHiddenCourse);
        tempHiddenCourse = null;
    }
}

function removeSolidEventsForCourse(courseCode) {
    Array.from(gridEl.querySelectorAll('.event-solid'))
        .forEach(n => {
            if (n.textContent.startsWith(courseCode)) n.remove();
        });
}

function drawSolidEventsForCourse(courseCode) {
    cart.filter(s => s.courseCode === courseCode).forEach(section => {
        const blocks = getEventBlocksForSection(section);
        blocks.forEach(b => {
            b.solid = true;
            const el = createEventDom(b, false, false);
            el.classList.add('event-solid');
            gridEl.appendChild(el);
        });
    });
}

function createEventDom(block, ghost = false, conflict = false) {
    const dayIndex = block.dayIndex;
    const colLeft = (dayIndex / 7) * 100;
    const colWidthPct = (1 / 7) * 100;
    const topPct = minutesToPercent(block.startMin);
    const bottomPct = minutesToPercent(block.endMin);
    const heightPct = bottomPct - topPct;
    const el = document.createElement('div');
    el.className = 'event-block';
    el.style.top = topPct + '%';
    el.style.height = heightPct + '%';
    el.style.left = `calc(${colLeft}% + 8px)`;
    el.style.width = `calc(${colWidthPct}% - 16px)`;
    el.dataset.sectionId = block.sectionId;
    if (block.isLab) el.classList.add('event-lab');
    else el.classList.add('event-class');
    if (ghost) el.classList.add('event-ghost');
    if (conflict) el.classList.add('event-conflict');
    if (block.solid) el.classList.add('event-solid');
    el.innerHTML = `
        <div class="event-title">${block.title}</div>
        <div class="event-meta">${block.meta}</div>
    `;
    return el;
}

function getEventBlocksForSection(section) {
    const blocks = [];
    const baseTitle = `${section.courseCode} ${section.sectionName}`;
    const metaRoom = section.roomName || '';
    const cs = (section.sectionSchedule && section.sectionSchedule.classSchedules) || [];
    cs.forEach(sch => {
        const startMin = timeToMinutes(sch.startTime);
        const endMin = timeToMinutes(sch.endTime);
        const dayIndex = DAY_ORDER.indexOf(sch.day);
        if (dayIndex < 0) return;
        blocks.push({
            dayIndex,
            startMin,
            endMin,
            title: baseTitle,
            meta: metaRoom,
            isLab: false,
            sectionId: section.sectionId,
            section
        });
    });
    const ls = (section.labSchedules) || [];
    ls.forEach(sch => {
        const startMin = timeToMinutes(sch.startTime);
        const endMin = timeToMinutes(sch.endTime);
        const dayIndex = DAY_ORDER.indexOf(sch.day);
        if (dayIndex < 0) return;
        blocks.push({
            dayIndex,
            startMin,
            endMin,
            title: baseTitle + ' (Lab)',
            meta: section.labRoomName || '',
            isLab: true,
            sectionId: section.sectionId,
            section
        });
    });
    return blocks;
}

/* Conflicts */
function isConflictWithCartBlock(block, ignoreCourseCode = null) {
    for (const c of cart) {
        if (ignoreCourseCode && c.courseCode === ignoreCourseCode) continue;
        const cblocks = getEventBlocksForSection(c);
        for (const cb of cblocks) {
            if (cb.dayIndex !== block.dayIndex) continue;
            if (timesOverlap(cb.startMin, cb.endMin, block.startMin, block.endMin)) return true;
        }
    }
    return false;
}

function timesOverlap(s1, e1, s2, e2) {
    return Math.max(s1, s2) < Math.min(e1, e2);
}

function tryToggleAdd(section) {
    const idx = cart.findIndex(c => c.sectionId === section.sectionId);
    if (idx >= 0) {
        cart.splice(idx, 1);
        renderCart();
        clearSolidEvents();
        drawSolidEvents();
        return;
    }
    const existingIndex = cart.findIndex(c => c.courseCode === section.courseCode);
    if (existingIndex >= 0) {
        const examConflict = checkExamConflict(section, section.courseCode);
        if (examConflict) {
            alert('Exam clash: ' + examConflict);
            return;
        }
        const blocks = getEventBlocksForSection(section);
        const hasConflict = blocks.some(b => isConflictWithCartBlock(b, section.courseCode));
        if (hasConflict) {
            alert('Time clash: cannot replace.');
            return;
        }
        cart.splice(existingIndex, 1, section);
        renderCart();
        clearSolidEvents();
        drawSolidEvents();
        return;
    }
    const examConflict = checkExamConflict(section);
    if (examConflict) {
        alert('Exam clash: ' + examConflict);
        return;
    }
    const blocks = getEventBlocksForSection(section);
    const hasConflict = blocks.some(b => isConflictWithCartBlock(b));
    if (hasConflict) {
        alert('Time clash: cannot add.');
        return;
    }
    cart.push(section);
    renderCart();
    drawSolidEvents();
}

function checkExamConflict(candidate, ignoreCourseCode = null) {
    const cExamDate = candidate.sectionSchedule?.finalExamDate;
    const cStart = candidate.sectionSchedule?.finalExamStartTime;
    const cEnd = candidate.sectionSchedule?.finalExamEndTime;
    if (!cExamDate) return null;
    for (const other of cart) {
        if (ignoreCourseCode && other.courseCode === ignoreCourseCode) continue;
        const oDate = other.sectionSchedule?.finalExamDate;
        const oStart = other.sectionSchedule?.finalExamStartTime;
        const oEnd = other.sectionSchedule?.finalExamEndTime;
        if (!oDate) continue;
        if (oDate === cExamDate) {
            const s1 = timeToMinutes(cStart), e1 = timeToMinutes(cEnd);
            const s2 = timeToMinutes(oStart), e2 = timeToMinutes(oEnd);
            if (timesOverlap(s1, e1, s2, e2)) return `${candidate.courseCode} ${candidate.sectionName} vs ${other.courseCode} ${other.sectionName} on ${cExamDate}`;
        }
    }
    return null;
}

/* Cart rendering */
function renderCart() {
    cartListEl.innerHTML = '';
    if (!cart.length) {
        cartListEl.innerHTML = '<div class="tiny">Cart empty</div>';
        saveCart();
        return;
    }
    cart.forEach(s => {
        const midDate = s.sectionSchedule?.midExamDate || '';
        const midStart = s.sectionSchedule?.midExamStartTime || '';
        const midEnd = s.sectionSchedule?.midExamEndTime || '';
        const finalDate = s.sectionSchedule?.finalExamDate || '';
        const finalStart = s.sectionSchedule?.finalExamStartTime || '';
        const finalEnd = s.sectionSchedule?.finalExamEndTime || '';
        const item = document.createElement('div');
        item.className = 'cart-item';
        item.innerHTML = `
            <div>
                <div style="font-weight:700">${s.courseCode} — ${s.sectionName} ${s.sectionType === 'LAB' ? '(Lab)' : ''}</div>
                <div class="cart-info">
                    <span class="tiny">Faculty: ${s.faculties || ''}</span>
                    <span class="tiny">Midterm: ${formatExam(midDate, midStart, midEnd)}</span>
                    <span class="tiny">Final: ${formatExam(finalDate, finalStart, finalEnd)}</span>
                </div>
            </div>
            <div><button class="btn small" data-sectionid="${s.sectionId}">Remove</button></div>
        `;
        item.querySelector('button').addEventListener('click', () => {
            cart = cart.filter(x => x.sectionId !== s.sectionId);
            renderCart();
            clearSolidEvents();
            drawSolidEvents();
        });
        cartListEl.appendChild(item);
    });
    saveCart();
}

function formatExam(date, start, end) {
    if (!date) return 'N/A';
    const d = new Date(date);
    const month = d.toLocaleString('default', { month: 'short' });
    const day = d.getDate();
    return `<span class="exam-date"><b>${month} ${day}</b></span> <span class="exam-time"><b>${start}</b> - <b>${end}</b></span>`;
}

function drawSolidEvents() {
    clearSolidEvents();
    cart.forEach(section => {
        const blocks = getEventBlocksForSection(section);
        blocks.forEach(b => {
            b.solid = true;
            const el = createEventDom(b, false, false);
            el.classList.add('event-solid');
            gridEl.appendChild(el);
        });
    });
}

function clearSolidEvents() {
    Array.from(gridEl.querySelectorAll('.event-solid')).forEach(n => n.remove());
}

/* Search */
let searchTimeout = null;
searchEl.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        renderCourseResults(filterCourses(searchEl.value));
    }, 180);
});

/* Cart persistence helpers */
function saveCart() {
    localStorage.setItem('courseCart', JSON.stringify(cart));
}

function loadCart() {
    try {
        const saved = localStorage.getItem('courseCart');
        if (saved) cart = JSON.parse(saved);
    } catch {
        cart = [];
    }
}

/* Load */
async function loadAndRender() {
    rawData = await fetchData();
    loadCart();
    renderSelectedCourses();
    renderCart();
    clearSolidEvents();
    drawSolidEvents();
    updateGoButtonState();
}

setInterval(async () => {
    rawData = await fetchData();
    if (searchEl.value.trim()) renderCourseResults(filterCourses(searchEl.value));
}, POLL_INTERVAL);

loadAndRender();