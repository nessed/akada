// Screenshots of the real app for the landing page, so the front page shows
// the screen it is selling rather than a drawing of one that drifted.
//
// It drives the app on local data with a made-up LUMS term: a few catalog
// courses, a week of deadlines and some study sessions, all dated from
// today, then photographs Today at phone and laptop widths into
// public/landing/.
//
//   echo 'NEXT_PUBLIC_USE_LOCAL_DATA=true' > .env.local
//   npm run dev                                   # in one terminal
//   npm i --no-save playwright && node scripts/landing-shots.mjs
//
// Re-run it whenever Today changes enough that the shots would lie.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.AKADA_URL ?? 'http://localhost:3000';
const OUT = new URL('../public/landing/', import.meta.url).pathname;

function seed() {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const semester = { id: 'demo-term', label: `Fall ${year}`, startDate: `${year}-08-31`, endDate: `${year}-12-18`, createdAt: now, isActive: true };
  const course = (id, code, name, credits, color, tint, goal, position) => ({
    id, semesterId: semester.id, code, name, credits, color, tint, weeklyGoalHours: goal, createdAt: now, position,
  });
  const courses = [
    course('econ', 'ECON 100', 'Principles of Economics', 4, '#A8B89B', '#E6EDE0', 8, 0),
    course('cs', 'CS 100', 'Computational Problem Solving', 3, '#D4A5A5', '#F3E4E4', 6, 1),
    course('ss', 'SS 100', 'Writing and Communication', 4, '#B5A8C9', '#EAE5F1', 8, 2),
  ];
  let n = 0;
  const task = (courseId, title, due, extra = {}) => ({
    id: `t${++n}`, semesterId: semester.id, courseId, title, description: '', subtasks: [], dueDate: due === null ? null : day(due),
    priority: 'normal', completed: false, completedAt: null, createdAt: now, kind: 'task', weight: null, pages: null, ...extra,
  });
  const tasks = [
    task('econ', 'Read Mankiw Ch 4: Supply and Demand', 0, { kind: 'reading', pages: 28 }),
    task('cs', 'Lab 3: loops and lists', 1, { weight: 2 }),
    task('econ', 'Problem Set 2', 2, { weight: 5 }),
    task('ss', 'Essay 1 draft', 4, { weight: 15 }),
    task('econ', 'Quiz 2', 5, { kind: 'exam', weight: 2 }),
    task('cs', 'Read Ch 5: Lists', 3, { kind: 'reading', pages: 20 }),
    task('econ', 'Midterm', 18, { kind: 'exam', weight: 30 }),
    task('econ', 'Read Mankiw Ch 2', -2, { kind: 'reading', pages: 25, completed: true, completedAt: new Date(Date.now() - 2 * 864e5).toISOString() }),
  ];
  const sessions = [];
  const plan = [['econ', 1, 3600], ['cs', 1, 2700], ['ss', 2, 3000], ['econ', 3, 4500], ['cs', 4, 2700], ['econ', 5, 3600], ['ss', 6, 2400], ['econ', 8, 3000], ['cs', 9, 3600]];
  plan.forEach(([courseId, ago, seconds], i) => {
    sessions.push({ id: `s${i}`, semesterId: semester.id, courseId, taskId: null, date: day(-ago), durationSeconds: seconds, note: '', createdAt: new Date(Date.now() - ago * 864e5).toISOString() });
  });
  localStorage.clear();
  const put = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  put('lums.semesters', [semester]);
  put('lums.activeSemesterId', semester.id);
  put('lums.courses', courses);
  put('lums.tasks', tasks);
  put('lums.sessions', sessions);
  put('lums.onboardingComplete', true);
  put('lums.userSettings', { displayName: 'Sara', dailyGoalHours: 4, avatarUrl: '' });
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [name, viewport, mobile] of [
  ['today-phone', { width: 390, height: 780 }, true],
  ['today-desktop', { width: 1280, height: 800 }, false],
]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
  await page.evaluate(seed);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  // The dev server's own badge is not part of the app.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}${name}.png`, type: 'png' });
  await context.close();
}
await browser.close();
console.log(`Wrote ${OUT}today-phone.png and today-desktop.png`);
