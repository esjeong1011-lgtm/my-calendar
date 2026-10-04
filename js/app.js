'use strict';

/* =========================================================
   설정
   - 분류 순서 = 달력 아이콘 우선순위 (위에 있을수록 먼저 표시)
   - icon: 분류 선택 버튼에 쓰는 대표 아이콘
   - 목표는 달력·목록에서 완료 여부에 따라 iconTodo / iconDone 사용
   ========================================================= */
const CATEGORIES = [
  { id: 'appointment', label: '약속',   icon: 'icons/appointment.png' },
  { id: 'work',        label: '일',     icon: 'icons/work.png' },
  { id: 'goal',        label: '목표',   icon: 'icons/goal.png', iconTodo: 'icons/goal-todo.png', iconDone: 'icons/goal-done.png' },
  { id: 'sunghoon',    label: '성훈',   icon: 'icons/sunghoon.png' },
  { id: 'holiday',     label: '공휴일', icon: 'icons/holiday.png' },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const STORAGE_KEY = 'my-calendar.events.v1';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SAVING_DELAY = 150; // 저장이 이보다 오래 걸리면 '저장중..' 표시 (ms)

/* ===== 날짜 도구 ===== */
const pad = (n) => String(n).padStart(2, '0');
const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseDateKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const monthIndex = (year, month) => year * 12 + month; // month: 0~11
const fromMonthIndex = (i) => ({ year: Math.floor(i / 12), month: i % 12 });
const shortDate = (key) => {
  const [, m, d] = key.split('-');
  return `${+m}월 ${+d}일`;
};

/* ===== 저장소 ===== */
const store = {
  load() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },
  async save(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },
};

let events = store.load();
let byDate = new Map(); // 'YYYY-MM-DD' → 그날 걸쳐 있는 일정들

function reindex() {
  byDate = new Map();
  for (const ev of events) {
    const last = parseDateKey(ev.end.slice(0, 10));
    let d = parseDateKey(ev.start.slice(0, 10));
    for (let i = 0; d <= last && i < 366; i++, d = addDays(d, 1)) {
      const key = toDateKey(d);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(ev);
    }
  }
  for (const list of byDate.values()) list.sort((a, b) => a.start.localeCompare(b.start));
}

/* ===== 요소 ===== */
const $ = (sel) => document.querySelector(sel);
const el = {
  months: $('#months'),
  monthBtn: $('#monthBtn'),
  monthLabel: $('#monthLabel'),
  todayBtn: $('#todayBtn'),
  installBtn: $('#installBtn'),
  backdrop: $('#backdrop'),
  detailSheet: $('#detailSheet'),
  detailTitle: $('#detailTitle'),
  detailAddBtn: $('#detailAddBtn'),
  eventList: $('#eventList'),
  formSheet: $('#formSheet'),
  formTitle: $('#formTitle'),
  formBody: $('#formBody'),
  form: $('#eventForm'),
  saveBtn: $('#saveBtn'),
  deleteBtn: $('#deleteBtn'),
  chips: $('#categoryChips'),
  title: $('#fTitle'),
  startDate: $('#fStartDate'),
  startTime: $('#fStartTime'),
  endDate: $('#fEndDate'),
  endTime: $('#fEndTime'),
  allDay: $('#fAllDay'),
  scheduleField: $('[data-field="schedule"]'),
  memo: $('#fMemo'),
  pickerSheet: $('#pickerSheet'),
  pickerYear: $('#pickerYear'),
  prevYearBtn: $('#prevYearBtn'),
  nextYearBtn: $('#nextYearBtn'),
  monthPick: $('#monthPick'),
  saving: $('#saving'),
  toast: $('#toast'),
  cheer: $('#cheer'),
  cheerText: $('#cheerText'),
  cheerFx: $('#cheerFx'),
};

/* ===== 아이콘 ===== */
function iconFor(ev) {
  const c = CAT[ev.category];
  if (ev.category === 'goal') return ev.done ? c.iconDone : c.iconTodo;
  return c.icon;
}

const MAX_STACK = 3; // 한 칸에 겹쳐 보여줄 캐릭터 최대 수

