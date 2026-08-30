import type { CatalogCourse } from './types';

/**
 * Fall 2026 course catalog — STARTER LIST.
 *
 * This is a small hand-written seed so the autocomplete is useful out of the
 * box. It is not a registrar export and is not authoritative: codes, titles
 * and credit counts should be replaced with the real catalog before anyone
 * relies on them.
 *
 * Replacing it for a future term:
 *   1. Add `lib/catalog/<term>.ts` exporting a CatalogCourse[] in this shape.
 *   2. Point `ACTIVE_CATALOG` in `lib/catalog/index.ts` at it.
 * Nothing else needs to change — the search, the picker and the course card
 * all read through that one binding.
 *
 * `sections` is intentionally empty here: inventing instructor names and
 * meeting times would be worse than having none, and the picker already
 * falls back to a free-text "Section (optional)" box when a course has no
 * section data. Populate `sections` from the real catalog and the picker
 * switches itself to a select automatically.
 */
export const FALL_2026: CatalogCourse[] = [
  // ── Computer Science ──────────────────────────────────────────────
  { code: 'CS 100', title: 'Computational Problem Solving', credits: 3, department: 'Computer Science' },
  { code: 'CS 200', title: 'Introduction to Programming', credits: 4, department: 'Computer Science' },
  { code: 'CS 202', title: 'Data Structures', credits: 4, department: 'Computer Science' },
  { code: 'CS 210', title: 'Discrete Mathematics', credits: 3, department: 'Computer Science' },
  { code: 'CS 220', title: 'Computer Organisation and Assembly Language', credits: 4, department: 'Computer Science' },
  { code: 'CS 300', title: 'Advanced Programming', credits: 3, department: 'Computer Science' },
  { code: 'CS 310', title: 'Algorithms', credits: 3, department: 'Computer Science' },
  { code: 'CS 315', title: 'Automata Theory', credits: 3, department: 'Computer Science' },
  { code: 'CS 330', title: 'Operating Systems', credits: 4, department: 'Computer Science' },
  { code: 'CS 340', title: 'Database Systems', credits: 3, department: 'Computer Science' },
  { code: 'CS 370', title: 'Artificial Intelligence', credits: 3, department: 'Computer Science' },
  { code: 'CS 382', title: 'Computer Networks', credits: 3, department: 'Computer Science' },
  { code: 'CS 431', title: 'Machine Learning', credits: 3, department: 'Computer Science' },

  // ── Mathematics ───────────────────────────────────────────────────
  { code: 'MATH 100', title: 'Calculus I', credits: 3, department: 'Mathematics' },
  { code: 'MATH 101', title: 'Calculus II', credits: 3, department: 'Mathematics' },
  { code: 'MATH 120', title: 'Linear Algebra', credits: 3, department: 'Mathematics' },
  { code: 'MATH 200', title: 'Multivariable Calculus', credits: 3, department: 'Mathematics' },
  { code: 'MATH 210', title: 'Ordinary Differential Equations', credits: 3, department: 'Mathematics' },
  { code: 'MATH 230', title: 'Probability and Statistics', credits: 3, department: 'Mathematics' },
  { code: 'MATH 310', title: 'Real Analysis', credits: 3, department: 'Mathematics' },

  // ── Economics ─────────────────────────────────────────────────────
  { code: 'ECON 100', title: 'Principles of Microeconomics', credits: 3, department: 'Economics' },
  { code: 'ECON 121', title: 'Introduction to Macroeconomics', credits: 3, department: 'Economics' },
  { code: 'ECON 200', title: 'Intermediate Microeconomics', credits: 3, department: 'Economics' },
  { code: 'ECON 220', title: 'Intermediate Macroeconomics', credits: 3, department: 'Economics' },
  { code: 'ECON 300', title: 'Econometrics', credits: 3, department: 'Economics' },
  { code: 'ECON 330', title: 'Development Economics', credits: 3, department: 'Economics' },
  { code: 'ECON 343', title: 'Agriculture and Food Policy', credits: 3, department: 'Economics' },

  // ── Political Science ─────────────────────────────────────────────
  { code: 'POL 100', title: 'Introduction to Political Science', credits: 3, department: 'Political Science' },
  { code: 'POL 203', title: 'Political Theory', credits: 3, department: 'Political Science' },
  { code: 'POL 227', title: 'Comparative Politics', credits: 3, department: 'Political Science' },
  { code: 'POL 240', title: 'International Relations', credits: 3, department: 'Political Science' },
  { code: 'POL 310', title: 'Public Policy', credits: 3, department: 'Political Science' },

  // ── Social Sciences & Humanities ──────────────────────────────────
  { code: 'SS 100', title: 'Writing and Communication', credits: 3, department: 'Social Sciences' },
  { code: 'SS 101', title: 'Introduction to Social Sciences', credits: 3, department: 'Social Sciences' },
  { code: 'HIST 121', title: 'History of Pakistan', credits: 3, department: 'History' },
  { code: 'HIST 210', title: 'Modern World History', credits: 3, department: 'History' },
  { code: 'PSYC 101', title: 'Introduction to Psychology', credits: 3, department: 'Psychology' },
  { code: 'PSYC 210', title: 'Cognitive Psychology', credits: 3, department: 'Psychology' },
  { code: 'PHIL 150', title: 'Ethics and Society', credits: 3, department: 'Philosophy' },
  { code: 'ENG 110', title: 'Academic Writing', credits: 3, department: 'English' },

  // ── Management & Accounting ───────────────────────────────────────
  { code: 'ACCT 100', title: 'Principles of Financial Accounting', credits: 3, department: 'Accounting' },
  { code: 'ACCT 200', title: 'Managerial Accounting', credits: 3, department: 'Accounting' },
  { code: 'FINN 100', title: 'Principles of Finance', credits: 3, department: 'Finance' },
  { code: 'FINN 310', title: 'Corporate Finance', credits: 3, department: 'Finance' },
  { code: 'MGMT 101', title: 'Principles of Management', credits: 3, department: 'Management' },
  { code: 'MKTG 201', title: 'Principles of Marketing', credits: 3, department: 'Marketing' },
  { code: 'OPER 210', title: 'Operations Management', credits: 3, department: 'Operations' },

  // ── Sciences & Engineering ────────────────────────────────────────
  { code: 'PHY 100', title: 'Mechanics', credits: 3, department: 'Physics' },
  { code: 'PHY 200', title: 'Electricity and Magnetism', credits: 3, department: 'Physics' },
  { code: 'BIO 101', title: 'Introduction to Biology', credits: 3, department: 'Biology' },
  { code: 'CHEM 101', title: 'General Chemistry', credits: 3, department: 'Chemistry' },
  { code: 'EE 200', title: 'Circuit Analysis', credits: 4, department: 'Electrical Engineering' },
  { code: 'EE 240', title: 'Signals and Systems', credits: 3, department: 'Electrical Engineering' },
];
