import { setIcon } from 'obsidian';

export interface CalendarPickerOptions {
  currentDate: string | null; // ISO YYYY-MM-DD
  todayDate: string;        // ISO YYYY-MM-DD
  onSelect: (date: string | null) => Promise<void> | void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function showCalendarPicker(anchor: HTMLElement, options: CalendarPickerOptions): void {
  // Existing open popovers check
  document.querySelectorAll('.gtd-calendar-popover').forEach((el) => el.remove());

  // Determine initial view year and month
  let viewYear: number;
  let viewMonth: number; // 0-indexed

  if (options.currentDate && /^\d{4}-\d{2}-\d{2}$/.test(options.currentDate)) {
    const parts = options.currentDate.split('-').map(Number);
    viewYear = parts[0];
    viewMonth = parts[1] - 1;
  } else {
    const parts = options.todayDate.split('-').map(Number);
    viewYear = parts[0];
    viewMonth = parts[1] - 1;
  }

  const popover = document.createElement('div');
  popover.className = 'gtd-calendar-popover';

  function renderGrid(): void {
    popover.empty();

    // 1. Header: < Month Year >
    const headerEl = popover.createDiv({ cls: 'gtd-cal-header' });

    const prevBtn = headerEl.createEl('button', {
      cls: 'gtd-cal-nav-btn',
      attr: { 'aria-label': 'Previous month' }
    });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderGrid();
    });

    const titleEl = headerEl.createSpan({
      cls: 'gtd-cal-title',
      text: `${MONTH_NAMES[viewMonth]} ${viewYear}`
    });

    const nextBtn = headerEl.createEl('button', {
      cls: 'gtd-cal-nav-btn',
      attr: { 'aria-label': 'Next month' }
    });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderGrid();
    });

    // 2. Weekday row (Mo to Su)
    const weekHeaderEl = popover.createDiv({ cls: 'gtd-cal-weekdays' });
    for (const wd of WEEKDAY_NAMES) {
      weekHeaderEl.createSpan({ cls: 'gtd-cal-weekday', text: wd });
    }

    // 3. Days Grid
    const daysGridEl = popover.createDiv({ cls: 'gtd-cal-days' });

    // Days in current month
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // First day of current month (0=Sun, 1=Mon, ..., 6=Sat)
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // Convert to Monday start (0=Mon, 6=Sun)
    const leadBlanks = (firstDayIndex + 6) % 7;

    // Previous month filler days
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = leadBlanks - 1; i >= 0; i--) {
      const prevDay = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const iso = formatIso(prevY, prevM, prevDay);
      createDayCell(daysGridEl, prevDay, iso, true);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = formatIso(viewYear, viewMonth, day);
      createDayCell(daysGridEl, day, iso, false);
    }

    // Next month filler days (fill up to 35 or 42 cells)
    const totalCellsSoFar = leadBlanks + daysInMonth;
    const trailBlanks = totalCellsSoFar <= 35 ? 35 - totalCellsSoFar : 42 - totalCellsSoFar;
    for (let day = 1; day <= trailBlanks; day++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const iso = formatIso(nextY, nextM, day);
      createDayCell(daysGridEl, day, iso, true);
    }

    // 4. Footer with Clear button
    const footerEl = popover.createDiv({ cls: 'gtd-cal-footer' });
    const clearBtn = footerEl.createEl('button', {
      cls: 'gtd-cal-clear-btn',
      text: 'Clear date'
    });
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      cleanup();
      await options.onSelect(null);
    });
  }

  function createDayCell(container: HTMLElement, dayNum: number, iso: string, isOtherMonth: boolean): void {
    const isToday = iso === options.todayDate;
    const isSelected = iso === options.currentDate;

    const cell = container.createEl('button', {
      cls: `gtd-cal-day ${isOtherMonth ? 'is-other-month' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`,
      text: String(dayNum),
      attr: { 'data-iso': iso }
    });

    cell.addEventListener('click', async (e) => {
      e.stopPropagation();
      cleanup();
      // If clicking already selected date, toggle/clear it off
      if (isSelected) {
        await options.onSelect(null);
      } else {
        await options.onSelect(iso);
      }
    });
  }

  // Positioning logic
  document.body.appendChild(popover);
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 240;
  
  // Position right below anchor
  let top = rect.bottom + window.scrollY + 4;
  let left = rect.left + window.scrollX;

  // Boundary check right edge
  if (left + popoverWidth > window.innerWidth - 10) {
    left = Math.max(10, window.innerWidth - popoverWidth - 10);
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  renderGrid();

  function onDocPointerDown(e: MouseEvent | PointerEvent): void {
    const target = e.target as Node;
    if (!popover.contains(target) && !anchor.contains(target)) {
      cleanup();
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cleanup();
    }
  }

  function cleanup(): void {
    popover.remove();
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  document.addEventListener('keydown', onKeyDown, true);
  // Add pointerdown listener on next tick so the opening click on anchor doesn't trigger cleanup
  setTimeout(() => {
    document.addEventListener('pointerdown', onDocPointerDown, true);
  }, 0);
}