// 그날 일정마다 캐릭터 하나씩, 분류 우선순위(CATEGORIES 순서)대로 정렬
// 첫 번째가 맨 앞(아래쪽), 나머지는 뒤에서 귀만 보이게 겹침
function dayIcons(list) {
  const order = (ev) => CATEGORIES.findIndex((c) => c.id === ev.category);
  return [...list]
    .sort((a, b) => order(a) - order(b) || a.start.localeCompare(b.start))
    .map((ev) => ({ src: iconFor(ev), catId: ev.category }));
}

// 이미지가 아직 없거나 깨지면 분류 색 + 첫 글자로 대신 표시
function makeIcon(src, catId, className) {
  const img = new Image();
  img.className = className;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.addEventListener('error', () => {
    const fb = document.createElement('span');
    fb.className = `${className} icon-fallback cat-${catId}`;
    fb.textContent = CAT[catId].label[0];
    img.replaceWith(fb);
  }, { once: true });
  img.src = src;
  return img;
}

/* ===== 메인 캘린더 ===== */
const now = new Date();
let anchor = monthIndex(now.getFullYear(), now.getMonth()); // 가운데 칸의 달
let visibleMonth = anchor;

// 이전·현재·다음 달 3칸을 위아래로 그려두고, 넘길 때마다 가운데로 다시 맞춤
function renderMonths() {
  el.months.replaceChildren(buildMonth(anchor - 1), buildMonth(anchor), buildMonth(anchor + 1));
  el.months.scrollTop = el.months.clientHeight;
  setVisibleMonth(anchor);
}

function buildMonth(mi) {
  const { year, month } = fromMonthIndex(mi);
  const pane = document.createElement('div');
  pane.className = 'month';
  pane.dataset.month = mi;
  pane.setAttribute('aria-label', `${year}년 ${month + 1}월`);

  const first = new Date(year, month, 1);
  const todayKey = toDateKey(new Date());
  let d = addDays(first, -first.getDay());
  for (let i = 0; i < 42; i++, d = addDays(d, 1)) {
    pane.append(buildDay(d, d.getMonth() === month, todayKey));
  }
  return pane;
}

