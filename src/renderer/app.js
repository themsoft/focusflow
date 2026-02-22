/* ========================================================================
   FocusFlow — Application Logic
   Pomodoro Timer + Task Manager
   ======================================================================== */

(function () {
  'use strict';

  // ── Storage helpers ──────────────────────────────────────────────────
  const Store = {
    _prefix: 'focusflow_',

    async get(key, fallback) {
      try {
        if (window.electronAPI && window.electronAPI.store) {
          const val = await window.electronAPI.store.get(key);
          return val !== undefined && val !== null ? val : fallback;
        }
      } catch { /* fall through */ }
      const raw = localStorage.getItem(this._prefix + key);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return raw; }
    },

    async set(key, value) {
      try {
        if (window.electronAPI && window.electronAPI.store) {
          await window.electronAPI.store.set(key, value);
          return;
        }
      } catch { /* fall through */ }
      localStorage.setItem(this._prefix + key, JSON.stringify(value));
    },

    async clear() {
      try {
        if (window.electronAPI && window.electronAPI.store) {
          const keys = ['settings', 'tasks', 'stats', 'streak', 'activeTaskId'];
          for (const k of keys) {
            await window.electronAPI.store.delete(k);
          }
          return;
        }
      } catch { /* fall through */ }
      Object.keys(localStorage)
        .filter(k => k.startsWith(this._prefix))
        .forEach(k => localStorage.removeItem(k));
    }
  };

  // ── Default settings ─────────────────────────────────────────────────
  const DEFAULTS = {
    settings: {
      work: 25,
      shortBreak: 5,
      longBreak: 15,
      sessionsBeforeLong: 4,
      theme: 'dark',
      notifications: true,
      sound: true,
      autoStartBreaks: true,
      autoStartPomodoros: false
    },
    tasks: [],
    stats: {},
    streak: { count: 0, lastDate: null }
  };

  // ── App State ─────────────────────────────────────────────────────────
  const state = {
    settings: { ...DEFAULTS.settings },
    tasks: [],
    stats: {},
    streak: { ...DEFAULTS.streak },

    // Timer state
    timerMode: 'work', // 'work' | 'shortBreak' | 'longBreak'
    timerRunning: false,
    timerPaused: false,
    timeRemaining: 25 * 60, // seconds
    totalTime: 25 * 60,
    currentSession: 1,
    timerInterval: null,
    activeTaskId: null,

    // UI state
    currentView: 'timer',
    pomodoroInput: 1,
    completedOpen: false
  };

  // ── DOM References ────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Timer
    timerTime: $('#timer-time'),
    timerLabel: $('#timer-label'),
    timerProgress: $('.timer-progress'),
    timerDot: $('.timer-dot'),
    timerCircleContainer: $('.timer-circle-container'),
    timerPanel: $('.timer-panel'),
    btnStart: $('#btn-start'),
    btnReset: $('#btn-reset'),
    btnSkip: $('#btn-skip'),
    iconPlay: $('.icon-play'),
    iconPause: $('.icon-pause'),
    sessionPills: $$('.session-pill'),
    sessionDots: $$('.session-dot'),
    sessionNum: $('#session-num'),
    sessionTotal: $('#session-total'),
    sessionCounter: $('#session-counter'),
    activeTaskName: $('#active-task-name'),
    activeTaskDisplay: $('#active-task-display'),

    // Tasks
    taskList: $('#task-list'),
    taskListEmpty: $('#task-list-empty'),
    addTaskForm: $('#add-task-form'),
    addTaskInput: $('#add-task-input'),
    pomoCount: $('#pomo-count'),
    pomoDecrease: $('#pomo-decrease'),
    pomoIncrease: $('#pomo-increase'),
    tasksCount: $('#tasks-count'),
    completedSection: $('#completed-section'),
    completedToggle: $('#completed-toggle'),
    completedList: $('#completed-list'),
    completedCount: $('#completed-count'),

    // Stats
    kpiFocusTime: $('#kpi-focus-time'),
    kpiSessions: $('#kpi-sessions'),
    kpiTasksDone: $('#kpi-tasks-done'),
    kpiStreak: $('#kpi-streak'),

    // Settings
    settingWork: $('#setting-work'),
    settingShortBreak: $('#setting-short-break'),
    settingLongBreak: $('#setting-long-break'),
    settingSessions: $('#setting-sessions'),
    settingNotifications: $('#setting-notifications'),
    settingSound: $('#setting-sound'),
    settingAutoStartBreaks: $('#setting-auto-start-breaks'),
    settingAutoStartPomodoros: $('#setting-auto-start-pomodoros'),
    btnResetData: $('#btn-reset-data'),

    // Nav
    navTabs: $$('.nav-tab'),
    views: $$('.view'),

    // Title bar
    btnMinimize: $('#btn-minimize'),
    btnMaximize: $('#btn-maximize'),
    btnClose: $('#btn-close')
  };

  // SVG constants for timer circle
  const CIRCLE_RADIUS = 115;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~722.57

  // ── Safe DOM helpers ──────────────────────────────────────────────────
  function createEl(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'className') el.className = v;
        else if (k === 'textContent') el.textContent = v;
        else if (k.startsWith('data-')) el.setAttribute(k, v);
        else if (k === 'ariaLabel') el.setAttribute('aria-label', v);
        else el.setAttribute(k, v);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(child => {
        if (typeof child === 'string') el.appendChild(document.createTextNode(child));
        else if (child) el.appendChild(child);
      });
    }
    return el;
  }

  function createSvgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    }
    return el;
  }

  function createCheckSvg() {
    const svg = createSvgEl('svg', { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const polyline = createSvgEl('polyline', { points: '20 6 9 17 4 12' });
    svg.appendChild(polyline);
    return svg;
  }

  function createClockSvg() {
    const svg = createSvgEl('svg', { viewBox: '0 0 24 24', width: '12', height: '12', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' });
    svg.appendChild(createSvgEl('circle', { cx: '12', cy: '12', r: '10' }));
    svg.appendChild(createSvgEl('polyline', { points: '12 6 12 12 16 14' }));
    return svg;
  }

  function createDeleteSvg() {
    const svg = createSvgEl('svg', { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' });
    svg.appendChild(createSvgEl('line', { x1: '18', y1: '6', x2: '6', y2: '18' }));
    svg.appendChild(createSvgEl('line', { x1: '6', y1: '6', x2: '18', y2: '18' }));
    return svg;
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ── Initialization ────────────────────────────────────────────────────
  async function init() {
    await loadState();
    applyTheme(state.settings.theme);
    updateSettingsUI();
    renderTasks();
    updateTimerDisplay();
    updateSessionUI();
    updateStatsUI();
    updateSessionDots();
    bindEvents();
    requestNotificationPermission();
  }

  async function loadState() {
    state.settings = { ...DEFAULTS.settings, ...await Store.get('settings', {}) };
    state.tasks = await Store.get('tasks', []);
    state.stats = await Store.get('stats', {});
    state.streak = await Store.get('streak', { ...DEFAULTS.streak });
    state.activeTaskId = await Store.get('activeTaskId', null);

    state.timeRemaining = state.settings.work * 60;
    state.totalTime = state.settings.work * 60;
    state.currentSession = 1;
  }

  async function saveSettings() {
    await Store.set('settings', state.settings);
  }

  async function saveTasks() {
    await Store.set('tasks', state.tasks);
    await Store.set('activeTaskId', state.activeTaskId);
  }

  async function saveStats() {
    await Store.set('stats', state.stats);
    await Store.set('streak', state.streak);
  }

  // ── Theme ─────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    state.settings.theme = theme;

    $$('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeVal === theme);
    });
  }

  // ── Notification permission ───────────────────────────────────────────
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ── Sound (Web Audio API) ─────────────────────────────────────────────
  function playBellSound() {
    if (!state.settings.sound) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Create a gentle bell-like sound
      const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5

      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.8);
      });

      // Clean up context after sound finishes
      setTimeout(() => ctx.close(), 2000);
    } catch {
      // Silently ignore audio errors
    }
  }

  // ── Desktop Notifications ─────────────────────────────────────────────
  function showNotification(title, body) {
    if (!state.settings.notifications) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: undefined });
    }
  }

  // ── Timer Logic ───────────────────────────────────────────────────────
  function startTimer() {
    if (state.timerRunning && !state.timerPaused) return;

    if (state.timerPaused) {
      state.timerPaused = false;
    } else {
      state.timerRunning = true;
    }

    dom.iconPlay.classList.add('hidden');
    dom.iconPause.classList.remove('hidden');
    dom.timerPanel.classList.add('timer-running');
    updateTimerLabel();

    state.timerInterval = setInterval(() => {
      state.timeRemaining--;

      if (state.timeRemaining <= 0) {
        timerComplete();
        return;
      }

      updateTimerDisplay();
    }, 1000);
  }

  function pauseTimer() {
    if (!state.timerRunning || state.timerPaused) return;

    state.timerPaused = true;
    clearInterval(state.timerInterval);

    dom.iconPlay.classList.remove('hidden');
    dom.iconPause.classList.add('hidden');
    dom.timerPanel.classList.remove('timer-running');
    dom.timerLabel.textContent = 'Paused';
  }

  function resetTimer() {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    state.timerPaused = false;

    const duration = getModeDuration(state.timerMode);
    state.timeRemaining = duration * 60;
    state.totalTime = duration * 60;

    dom.iconPlay.classList.remove('hidden');
    dom.iconPause.classList.add('hidden');
    dom.timerPanel.classList.remove('timer-running');
    dom.timerLabel.textContent = 'Ready to focus';

    updateTimerDisplay();
  }

  function skipSession() {
    timerComplete();
  }

  function timerComplete() {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    state.timerPaused = false;

    dom.iconPlay.classList.remove('hidden');
    dom.iconPause.classList.add('hidden');
    dom.timerPanel.classList.remove('timer-running');

    playBellSound();

    if (state.timerMode === 'work') {
      // Record the completed work session
      recordWorkSession();

      if (state.currentSession >= state.settings.sessionsBeforeLong) {
        // Long break after completing all sessions
        showNotification('Long break time!', 'Great work! You completed ' + state.settings.sessionsBeforeLong + ' sessions. Take a longer break.');
        setTimerMode('longBreak');
        state.currentSession = 0; // Will reset to 1 after long break
      } else {
        showNotification('Break time!', 'Good job! Take a short break.');
        setTimerMode('shortBreak');
      }

      if (state.settings.autoStartBreaks) {
        setTimeout(() => startTimer(), 500);
      }
    } else {
      // Break finished
      if (state.timerMode === 'longBreak') {
        state.currentSession = 1;
      } else {
        state.currentSession++;
      }
      showNotification('Break is over!', 'Time to focus again.');
      setTimerMode('work');
      updateSessionDots();

      if (state.settings.autoStartPomodoros) {
        setTimeout(() => startTimer(), 500);
      }
    }

    updateTimerDisplay();
    updateSessionUI();
    updateStatsUI();
  }

  function setTimerMode(mode) {
    state.timerMode = mode;
    const duration = getModeDuration(mode);
    state.timeRemaining = duration * 60;
    state.totalTime = duration * 60;

    // Update session type class on timer panel
    dom.timerPanel.classList.remove('session-work', 'session-shortBreak', 'session-longBreak');
    dom.timerPanel.classList.add('session-' + mode);

    // Update pills
    dom.sessionPills.forEach(pill => {
      pill.classList.toggle('active', pill.dataset.session === mode);
    });

    updateTimerLabel();
    updateTimerDisplay();
  }

  function getModeDuration(mode) {
    switch (mode) {
      case 'work': return state.settings.work;
      case 'shortBreak': return state.settings.shortBreak;
      case 'longBreak': return state.settings.longBreak;
      default: return state.settings.work;
    }
  }

  function updateTimerLabel() {
    if (state.timerPaused) {
      dom.timerLabel.textContent = 'Paused';
      return;
    }
    if (!state.timerRunning) {
      dom.timerLabel.textContent = 'Ready to focus';
      return;
    }
    switch (state.timerMode) {
      case 'work': dom.timerLabel.textContent = 'Focusing'; break;
      case 'shortBreak': dom.timerLabel.textContent = 'Short break'; break;
      case 'longBreak': dom.timerLabel.textContent = 'Long break'; break;
    }
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(state.timeRemaining / 60);
    const seconds = state.timeRemaining % 60;
    dom.timerTime.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');

    // Update progress ring
    const progress = 1 - (state.timeRemaining / state.totalTime);
    const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
    dom.timerProgress.style.strokeDasharray = CIRCLE_CIRCUMFERENCE;
    dom.timerProgress.style.strokeDashoffset = offset;

    // Update dot position
    const angle = progress * 360;
    dom.timerDot.setAttribute('transform', 'rotate(' + angle + ' 130 130)');

    // Update document title
    document.title = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') + ' \u2014 FocusFlow';
  }

  function updateSessionUI() {
    dom.sessionNum.textContent = state.currentSession;
    dom.sessionTotal.textContent = state.settings.sessionsBeforeLong;
    updateSessionDots();
  }

  function updateSessionDots() {
    // Regenerate session dots using safe DOM methods
    const dotsContainer = $('.session-dots');
    clearChildren(dotsContainer);

    for (let i = 1; i <= state.settings.sessionsBeforeLong; i++) {
      const dot = document.createElement('span');
      dot.className = 'session-dot';
      if (i < state.currentSession) dot.classList.add('completed');
      if (i === state.currentSession) dot.classList.add('active');
      dotsContainer.appendChild(dot);
    }
  }

  // ── Stats tracking ────────────────────────────────────────────────────
  function todayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function getTodayStats() {
    const key = todayKey();
    if (!state.stats[key]) {
      state.stats[key] = { focusMinutes: 0, sessions: 0, tasksCompleted: 0 };
    }
    return state.stats[key];
  }

  function recordWorkSession() {
    const today = getTodayStats();
    today.focusMinutes += state.settings.work;
    today.sessions++;

    // Update active task pomodoro count
    if (state.activeTaskId) {
      const task = state.tasks.find(t => t.id === state.activeTaskId);
      if (task) {
        task.completedPomodoros = (task.completedPomodoros || 0) + 1;
      }
    }

    // Update streak
    updateStreak();

    saveStats();
    saveTasks();
  }

  function updateStreak() {
    const today = todayKey();
    if (state.streak.lastDate === today) return; // Already counted today

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (state.streak.lastDate === yesterdayStr) {
      state.streak.count++;
    } else if (state.streak.lastDate !== today) {
      state.streak.count = 1;
    }
    state.streak.lastDate = today;
  }

  function updateStatsUI() {
    const today = getTodayStats();
    const hours = Math.floor(today.focusMinutes / 60);
    const mins = today.focusMinutes % 60;

    dom.kpiFocusTime.textContent = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';
    dom.kpiSessions.textContent = today.sessions;
    dom.kpiTasksDone.textContent = today.tasksCompleted;
    dom.kpiStreak.textContent = state.streak.count + ' day' + (state.streak.count !== 1 ? 's' : '');

    updateWeeklyChart();
  }

  function updateWeeklyChart() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Get this week's data (Mon-Sun)
    const weekData = [];
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + mondayOffset + i);
      const key = d.toISOString().split('T')[0];
      const dayStats = state.stats[key] || { focusMinutes: 0 };
      weekData.push({
        day: days[d.getDay()],
        minutes: dayStats.focusMinutes
      });
    }

    const maxMinutes = Math.max.apply(null, weekData.map(d => d.minutes).concat([1]));
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    dayLabels.forEach((dayLabel, i) => {
      const data = weekData[i];
      const fill = document.querySelector('.chart-bar-fill[data-day="' + dayLabel + '"]');
      const value = document.querySelector('.chart-bar-value[data-day="' + dayLabel + '"]');

      if (fill) {
        const pct = (data.minutes / maxMinutes) * 100;
        fill.style.height = data.minutes > 0 ? Math.max(pct, 4) + '%' : '0%';
      }
      if (value) {
        const h = Math.floor(data.minutes / 60);
        const m = data.minutes % 60;
        value.textContent = h > 0 ? h + 'h' + (m > 0 ? m + 'm' : '') : m + 'm';
      }
    });
  }

  // ── Task Management ───────────────────────────────────────────────────
  function addTask(name, estimatedPomodoros) {
    const task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      estimatedPomodoros: estimatedPomodoros,
      completedPomodoros: 0,
      completed: false,
      createdAt: new Date().toISOString()
    };

    state.tasks.unshift(task);

    // If no active task, set this as active
    if (!state.activeTaskId) {
      state.activeTaskId = task.id;
    }

    saveTasks();
    renderTasks();
  }

  function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    task.completed = !task.completed;

    if (task.completed) {
      task.completedAt = new Date().toISOString();
      const today = getTodayStats();
      today.tasksCompleted++;
      saveStats();

      // If this was the active task, clear it
      if (state.activeTaskId === id) {
        const nextTask = state.tasks.find(t => !t.completed && t.id !== id);
        state.activeTaskId = nextTask ? nextTask.id : null;
      }
    } else {
      // Un-completing a task
      delete task.completedAt;
      const today = getTodayStats();
      today.tasksCompleted = Math.max(0, today.tasksCompleted - 1);
      saveStats();
    }

    saveTasks();
    renderTasks();
    updateStatsUI();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);

    if (state.activeTaskId === id) {
      const nextTask = state.tasks.find(t => !t.completed);
      state.activeTaskId = nextTask ? nextTask.id : null;
    }

    saveTasks();
    renderTasks();
  }

  function setActiveTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.completed) return;

    state.activeTaskId = id;
    saveTasks();
    renderTasks();
  }

  // Build a single task list item using safe DOM methods
  function buildTaskElement(task, isCompleted) {
    const isActive = task.id === state.activeTaskId && !isCompleted;

    const li = createEl('li', {
      className: 'task-item' + (isCompleted ? ' completed' : '') + (isActive ? ' active-task' : ''),
      'data-id': task.id
    });

    // Checkbox
    const checkbox = createEl('div', {
      className: 'task-checkbox',
      'data-action': 'toggle',
      'data-id': task.id
    });
    checkbox.appendChild(createCheckSvg());
    li.appendChild(checkbox);

    // Content
    const content = createEl('div', {
      className: 'task-content',
      'data-action': 'activate',
      'data-id': task.id
    });

    const nameSpan = createEl('span', { className: 'task-name', textContent: task.name });
    content.appendChild(nameSpan);

    const meta = createEl('div', { className: 'task-meta' });
    const pomoSpan = createEl('span', { className: 'task-pomodoros' });
    pomoSpan.appendChild(createClockSvg());
    pomoSpan.appendChild(document.createTextNode(' ' + (task.completedPomodoros || 0) + '/' + task.estimatedPomodoros));
    meta.appendChild(pomoSpan);
    content.appendChild(meta);

    li.appendChild(content);

    // Delete button
    const deleteBtn = createEl('button', {
      className: 'task-delete',
      'data-action': 'delete',
      'data-id': task.id,
      ariaLabel: 'Delete task'
    });
    deleteBtn.appendChild(createDeleteSvg());
    li.appendChild(deleteBtn);

    return li;
  }

  function renderTasks() {
    const activeTasks = state.tasks.filter(t => !t.completed);
    const completedTasks = state.tasks.filter(t => t.completed);

    // Update task count
    dom.tasksCount.textContent = activeTasks.length + ' task' + (activeTasks.length !== 1 ? 's' : '');

    // Show/hide empty state
    if (activeTasks.length === 0) {
      dom.taskListEmpty.classList.remove('hidden');
    } else {
      dom.taskListEmpty.classList.add('hidden');
    }

    // Render active tasks using safe DOM methods
    clearChildren(dom.taskList);
    activeTasks.forEach(task => {
      dom.taskList.appendChild(buildTaskElement(task, false));
    });

    // Render completed tasks
    if (completedTasks.length > 0) {
      dom.completedSection.classList.remove('hidden');
      dom.completedCount.textContent = completedTasks.length;
      clearChildren(dom.completedList);
      completedTasks.forEach(task => {
        dom.completedList.appendChild(buildTaskElement(task, true));
      });
    } else {
      dom.completedSection.classList.add('hidden');
    }

    // Update active task display
    updateActiveTaskDisplay();
  }

  function updateActiveTaskDisplay() {
    if (state.activeTaskId) {
      const task = state.tasks.find(t => t.id === state.activeTaskId);
      if (task && !task.completed) {
        dom.activeTaskName.textContent = task.name;
        dom.activeTaskDisplay.style.display = '';
        return;
      }
    }
    dom.activeTaskName.textContent = 'No task selected';
  }

  // ── Settings ──────────────────────────────────────────────────────────
  function updateSettingsUI() {
    dom.settingWork.value = state.settings.work;
    dom.settingShortBreak.value = state.settings.shortBreak;
    dom.settingLongBreak.value = state.settings.longBreak;
    dom.settingSessions.value = state.settings.sessionsBeforeLong;
    dom.settingNotifications.checked = state.settings.notifications;
    dom.settingSound.checked = state.settings.sound;
    dom.settingAutoStartBreaks.checked = state.settings.autoStartBreaks;
    dom.settingAutoStartPomodoros.checked = state.settings.autoStartPomodoros;

    $$('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeVal === state.settings.theme);
    });
  }

  function handleSettingChange(key, value) {
    if (['work', 'shortBreak', 'longBreak', 'sessionsBeforeLong'].indexOf(key) !== -1) {
      value = parseInt(value, 10);
      if (isNaN(value) || value < 1) return;

      var limits = {
        work: [1, 90],
        shortBreak: [1, 30],
        longBreak: [1, 60],
        sessionsBeforeLong: [2, 8]
      };
      var range = limits[key];
      value = Math.max(range[0], Math.min(range[1], value));
    }

    state.settings[key] = value;
    saveSettings();

    // If timer is not running, update the display with new duration
    if (!state.timerRunning && !state.timerPaused) {
      var duration = getModeDuration(state.timerMode);
      state.timeRemaining = duration * 60;
      state.totalTime = duration * 60;
      updateTimerDisplay();
    }

    if (key === 'sessionsBeforeLong') {
      updateSessionDots();
      updateSessionUI();
    }

    updateSettingsUI();
  }

  // ── Navigation ────────────────────────────────────────────────────────
  function switchView(viewName) {
    state.currentView = viewName;

    dom.navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    dom.views.forEach(view => {
      view.classList.toggle('active', view.id === 'view-' + viewName);
    });

    if (viewName === 'stats') {
      updateStatsUI();
    }
  }

  // ── Event Bindings ────────────────────────────────────────────────────
  function bindEvents() {
    // Title bar
    dom.btnMinimize.addEventListener('click', function() {
      if (window.electronAPI && window.electronAPI.window) window.electronAPI.window.minimize();
    });
    dom.btnMaximize.addEventListener('click', function() {
      if (window.electronAPI && window.electronAPI.window) window.electronAPI.window.maximize();
    });
    dom.btnClose.addEventListener('click', function() {
      if (window.electronAPI && window.electronAPI.window) window.electronAPI.window.close();
    });

    // Navigation
    dom.navTabs.forEach(function(tab) {
      tab.addEventListener('click', function() { switchView(tab.dataset.view); });
    });

    // Timer controls
    dom.btnStart.addEventListener('click', function() {
      if (state.timerRunning && !state.timerPaused) {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    dom.btnReset.addEventListener('click', resetTimer);
    dom.btnSkip.addEventListener('click', skipSession);

    // Session pills
    dom.sessionPills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        if (state.timerRunning) return; // Don't switch while running
        setTimerMode(pill.dataset.session);
      });
    });

    // Add task form
    dom.addTaskForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = dom.addTaskInput.value.trim();
      if (!name) return;
      addTask(name, state.pomodoroInput);
      dom.addTaskInput.value = '';
      state.pomodoroInput = 1;
      dom.pomoCount.textContent = 1;
    });

    // Pomodoro counter
    dom.pomoDecrease.addEventListener('click', function() {
      state.pomodoroInput = Math.max(1, state.pomodoroInput - 1);
      dom.pomoCount.textContent = state.pomodoroInput;
    });
    dom.pomoIncrease.addEventListener('click', function() {
      state.pomodoroInput = Math.min(10, state.pomodoroInput + 1);
      dom.pomoCount.textContent = state.pomodoroInput;
    });

    // Task list delegation
    dom.taskList.addEventListener('click', handleTaskClick);
    dom.completedList.addEventListener('click', handleTaskClick);

    // Completed toggle
    dom.completedToggle.addEventListener('click', function() {
      state.completedOpen = !state.completedOpen;
      dom.completedToggle.setAttribute('aria-expanded', state.completedOpen);
      dom.completedList.classList.toggle('open', state.completedOpen);
    });

    // Settings — steppers
    $$('.stepper-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var setting = btn.dataset.setting;
        var dir = parseInt(btn.dataset.dir, 10);
        var inputMap = {
          work: dom.settingWork,
          shortBreak: dom.settingShortBreak,
          longBreak: dom.settingLongBreak,
          sessionsBeforeLong: dom.settingSessions
        };
        var input = inputMap[setting];
        if (input) {
          handleSettingChange(setting, parseInt(input.value, 10) + dir);
        }
      });
    });

    // Settings — direct input
    [
      [dom.settingWork, 'work'],
      [dom.settingShortBreak, 'shortBreak'],
      [dom.settingLongBreak, 'longBreak'],
      [dom.settingSessions, 'sessionsBeforeLong']
    ].forEach(function(pair) {
      pair[0].addEventListener('change', function() { handleSettingChange(pair[1], pair[0].value); });
    });

    // Settings — toggles
    dom.settingNotifications.addEventListener('change', function() {
      handleSettingChange('notifications', dom.settingNotifications.checked);
      if (dom.settingNotifications.checked) requestNotificationPermission();
    });
    dom.settingSound.addEventListener('change', function() {
      handleSettingChange('sound', dom.settingSound.checked);
    });
    dom.settingAutoStartBreaks.addEventListener('change', function() {
      handleSettingChange('autoStartBreaks', dom.settingAutoStartBreaks.checked);
    });
    dom.settingAutoStartPomodoros.addEventListener('change', function() {
      handleSettingChange('autoStartPomodoros', dom.settingAutoStartPomodoros.checked);
    });

    // Theme toggle
    $$('.theme-option').forEach(function(btn) {
      btn.addEventListener('click', function() {
        applyTheme(btn.dataset.themeVal);
        saveSettings();
      });
    });

    // Reset data
    dom.btnResetData.addEventListener('click', async function() {
      if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) return;

      await Store.clear();
      state.settings = { ...DEFAULTS.settings };
      state.tasks = [];
      state.stats = {};
      state.streak = { ...DEFAULTS.streak };
      state.activeTaskId = null;
      state.currentSession = 1;

      resetTimer();
      applyTheme('dark');
      updateSettingsUI();
      renderTasks();
      updateTimerDisplay();
      updateSessionUI();
      updateStatsUI();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Only when not typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (state.timerRunning && !state.timerPaused) {
            pauseTimer();
          } else {
            startTimer();
          }
          break;
        case 'KeyR':
          if (!e.ctrlKey && !e.metaKey) resetTimer();
          break;
        case 'KeyS':
          if (!e.ctrlKey && !e.metaKey) skipSession();
          break;
      }
    });
  }

  function handleTaskClick(e) {
    var actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    var action = actionEl.dataset.action;
    var id = actionEl.dataset.id;

    switch (action) {
      case 'toggle': toggleTask(id); break;
      case 'delete': deleteTask(id); break;
      case 'activate': setActiveTask(id); break;
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  init();
})();