function buildDay(d, inMonth, todayKey) {
  const key = toDateKey(d);
  const list = byDate.get(key) || [];
  const dow = d.getDay();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'day';
  btn.dataset.date = key;
  if (!inMonth) btn.classList.add('is-outside');
  if (key === todayKey) btn.classList.add('is-today');
  if (dow === 0) btn.classList.add('is-sun');
  if (dow === 6) btn.classList.add('is-sat');

  const icons = dayIcons(list);
  if (icons.length) {
    const shown = icons.slice(0, MAX_STACK);
    const stack = document.createElement('span');
    stack.className = 'day-stack';
    stack.style.setProperty('--n', shown.length);
    shown.forEach((icon, i) => {
      const img = makeIcon(icon.src, icon.catId, 'day-icon');
      img.style.setProperty('--i', i);
      img.style.zIndex = shown.length - i;
      stack.append(img);
    });
    btn.append(stack);
    if (icons.length > MAX_STACK) {
      const more = document.createElement('span');
      more.className = 'day-more';
      more.textContent = `+${icons.length - MAX_STACK}`;
      btn.append(more);
    }
  } else {
    const num = document.createElement('span');
    num.className = 'day-num';
    num.textContent = d.getDate();
    btn.append(num);
  }

  let label = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[dow]}요일`;
  if (list.length) label += `, 일정 ${list.length}개`;
  btn.setAttribute('aria-label', label);
  return btn;
}

function setVisibleMonth(mi) {
  visibleMonth = mi;
  const { year, month } = fromMonthIndex(mi);
  el.monthLabel.textContent = `${year}년 ${month + 1}월`;
}

function goToMonth(mi) {
  anchor = mi;
  renderMonths();
}

function settleScroll() {
  const h = el.months.clientHeight;
  if (!h) return;
  const idx = Math.round(el.months.scrollTop / h);
  if (idx === 1) return;
  anchor += idx - 1;
  renderMonths();
}

let scrollTimer;
el.months.addEventListener('scroll', () => {
  const h = el.months.clientHeight;
  if (h) setVisibleMonth(anchor + Math.round(el.months.scrollTop / h) - 1);
  if (!('onscrollend' in window)) {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(settleScroll, 120);
  }
}, { passive: true });
el.months.addEventListener('scrollend', settleScroll);

// PC에서 확인할 때: 마우스 휠로도 달 이동
let wheelLock = false;
el.months.addEventListener('wheel', (e) => {
  if (!e.deltaY) return;
  e.preventDefault();
  if (wheelLock) return;
  wheelLock = true;
  el.months.scrollBy({ top: Math.sign(e.deltaY) * el.months.clientHeight, behavior: 'smooth' });
  setTimeout(() => { wheelLock = false; }, 450);
}, { passive: false });

window.addEventListener('resize', () => {
  el.months.scrollTop = el.months.clientHeight;
});

el.months.addEventListener('click', (e) => {
  const day = e.target.closest('.day');
  if (!day) return;
  const key = day.dataset.date;
  if (byDate.get(key)?.length) openDetail(key);
  else openForm({ date: key });
});

el.todayBtn.addEventListener('click', () => {
  const t = new Date();
  goToMonth(monthIndex(t.getFullYear(), t.getMonth()));
});

/* ===== 하단 시트 (한 번에 하나만 열림, 휴대폰 뒤로가기 버튼 지원) ===== */
const sheets = {
  current: null,
  inHistory: false,

  show(sheet) {
    if (this.current === sheet) return;
    if (this.current) this.current.classList.remove('is-open');
    else this.pushHistory();
    this.current = sheet;
    sheet.classList.add('is-open');
    el.backdrop.classList.add('is-open');
  },

  hide() {
    if (!this.current) return;
    if (this.inHistory) history.back(); // popstate에서 close
    else this.close();
  },

  close() {
    if (!this.current) return;
    this.current.classList.remove('is-open');
    this.current = null;
    this.inHistory = false;
    el.backdrop.classList.remove('is-open');
    document.activeElement?.blur();
  },

  pushHistory() {
    try {
      history.pushState({ sheet: true }, '');
      this.inHistory = true;
    } catch {
      this.inHistory = false;
    }
  },
};

window.addEventListener('popstate', () => sheets.close());
el.backdrop.addEventListener('click', () => sheets.hide());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') sheets.hide();
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => sheets.hide()));

/* ===== 일정 확인 창 ===== */
let selectedDate = null;

function openDetail(key) {
  selectedDate = key;
  renderDetail();
  el.detailSheet.querySelector('.sheet-body').scrollTop = 0;
  sheets.show(el.detailSheet);
}

function renderDetail() {
  const d = parseDateKey(selectedDate);
  el.detailTitle.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  const list = byDate.get(selectedDate) || [];
  el.eventList.replaceChildren(...list.map(buildEventItem));
}

function formatRange(ev) {
  const [sd, st] = ev.start.split('T');
  const [ed, et] = ev.end.split('T');
  if (ev.allDay) return sd === ed ? '하루 종일' : `${shortDate(sd)} ~ ${shortDate(ed)} · 하루 종일`;
  if (sd === ed) return `${st} ~ ${et}`;
  return `${shortDate(sd)} ${st} ~ ${shortDate(ed)} ${et}`;
}

function buildEventItem(ev) {
  const cat = CAT[ev.category];
  const li = document.createElement('li');
  li.className = `event cat-${ev.category}`;
  if (ev.category === 'goal' && ev.done) li.classList.add('is-done');

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'event-main';
  main.dataset.id = ev.id;
  main.setAttribute('aria-label', `${ev.title}, 눌러서 수정`);

  const text = document.createElement('div');
  text.className = 'event-text';

  const title = document.createElement('p');
  title.className = 'event-title';
  title.textContent = ev.title;

  const meta = document.createElement('p');
  meta.className = 'event-meta';
  const tag = document.createElement('span');
  tag.className = 'cat-tag';
  tag.textContent = cat.label;
  const time = document.createElement('span');
  time.textContent = formatRange(ev);
  meta.append(tag, time);

  text.append(title, meta);
  if (ev.memo) {
    const memo = document.createElement('p');
    memo.className = 'event-memo';
    memo.textContent = ev.memo;
    text.append(memo);
  }

  main.append(makeIcon(iconFor(ev), ev.category, 'event-icon'), text);
  li.append(main);

  const actions = document.createElement('div');
  actions.className = 'event-actions';

  if (ev.category === 'goal') {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'goal-toggle press';
    toggle.dataset.id = ev.id;
    toggle.setAttribute('aria-pressed', String(!!ev.done));
    toggle.setAttribute('aria-label', `목표 ${ev.done ? '완료' : '미완료'} 상태, 눌러서 바꾸기`);
    if (ev.done) {
      toggle.classList.add('is-done');
      toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>완료';
    } else {
      toggle.textContent = '미완료';
    }
    actions.append(toggle);
  }

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'edit-btn press';
  edit.dataset.id = ev.id;
  edit.setAttribute('aria-label', `${ev.title} 수정`);
  edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>수정';
  actions.append(edit);
  li.append(actions);
  return li;
}

el.eventList.addEventListener('click', (e) => {
  const toggle = e.target.closest('.goal-toggle');
  if (toggle) return toggleGoal(toggle.dataset.id);
  const target = e.target.closest('.edit-btn, .event-main');
  if (target) openForm({ event: events.find((ev) => ev.id === target.dataset.id) });
});

el.detailAddBtn.addEventListener('click', () => openForm({ date: selectedDate }));

async function toggleGoal(id) {
  const next = events.map((ev) => (ev.id === id ? { ...ev, done: !ev.done } : ev));
  if (!(await persist(next))) return;
  renderMonths();
  renderDetail();
}

/* ===== 일정 입력 창 ===== */
let editingId = null;
let prevStart = null;
let timedBackup = null; // 하루 종일을 켜기 전 시간 (끄면 되돌림)

function buildCategoryChips() {
  for (const c of CATEGORIES) {
    const label = document.createElement('label');
    label.className = `chip cat-${c.id}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'category';
    input.value = c.id;
    const face = document.createElement('span');
    face.className = 'chip-face';
    const name = document.createElement('span');
    name.textContent = c.label;
    face.append(makeIcon(c.icon, c.id, 'chip-icon'), name);
    label.append(input, face);
    el.chips.append(label);
  }
}

const readDT = (dateInput, timeInput) =>
  dateInput.value && timeInput.value ? new Date(`${dateInput.value}T${timeInput.value}`) : null;
const setDT = (dateInput, timeInput, d) => {
  dateInput.value = toDateKey(d);
  timeInput.value = toTime(d);
};

function defaultStart(key) {
  const t = new Date();
  if (key !== toDateKey(t)) return new Date(`${key}T09:00`);
  t.setMinutes(0, 0, 0);
  t.setHours(t.getHours() + 1);
  return toDateKey(t) === key ? t : new Date(`${key}T23:00`);
}

function openForm({ date, event }) {
  el.form.reset();
  clearErrors();

  if (event) {
    editingId = event.id;
    el.formTitle.textContent = '일정 수정';
    el.title.value = event.title;
    el.memo.value = event.memo || '';
    el.form.elements.category.value = event.category;
    [el.startDate.value, el.startTime.value] = event.start.split('T');
    [el.endDate.value, el.endTime.value] = event.end.split('T');
    el.allDay.checked = !!event.allDay;
    el.deleteBtn.hidden = false;
  } else {
    editingId = null;
    el.formTitle.textContent = '일정 추가';
    const start = defaultStart(date);
    setDT(el.startDate, el.startTime, start);
    setDT(el.endDate, el.endTime, new Date(start.getTime() + 60 * 60 * 1000));
    el.deleteBtn.hidden = true;
  }

  timedBackup = null;
  el.scheduleField.classList.toggle('is-allday', el.allDay.checked);
  prevStart = readDT(el.startDate, el.startTime);
  el.formBody.scrollTop = 0;
  sheets.show(el.formSheet);
}

// 시작을 바꾸면 기존 일정 길이를 유지한 채 종료도 같이 이동
function onStartChange() {
  const start = readDT(el.startDate, el.startTime);
  const end = readDT(el.endDate, el.endTime);
  if (start && end && prevStart && end >= prevStart) {
    setDT(el.endDate, el.endTime, new Date(start.getTime() + (end - prevStart)));
  }
  prevStart = start;
}
el.startDate.addEventListener('change', onStartChange);

// 하루 종일: 시간 칸을 숨기고 00:00 ~ 23:59로 저장
el.allDay.addEventListener('change', () => {
  const on = el.allDay.checked;
  el.scheduleField.classList.toggle('is-allday', on);
  if (on) {
    timedBackup = { start: el.startTime.value, end: el.endTime.value };
    el.startTime.value = '00:00';
    el.endTime.value = '23:59';
  } else {
    el.startTime.value = timedBackup?.start || '09:00';
    el.endTime.value = timedBackup?.end || '10:00';
    timedBackup = null;
  }
  prevStart = readDT(el.startDate, el.startTime);
});
el.startTime.addEventListener('change', onStartChange);

// 받침에 맞는 조사 (을/를)
const objJosa = (word) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 ? '을' : '를';
};

function validate() {
  const errors = {};
  if (!el.title.value.trim()) errors.title = '제목을 입력하지 않아서 저장되지 않았어요.';
  if (!el.form.elements.category.value) errors.category = '분류를 선택하지 않아서 저장되지 않았어요.';

  const missing = [];
  if (!el.startDate.value) missing.push('시작 일자');
  if (!el.startTime.value) missing.push('시작 시간');
  if (!el.endDate.value) missing.push('끝나는 일자');
  if (!el.endTime.value) missing.push('끝나는 시간');
  if (missing.length) {
    const last = missing[missing.length - 1];
    errors.schedule = `${missing.join(', ')}${objJosa(last)} 입력하지 않아서 저장되지 않았어요.`;
  } else if (readDT(el.endDate, el.endTime) < readDT(el.startDate, el.startTime)) {
    errors.schedule = '끝나는 일자/시간이 시작보다 빨라서 저장되지 않았어요.';
  }
  return errors;
}

function setError(name, message) {
  const field = el.form.querySelector(`[data-field="${name}"]`);
  field.classList.toggle('has-error', !!message);
  field.querySelector('.field-error').textContent = message || '';
}

function clearErrors() {
  ['title', 'category', 'schedule'].forEach((name) => setError(name, ''));
}

// 내용을 채우면 그 칸의 오류 문구는 바로 사라짐
el.form.addEventListener('input', (e) => {
  const field = e.target.closest('[data-field]');
  if (field?.classList.contains('has-error')) setError(field.dataset.field, '');
});
el.form.addEventListener('change', (e) => {
  const field = e.target.closest('[data-field]');
  if (field?.classList.contains('has-error')) setError(field.dataset.field, '');
});

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const errors = validate();
  const names = Object.keys(errors);
  if (names.length) {
    names.forEach((name) => setError(name, errors[name]));
    el.form.querySelector('.has-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = {
    title: el.title.value.trim(),
    category: el.form.elements.category.value,
    start: `${el.startDate.value}T${el.startTime.value}`,
    end: `${el.endDate.value}T${el.endTime.value}`,
    memo: el.memo.value.trim(),
    allDay: el.allDay.checked,
  };

  const next = editingId
    ? events.map((ev) => (ev.id === editingId
      ? { ...ev, ...data, done: data.category === 'goal' ? !!ev.done : false }
      : ev))
    : [...events, { id: makeId(), ...data, done: false, createdAt: Date.now() }];

  el.saveBtn.disabled = true;
  const ok = await persist(next);
  el.saveBtn.disabled = false;
  if (!ok) return;

  // 저장 완료 → 메인 화면으로, 저장한 날짜에 아이콘이 올라옴
  const isNewGoal = !editingId && data.category === 'goal';
  sheets.hide();
  const s = parseDateKey(data.start.slice(0, 10));
  goToMonth(monthIndex(s.getFullYear(), s.getMonth()));
  const cell = el.months.querySelector(`.month[data-month="${anchor}"] .day[data-date="${data.start.slice(0, 10)}"]`);
  cell?.classList.add('just-saved');
  toast(editingId ? '일정을 수정했어요.' : '일정을 저장했어요.');

  // 목표를 새로 등록하면 입력 창이 다 내려간 뒤 귀요미들이 응원하러 등장
  if (isNewGoal) setTimeout(showCheer, 650);
});

el.deleteBtn.addEventListener('click', async () => {
  if (!editingId || !confirm('이 일정을 삭제할까요?')) return;
  const next = events.filter((ev) => ev.id !== editingId);
  if (!(await persist(next))) return;
  sheets.hide();
  renderMonths();
  toast('일정을 삭제했어요.');
});

/* ===== 저장 (오래 걸리면 '저장중..' 표시) ===== */
async function persist(next) {
  const timer = setTimeout(() => { el.saving.hidden = false; }, SAVING_DELAY);
  try {
    await store.save(next);
    events = next;
    reindex();
    return true;
  } catch (err) {
    console.error(err);
    toast('저장하지 못했어요. 휴대폰 저장 공간을 확인해 주세요.');
    return false;
  } finally {
    clearTimeout(timer);
    el.saving.hidden = true;
  }
}

/* ===== 년·월 선택 창 ===== */
let pickerYear;

function renderPicker() {
  el.pickerYear.textContent = `${pickerYear}년`;
  const t = new Date();
  const buttons = [];
  for (let m = 0; m < 12; m++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${m + 1}월`;
    b.dataset.month = m;
    const mi = monthIndex(pickerYear, m);
    if (mi === visibleMonth) b.classList.add('is-selected');
    if (mi === monthIndex(t.getFullYear(), t.getMonth())) b.classList.add('is-now');
    buttons.push(b);
  }
  el.monthPick.replaceChildren(...buttons);
}

el.monthBtn.addEventListener('click', () => {
  pickerYear = fromMonthIndex(visibleMonth).year;
  renderPicker();
  sheets.show(el.pickerSheet);
});
el.prevYearBtn.addEventListener('click', () => { pickerYear--; renderPicker(); });
el.nextYearBtn.addEventListener('click', () => { pickerYear++; renderPicker(); });
el.monthPick.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  goToMonth(monthIndex(pickerYear, Number(b.dataset.month)));
  sheets.hide();
});

/* ===== 응원 팝업 (귀요미들) =====
   한 번에 한 캐릭터만 말하고, 멘트와 주변 효과는 매번 랜덤 */
const CHEER_LINES = {
  hachiware: [
    '왠지 오늘 하루도 엄청 좋은 일이 생길 것 같은 기분이 들어!',
    '어려운 일은 내가 반으로 쪼개줄게! 자, 힘내자!',
    '괜찮아, 괜찮아! 실패해도 다 추억이 되는 걸!',
    '너랑 같이 있으면 뭐든지 해낼 수 있을 것 같아!',
  ],
  usagi: [
    '야하-! 고민은 바구니에 담아서 던져버려!',
    '후루룩 챱챱! 맛있는 거 먹고 그냥 잊어버리는 거야-!',
    '우라자-! 일단 부딪혀 보는 거야, 쿠루쿠루~!',
    '휴식 시간 끝! 다시 신나게 구르는 거야-!',
  ],
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (min, max) => min + Math.random() * (max - min);
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);

// 같은 멘트·같은 효과가 연달아 나오지 않게
function pickFresh(list, last) {
  if (list.length < 2) return list[0];
  let item;
  do item = pick(list); while (item === last);
  return item;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function fx(symbol, kind, vars, color) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `fx fx--${kind}`);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#fx-${symbol}`);
  svg.append(use);
  for (const [key, value] of Object.entries(vars)) svg.style.setProperty(`--${key}`, value);
  if (color) svg.style.color = color;
  return svg;
}

const PETALS = ['#ffb3c6', '#ffe08a', '#a8d8ff', '#ffffff', '#d6c4ff'];
const CONFETTI = ['#ff8fa3', '#ffd76a', '#8fd0ff', '#b9e08f', '#d6c4ff'];
const FOODS = ['onigiri', 'dango', 'pudding', 'strawberry', 'donut'];
const ARRIVE = 1.4; // 캐릭터들이 도착하는 시점(초)부터 효과 시작

const FX_THEMES = {
  // 꽃 폭죽: 캐릭터들 뒤에서 꽃이 팡! 팡! 두 번 터져 퍼짐
  flowers: () => Array.from({ length: 22 }, (_, i) => fx('flower', 'burst', {
    x: `${rand(30, 70)}%`, y: '86%',
    dx: `${rand(-150, 150)}px`, dy: `${rand(-220, -100)}px`, r: `${rand(-360, 360)}deg`,
    s: rand(0.7, 1.15), dur: `${rand(1.8, 2.3)}s`,
    delay: `${ARRIVE + (i < 12 ? 0 : 1.2) + rand(0, 0.3)}s`,
  }, pick(PETALS))),

  // 먹을거 비: 먼작귀 음식들이 살랑살랑 떨어짐
  food: () => shuffle([...FOODS, pick(FOODS)]).map((food, i) => fx(food, 'fall', {
    x: `${8 + i * 14 + rand(-4, 4)}%`, r: `${rand(10, 25)}deg`,
    s: rand(0.85, 1.15), dur: `${rand(3.4, 4.6)}s`, delay: `${ARRIVE + rand(0, 2.4)}s`,
  })),

  // 파티 폭죽: 양쪽 아래 구석에서 색종이와 꽃이 발사
  party: () => [-1, 1, -1, 1].flatMap((side, wave) => Array.from({ length: 8 }, (_, i) => fx(i % 3 ? 'confetti' : 'flower', 'burst', {
    x: side < 0 ? '4%' : '96%', y: '96%',
    dx: `${-side * rand(50, 210)}px`, dy: `${rand(-270, -130)}px`, r: `${rand(-540, 540)}deg`,
    s: i % 3 ? rand(0.45, 0.7) : rand(0.6, 0.85), dur: `${rand(1.5, 2)}s`,
    delay: `${ARRIVE + wave * 0.6 + rand(0, 0.15)}s`,
  }, pick(i % 3 ? CONFETTI : PETALS)))),

  // 하트: 캐릭터들 위로 하트와 반짝이가 둥실둥실
  hearts: () => Array.from({ length: 8 }, (_, i) => fx(i % 3 === 2 ? 'sparkle' : 'heart', 'float', {
    x: `${rand(6, 92)}%`, s: rand(0.6, 1), sway: `${rand(-16, 16)}px`,
    dur: `${rand(2.8, 3.8)}s`, delay: `${ARRIVE + i * 0.35}s`,
  }, i % 3 === 2 ? '#ffd76a' : pick(['#ff8fa3', '#ffb3c6', '#ff7d8f']))),

  // 음표: 훌라 음악처럼 음표가 흔들흔들 올라감
  notes: () => Array.from({ length: 7 }, (_, i) => fx('note', 'float', {
    x: `${rand(6, 92)}%`, s: rand(0.65, 0.95), sway: `${rand(-20, 20)}px`,
    dur: `${rand(2.6, 3.4)}s`, delay: `${ARRIVE + i * 0.4}s`,
  }, pick(['#ff8fa3', '#8fd0ff', '#ffd76a', '#b9e08f']))),
};

let lastLine = null;
let lastTheme = null;

function showCheer() {
  const speaker = pick(Object.keys(CHEER_LINES));
  lastLine = pickFresh(CHEER_LINES[speaker], lastLine);
  el.cheer.dataset.speaker = speaker;
  el.cheerText.textContent = lastLine;
  el.cheer.querySelectorAll('.cheer-char').forEach((img) => {
    img.classList.toggle('is-speaking', img.dataset.char === speaker);
  });

  lastTheme = pickFresh(Object.keys(FX_THEMES), lastTheme);
  el.cheerFx.replaceChildren(...FX_THEMES[lastTheme]());

  sheets.show(el.cheer);
}

/* ===== 토스트 ===== */
let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-show'), 2000);
}

/* ===== 홈 화면 앱 설치 ===== */
// 안드로이드 크롬: 설치할 수 있을 때만 '앱 설치' 버튼이 나타남
// 아이폰 사파리: 공유 → '홈 화면에 추가'로 설치 (버튼 없음)
let installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  el.installBtn.hidden = false;
});

el.installBtn.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  el.installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  el.installBtn.hidden = true;
  toast('홈 화면에 캘린더를 설치했어요.');
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('서비스 워커 등록 실패', err));
  });

  // 새 버전이 설치되면 한 번 새로고침해서 바로 새 화면으로
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

/* ===== 시작 ===== */
reindex();
buildCategoryChips();
renderMonths();
