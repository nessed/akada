import type { CatalogCourse } from './types';

/**
 * Fall 2026 course catalog - GENERATED, do not edit by hand.
 *
 * Source: Fall Semester 2026 - Course Memo.xlsx (registrar memo, one row per section).
 * Regenerate with:
 *   python scripts/build-catalog.py "Fall Semester 2026 - Course Memo.xlsx" \
 *       --out lib/catalog/fall-2026.ts --export FALL_2026 --term "Fall 2026"
 *
 * Sources: the registrar memo for what exists, and LUMS Pro Planner
 * (https://lumsproplanner.com, by Muhammad Sohaib Shahzad) for when and
 * where each section meets. A section with neither a published slot nor a
 * planner entry carries `cadence` instead - how often it meets and for how
 * long, which is all the memo says about when those ones run.
 *
 * Pointing the app at a different term is a one-line change in
 * `lib/catalog/index.ts` - see ACTIVE_CATALOG there.
 */
export const FALL_2026: CatalogCourse[] = [
  // Accounting
  {
    code: 'ACCT 100', title: 'Principles of Financial Accounting', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Syed Zain ul Abidin', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'A-1, Academic Block' },
      { id: 'S2', instructor: 'Omair Haroon', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'A-16, Academic Block' },
      { id: 'S3', instructor: 'Omair Haroon', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'A-5, Academic Block' },
      { id: 'S4', instructor: 'Zainab Mehmood', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'A-7, Academic Block' },
      { id: 'S5', instructor: 'Zainab Mehmood', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'A-7, Academic Block' },
      { id: 'S6', instructor: 'Zainab Mehmood', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'A-7, Academic Block' },
      { id: 'S7', instructor: 'Saira Rizwan', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'B-1, SDSB' },
      { id: 'S8', instructor: 'Saira Rizwan', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'ACCT 130', title: 'Principles of Management Accounting', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Ayesha Bhatti', meets: 'Mon, 4:00 PM - 5:50 PM', room: 'MCB A-13, Academic Block' },
      { id: 'S2', instructor: 'Mahin Moazzam', meets: 'Tue, 4:00 PM - 5:50 PM', room: 'MCB A-13, Academic Block' },
      { id: 'R1', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 9:00 AM - 9:50 AM', room: 'B-1, SDSB' },
      { id: 'R2', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 10:00 AM - 10:50 AM', room: 'B-1, SDSB' },
      { id: 'R3', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 11:00 AM - 11:50 AM', room: 'B-1, SDSB' },
      { id: 'R4', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 12:00 PM - 12:50 PM', room: 'B-1, SDSB' },
      { id: 'R5', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 9:00 AM - 9:50 AM', room: 'B-2, SDSB' },
      { id: 'R6', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 10:00 AM - 10:50 AM', room: 'B-2, SDSB' },
      { id: 'R7', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 11:00 AM - 11:50 AM', room: 'B-2, SDSB' },
      { id: 'R8', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 12:00 PM - 12:50 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'ACCT 202', title: 'Theory and Concepts of Accounting - Islamic Perspective', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Abdul Rauf', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'A-4, Academic Block' },
    ],
  },
  {
    code: 'ACCT 220', title: 'Corporate Financial Reporting I', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Samia Ahmed Ali', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'A-3, Academic Block' },
      { id: 'S2', instructor: 'Samia Ahmed Ali', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'A-3, Academic Block' },
      { id: 'S3', instructor: 'Samia Ahmed Ali', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'A-3, Academic Block' },
      { id: 'S4', instructor: 'Mohib Abbas Ali', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'B-2, SDSB' },
      { id: 'S5', instructor: 'Muhammad Imran', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: '201, SDSB' },
    ],
  },
  {
    code: 'ACCT 370', title: 'Applied Taxation', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Ayesha Bhatti', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'B-1, SDSB' },
      { id: 'S2', instructor: 'Nafeh Akbar', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: '101, SDSB' },
    ],
  },
  {
    code: 'ACCT 411', title: 'Applied Financial Analysis', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Saira Rizwan', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'ACCT 482', title: 'Governance, Risk and Compliance', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Ali Qamar', meets: 'Mon & Wed, 8:00 AM - 9:15 AM' },
    ],
  },

  // Accounting & Finance
  {
    code: 'ACF 2101', title: 'Introduction to Finance and Accounting', credits: 1.5, department: 'Accounting & Finance',
    sections: [
      { id: 'S1', instructor: 'Omair Haroon', meets: 'Daily, 11:00 AM - 1:10 PM', room: '103, SDSB' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'ACF 5101', title: 'Financial Management and Accounting', credits: 3, department: 'Accounting & Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Mubashir Ali', meets: 'Fri, Sat, Sun, 8:30 AM - 10:30 AM', room: '203, SDSB' },
    ],
  },

  // Artificial Intelligence
  {
    code: 'AI 500', title: 'Foundations of AI', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Sat, 9:00 AM - 12:00 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'AI 501', title: 'Mathematics for AI', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', meets: 'Sun, 9:00 AM - 12:00 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'AI 624', title: 'AI on Edge Devices', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', meets: 'Sun, 2:00 PM - 5:00 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'AI 630', title: 'Responsible AI Engineering', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', meets: 'Sat, 2:00 PM - 5:00 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'AI 631', title: 'Quantum Machine Learning', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', meets: 'Sun, 9:00 AM - 12:00 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'AI 651', title: 'Deep Learning for Time, Space, and Graphs', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', meets: 'Sat, 9:00 AM - 12:00 PM', room: 'B-2, SDSB' },
    ],
  },

  // Anthropology
  {
    code: 'ANTH 100', title: 'Introduction to Cultural Anthropology', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Sadaf Ahmad', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-15, Academic Block' },
      { id: 'S2', instructor: 'Rabia Kamal', meets: 'Mon & Wed, 3:00 PM - 4:50 PM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'ANTH 253', title: 'Women\'s Lives Across Cultures', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Rabia Kamal', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-12, Academic Block' },
    ],
  },
  {
    code: 'ANTH 268', title: 'Introduction to Anthropology of Religion', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Dominic William Esler', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'ANTH 320', title: 'Qualitative Research Methods', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Fizzah Sajjad', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-10, Academic Block' },
    ],
  },
  {
    code: 'ANTH 333', title: 'Ethics of Romantic Love', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Samira Musleh', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: '205, SDSB' },
    ],
  },
  {
    code: 'ANTH 453', title: 'Sex and the State', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Ghazal Asif', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
    ],
  },

  // Astronomy
  {
    code: 'AST 302', title: 'Fundamentals of Astronomy – I', credits: 3, department: 'Astronomy',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Biology
  {
    code: 'BIO 101', title: 'Introductory Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tariq & 2 others', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'BIO 216', title: 'Molecular Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tariq & Muhammad Shoaib', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'BIO 221', title: 'Genetics', credits: 4, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tariq & Khurram Bashir', meets: 'Mon & Wed, 10:30 AM - 12:20 PM', room: 'Mirza Muhammad Abdullah CR1-02' },
    ],
  },
  {
    code: 'BIO 300', title: 'Methods in Cell and Molecular Biology', credits: 4, department: 'Biology',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Tariq & 6 others', meets: 'Mon, Wed, Fri, 9:00 AM - 9:50 AM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'BIO 313', title: 'Cell Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Amir Faisal & Khurram Bashir', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'BIO 331', title: 'Computational Biology II', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Laraib Iqbal Malik', meets: 'Mon & Wed, 1:30 PM - 2:45 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'BIO 401', title: 'Seminars in Biology', credits: 1, department: 'Biology',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Khurram Bashir', meets: 'Wed, 2:30 PM - 3:20 PM', room: 'CR 2-07, SAHSOL' },
    ],
  },
  {
    code: 'BIO 403', title: 'Critical thinking, Scientific Writing and Ethics', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Khurram Bashir & Muhammad Shoaib', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'BIO 500', title: 'Advanced Methods in Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Tariq & 6 others', meets: 'Mon, Wed, Fri, 9:00 AM - 9:50 AM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'BIO 503', title: 'Critical Thinking, Scientific Writing and Ethics', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Khurram Bashir & Muhammad Shoaib', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'BIO 516', title: 'Advanced Molecular and Cell Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Shaper Mirza & Zaigham Shahzad', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-2, Academic Block' },
    ],
  },
  {
    code: 'BIO 524', title: 'Evolution', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Zaigham Shahzad', meets: 'Mon & Wed, 3:00 PM - 4:15 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'BIO 531', title: 'Computational Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Laraib Iqbal Malik', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },
  {
    code: 'BIO 541', title: 'Epidemiology and Methods in Clinical Research', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Shaper Mirza & Muhammad Shoaib', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'A-11, Academic Block' },
    ],
  },

  // Chemical Engineering
  {
    code: 'CHE 210', title: 'Physical Chemistry', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Falak Sher', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'CHE 260', title: 'Principles of Chemical Engineering', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Qandeel Almas', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'CHE 280', title: 'Math Methods in Chemical Engineering I', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Shahid Usman Bin', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'CHE 300A', title: 'Chemical Engineering Lab II', credits: 1, department: 'Chemical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Hafiz Muhammad Afzal', meets: 'Wed, 11:00 AM - 1:50 PM', room: 'CH Teaching Lab-4, SSE' },
    ],
  },
  {
    code: 'CHE 320', title: 'Separation Processes', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Tauqeer Abbas', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'CHE 352', title: 'Heat and Mass Transfer', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Ali Rauf', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'CHE 373', title: 'Advanced Fluid Dynamics', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Qasim Imtiaz', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'CHE 401A', title: 'Chemical Engineering Lab - V', credits: 1, department: 'Chemical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Hafiz Muhammad Afzal & Shahid Usman Bin', meets: 'Fri, 8:00 AM - 10:50 AM', room: 'CH Teaching Lab-4, SSE' },
    ],
  },
  {
    code: 'CHE 401B', title: 'Chemical Engineering Lab - VI', credits: 1, department: 'Chemical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Syed Qamber Ali Zaidi', meets: 'Mon, 2:00 PM - 4:50 PM', room: 'CH Teaching Lab-3, SSE' },
    ],
  },
  {
    code: 'CHE 415', title: 'Renewable Energy: Applications and Economics', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Tauqeer Abbas', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'CHE 422', title: 'Chemical Process Safety', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Faheem Hassan Akhtar', meets: 'Wed & Fri, 3:30 PM - 4:45 PM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'CHE 440', title: 'Chemical Process Design I', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Qandeel Almas', meets: 'Mon, 10:30 AM - 11:20 AM', room: 'A-2, Academic Block' },
      { id: 'L1', component: 'Lab', instructor: 'Qandeel Almas', meets: 'Tue & Thu, 12:30 PM - 3:20 PM', room: 'CH Teaching Lab-4, SSE' },
    ],
  },

  // Chemistry
  {
    code: 'CHEM 101', title: 'Principles of Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Basit Yameen', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'Block 9-B2, SSE' },
      { id: 'S2', instructor: 'Habib-ur- Rehman', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'CHEM 221', title: 'Molecular Symmetry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'CHEM 231', title: 'Fundamentals of Organic Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Irshad Hussain', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'CHEM 314', title: 'Quantum Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Habib-ur- Rehman', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'CHEM 324', title: 'Inorganic Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Fatima Hameed', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'CHEM 332', title: 'Chemistry of the Organic Functional Groups', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Rahman Shah Zaib Saleem', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'CHEM 342', title: 'Analytical Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Falak Sher & Muhammad Saeed', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'CHEM 410', title: 'Physical Chemistry Lab', credits: 2, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Salman Noshear Arshad', meets: 'Fri, 2:00 PM - 2:50 PM', room: 'Block 10-204, SSE' },
      { id: 'L1', component: 'Lab', instructor: 'Salman Noshear Arshad', meets: 'Fri, 3:00 PM - 5:50 PM', room: 'CH Teaching Lab-4, SSE' },
    ],
  },
  {
    code: 'CHEM 430', title: 'Organic Chemistry Lab II', credits: 2, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Muhammad Saeed', meets: 'Fri, 8:00 AM - 8:50 AM', room: 'Block 10-204, SSE' },
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Saeed', meets: 'Fri, 9:00 AM - 11:50 AM', room: 'CH Teaching Lab-3, SSE' },
    ],
  },
  {
    code: 'CHEM 511', title: 'Advanced Physical Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Falak Sher', meets: 'Tue & Thu, 9:00 AM - 10:15 AM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'CHEM 516', title: 'Characterization Techniques for Materials', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Salman Noshear Arshad', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 521', title: 'Advanced Inorganic Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', meets: 'Tue & Thu, 10:30 AM - 11:45 AM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CHEM 531', title: 'Advanced Organic Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Irshad Hussain', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'CHEM 532', title: 'Chemistry of Biomolecules', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Muhammad Saeed', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'CHEM 711', title: 'Selected Topics in Physical Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Falak Sher', meets: 'Tue & Thu, 9:00 AM - 10:15 AM', room: '10-304, SSE' },
    ],
  },
  {
    code: 'CHEM 721', title: 'Selected Topics in Inorganic Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', meets: 'Tue & Thu, 10:30 AM - 11:45 AM', room: '10-201, SSE' },
    ],
  },
  {
    code: 'CHEM 731', title: 'Selected Topics in Organic Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Irshad Hussain', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'A-11, Academic Block' },
    ],
  },

  // Communication & Learning
  {
    code: 'CLCA 1000', title: 'Adab and Literature', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Bilal Tanweer & Fatima Fayyaz', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'CLCA 1222', title: 'Anatomy of a Screenplay', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Rehab Maqsood', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'CLCA 2119', title: 'Mechanics of Fiction', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Bilal Tanweer', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'CLCA 2133', title: 'Fountain of the Sun: Rumi’s Masnavi and Divan', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Fatima Fayyaz', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'CLCA 2143', title: 'Modern Urdu Novel', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Nasir Abbas', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'CR 1-07, SAHSOL' },
    ],
  },
  {
    code: 'CLCA 2214', title: 'Mechanics of Film', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Zebunnisa Hamid', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-3, Academic Block' },
    ],
  },
  {
    code: 'CLCA 2222', title: 'The Art of Filmmaking', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Raja Mohammad Tabish Habib', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'CR 2-07, SAHSOL' },
    ],
  },
  {
    code: 'CLCA 2422', title: 'Introduction to Sanskrit', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Shahid Rasheed', meets: 'Tue & Thu, 4:30 PM - 6:20 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },
  {
    code: 'CLCA 2523', title: 'Illustrative Storytelling', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Mahnoor Azeem', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-10, Academic Block' },
    ],
  },
  {
    code: 'CLCA 2524', title: 'Introduction to Motion Media', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tayyab Younas', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'Lab 4, IST' },
    ],
  },
  {
    code: 'CLCA 3122', title: 'Mir and Ghalib', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Ahtisham Ali', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'CLCA 3202', title: 'Digital Media Production', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Zebunnisa Hamid', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-10, Academic Block' },
    ],
  },
  {
    code: 'CLCA 3414', title: 'The Past is a Foreign Country: Memory, Myth and Historical Storytelling', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Saman Tariq Malik', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: '305, SDSB' },
    ],
  },

  // Computer Science
  {
    code: 'CS 100', title: 'Computational Problem Solving', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', meets: 'Tue & Thu, 2:30 PM - 3:20 PM', room: 'B-3, SDSB' },
      { id: 'S2', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', meets: 'Tue & Thu, 9:30 AM - 10:20 AM', room: 'B-3, SDSB' },
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', meets: 'Wed, 10:30 AM - 1:20 PM', room: 'Lab 2, IST' },
      { id: 'L2', component: 'Lab', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', meets: 'Mon, 9:00 AM - 11:50 AM', room: 'Lab 1, IST' },
    ],
  },
  {
    code: 'CS 200', title: 'Introduction to Programming', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Mian Muhammad Awais & Shafay Shamail', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'Block 9-B2, SSE' },
      { id: 'L1', component: 'Lab', instructor: 'Mian Muhammad Awais & Shafay Shamail', meets: 'Fri, 2:00 PM - 4:50 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'CS 2001', title: 'Introduction to Programming with Python', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Waqar Ahmad', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'MCB A-13, Academic Block' },
      { id: 'L1', component: 'Lab', instructor: 'Waqar Ahmad', meets: 'Tue, 2:00 PM - 4:50 PM', room: 'Programming Studio' },
    ],
  },
  {
    code: 'CS 202', title: 'Data Structures', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Maryam Abdul Ghafoor', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Maryam Abdul Ghafoor', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'CS 210', title: 'Discrete Mathematics', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Mudassir Shabbir', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Mudassir Shabbir', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'CS 220', title: 'Digital Logic Circuits', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'CS 220L', title: 'Digital Logic Circuits Lab', credits: 1, department: 'Computer Science',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Tue, 11:00 AM - 1:50 PM', room: 'EE Lab 2, SSE' },
      { id: 'L2', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Mon, 3:30 PM - 6:20 PM', room: 'EE Lab 2, SSE' },
      { id: 'L3', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L4', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Thu, 11:00 AM - 1:50 PM', room: 'EE Lab 2, SSE' },
      { id: 'L5', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Wed, 3:30 PM - 6:20 PM', room: 'EE Lab 2, SSE' },
    ],
  },
  {
    code: 'CS 225', title: 'Fundamentals of Computer Systems', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Jahangir Ikram', meets: 'Mon & Wed, 12:30 PM - 2:20 PM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Muhammad Jahangir Ikram', meets: 'Mon & Wed, 3:30 PM - 5:20 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 233', title: 'Introduction to Computational Social Sciences', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Ihsan Ayyub Qazi & Ayesha Ali', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 330', title: 'Computational Biology II', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Laraib Iqbal Malik', meets: 'Mon & Wed, 1:30 PM - 2:45 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'CS 331', title: 'Foundations of AI and Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Agha Ali Raza', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'CS 334', title: 'Principles and Techniques of Data Science', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Saqib Muhammad Ilyas', meets: 'Mon & Wed, 9:00 AM - 10:15 AM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 340', title: 'Databases', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Asim Karim & Basit Shafiq', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'CS 365', title: 'AI-Driven Software Engineering', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'CS 370', title: 'Operating Systems', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Naveed Anwar Bhatti', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Block 10-201, SSE' },
      { id: 'S2', instructor: 'Naveed Anwar Bhatti', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'CS 3812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'CS 425', title: 'Digital System Design', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'CS 425L', title: 'Digital System Design Lab', credits: 1, department: 'Computer Science',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Shahid Masud', meets: 'Fri, 2:00 PM - 4:50 PM', room: 'Lab 3, IST' },
    ],
  },
  {
    code: 'CS 4302', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'CS 4305', title: 'AI on Edge Devices', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', meets: 'Sun, 2:00 PM - 5:00 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'CS 4313', title: 'Quantum Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 434', title: 'Deep Learning for Time, Space, and Graphs', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', meets: 'Sat, 9:00 AM - 12:00 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'CS 437', title: 'Deep Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'CS 4602', title: 'Coding for Careers', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Saqib Muhammad Ilyas & Maryam Abdul Ghafoor', meets: 'Fri, 9:00 AM - 11:50 AM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 487', title: 'Cloud Development', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Ali Khawaja', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 501', title: 'Applied Probability', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'CS 5309', title: 'AI on Edge Devices', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', meets: 'Sun, 2:00 PM - 5:00 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'CS 5316', title: 'NLP Theory and Applications', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Asim Karim', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'CS 5317', title: 'Deep Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'CS 5323', title: 'Deep Learning for Time, Space, and Graphs', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', meets: 'Sat, 9:00 AM - 12:00 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'CS 5325', title: 'Quantum Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', meets: 'Sun, 9:00 AM - 12:00 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'CS 5326', title: 'Advanced GenAI and Agents', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Agha Ali Raza', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'CS 5603', title: 'Cloud Development', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Ali Khawaja', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 5604', title: 'AI-Driven Software Engineering', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'CS 5803', title: 'Applied Cryptography', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Siddiqi', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'CS 5812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'CS 582', title: 'Distributed Systems', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zafar Ayyub Qazi', meets: 'Tue & Thu, 12:00 PM - 1:15 PM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Zafar Ayyub Qazi', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'CS 593', title: 'Mobile Robotics', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'CS 622', title: 'Computer Architecture', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Sohail Aslam Lab' },
    ],
  },
  {
    code: 'CS 630', title: 'Responsible AI Engineering', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', meets: 'Sat, 2:00 PM - 5:00 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'CS 6304', title: 'Advanced Topics in Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tahir', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'CS 6315', title: 'Multi-agent Systems', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Hassan Jaleel', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'CS 653', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'CS 667', title: 'Coding for Careers', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Saqib Muhammad Ilyas & Maryam Abdul Ghafoor', meets: 'Fri, 9:00 AM - 11:50 AM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'CS 682', title: 'Topics in Computer and Network Security', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Fareed Zaffar', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Syed Babar Ali CR 0-01' },
    ],
  },

  // Data Science
  {
    code: 'DISC 112', title: 'Computer and Problem Solving', credits: 4, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Humbal Tariq', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: 'B-1, SDSB' },
      { id: 'L1', component: 'Lab', instructor: 'Humbal Tariq', meets: 'Fri, 9:00 AM - 11:50 AM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'DISC 203', title: 'Probability and Statistics', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Maheen Aamir Syed', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: '201, SDSB' },
      { id: 'S2', instructor: 'Sana Sami', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'A-7, Academic Block' },
      { id: 'S3', instructor: 'Sana Sami', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'A-1, Academic Block' },
      { id: 'S4', instructor: 'Sana Sami', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'A-3, Academic Block' },
      { id: 'S5', instructor: 'Sana Sami', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'A-7, Academic Block' },
      { id: 'S6', instructor: 'Muhammad Asim', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: '201, SDSB' },
      { id: 'S7', instructor: 'Muhammad Asim', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'DISC 212', title: 'Introduction to Management Science', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: '203, SDSB' },
      { id: 'S2', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: '203, SDSB' },
      { id: 'S3', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: '203, SDSB' },
      { id: 'S4', instructor: 'Zaid Saeed Khan', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Trading Lab, SDSB' },
      { id: 'S5', instructor: 'Zaid Saeed Khan', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'DISC 231', title: 'Operations Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Samnan Ali', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'DISC 320', title: 'Management Inquiry: Research Skills for Business Problems', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Zehra Waheed & Aleena Iqtidar', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: '201, SDSB' },
      { id: 'S2', instructor: 'Zehra Waheed & Aleena Iqtidar', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'DISC 321', title: 'Decision Analysis', credits: 4, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Sheikh Attique Ur Rehman', meets: 'Mon & Wed, 9:00 AM - 10:50 AM', room: 'Trading Lab, SDSB' },
      { id: 'S2', instructor: 'Sheikh Attique Ur Rehman', meets: 'Tue & Thu, 9:00 AM - 10:50 AM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'DISC 322', title: 'Optimization Methods in Management Science', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: '203, SDSB' },
      { id: 'S2', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: '203, SDSB' },
    ],
  },
  {
    code: 'DISC 323', title: 'Decision Behaviour', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Sheikh Attique Ur Rehman', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'B-1, SDSB' },
      { id: 'S2', instructor: 'Sheikh Attique Ur Rehman', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: '201, SDSB' },
    ],
  },
  {
    code: 'DISC 325', title: 'Business Data Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Adeel Haider Mankee', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Lab 1, IST' },
    ],
  },
  {
    code: 'DISC 326', title: 'Data Science for Decision Making', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Asad Shoaib', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: '204, SDSB' },
    ],
  },
  {
    code: 'DISC 327', title: 'Risk Management Process', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Nisar Ur Rehman', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'DISC 331', title: 'Project Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Samnan Ali', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'DISC 333', title: 'Supply Chain and Logistics Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Abid Ameen', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'B-1, SDSB' },
    ],
  },
  {
    code: 'DISC 335', title: 'Transportation and Logistics Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Zaid Saeed Khan', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'A-3, Academic Block' },
    ],
  },
  {
    code: 'DISC 420', title: 'Business Analytics', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Maheen Aamir Syed', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Trading Lab, SDSB' },
      { id: 'S2', instructor: 'Maheen Aamir Syed', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'DISC 472', title: 'Generative AI for Business and Automation', credits: 4, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Adnan Zahid', meets: 'Mon & Wed, 3:30 PM - 5:20 PM', room: 'Lab 2, IST' },
    ],
  },
  {
    code: 'DISC 6304', title: 'Applied Risk Science for Business Systems', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'DISC 6401', title: 'Delivering Value Through Capital Projects', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Zehra Waheed', meets: 'Fri, Sat, Sun, 1:00 PM - 3:00 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'DISC 6501', title: 'Applied Data Analysis', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ghufran Ahmad', meets: 'Sat & Sun, 8:30 AM - 10:30 AM', room: 'Trading Lab, SDSB' },
      { id: 'S2', instructor: 'Muhammad Asim', meets: 'Sat & Sun, 4:30 PM - 6:30 PM', room: 'Lab 2, IST' },
      { id: 'S3', instructor: 'Muhammad Ghufran Ahmad', meets: 'Sat & Sun, 10:45 AM - 12:45 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'DISC 8301', title: 'Seminar in Operations and Supply Chain Strategy', credits: 3, department: 'Data Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Muhammad Shakeel Sadiq Jajja', meets: 'Thu, 10:00 AM - 1:00 PM', room: '102, SDSB' },
    ],
  },
  {
    code: 'DISC 8601', title: 'Regression Models', credits: 1.5, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Syed Aun Raza Rizvi', meets: 'Wed, 9:00 AM - 12:00 PM', room: '106, SDSB' },
    ],
  },
  {
    code: 'DISC 8602', title: 'Multilevel Models', credits: 1.5, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ghufran Ahmad', meets: 'Mon, 9:00 AM - 12:00 PM', room: '102, SDSB' },
    ],
  },
  {
    code: 'DISC 8605', title: 'Structural Equation Models', credits: 1.5, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ghufran Ahmad', meets: 'Wed, 9:00 AM - 12:00 PM', room: '102, SDSB' },
    ],
  },

  // Economics
  {
    code: 'ECON 100', title: 'Principles of Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Nadia Mukhtar Sayed', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-3, Academic Block' },
    ],
  },
  {
    code: 'ECON 111', title: 'Principles of Microeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Tareena Musaddiq', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'A-14, Academic Block' },
      { id: 'S2', instructor: 'Tareena Musaddiq', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-8, Academic Block' },
      { id: 'S3', instructor: 'Syed Muhammad Hasan', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'A-11, Academic Block' },
      { id: 'S4', instructor: 'Syed Muhammad Hasan', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: 'A-16, Academic Block' },
      { id: 'R1', component: 'Recitation', instructor: 'Ayesha Karim Malik', meets: 'Fri, 9:00 AM - 9:50 AM', room: 'A-7, Academic Block' },
      { id: 'R10', component: 'Recitation', instructor: 'Rida Hameed', meets: 'Fri, 9:00 AM - 9:50 AM', room: 'A-16, Academic Block' },
      { id: 'R11', component: 'Recitation', instructor: 'Rida Hameed', meets: 'Fri, 10:00 AM - 10:50 AM', room: 'A-16, Academic Block' },
      { id: 'R12', component: 'Recitation', instructor: 'Rida Hameed', meets: 'Fri, 11:00 AM - 11:50 AM', room: 'A-16, Academic Block' },
      { id: 'R2', component: 'Recitation', instructor: 'Ayesha Karim Malik', meets: 'Fri, 2:00 PM - 2:50 PM', room: 'A-11, Academic Block' },
      { id: 'R3', component: 'Recitation', instructor: 'Ayesha Karim Malik', meets: 'Fri, 11:00 AM - 11:50 AM', room: 'A-7, Academic Block' },
      { id: 'R4', component: 'Recitation', meets: 'Fri, 10:30 AM - 11:20 AM', room: 'A-11, Academic Block' },
      { id: 'R5', component: 'Recitation', meets: 'Fri, 9:30 AM - 10:20 AM', room: 'A-11, Academic Block' },
      { id: 'R6', component: 'Recitation', instructor: 'Ayesha Karim Malik', meets: 'Fri, 10:00 AM - 10:50 AM', room: 'A-7, Academic Block' },
      { id: 'R7', component: 'Recitation', instructor: 'Rida Hameed', meets: 'Fri, 4:00 PM - 4:50 PM', room: 'A-7, Academic Block' },
      { id: 'R8', component: 'Recitation', instructor: 'Rida Hameed', meets: 'Fri, 2:00 PM - 2:50 PM', room: 'A-7, Academic Block' },
      { id: 'R9', component: 'Recitation', instructor: 'Rida Hameed', meets: 'Fri, 3:00 PM - 3:50 PM', room: 'A-7, Academic Block' },
    ],
  },
  {
    code: 'ECON 121', title: 'Principles of Macroeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Kashif Zaheer Malik', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-3, Academic Block' },
      { id: 'S2', instructor: 'Ahmed M. Khalid', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'MCB A-13, Academic Block' },
      { id: 'S3', instructor: 'Ahmed M. Khalid', meets: 'Mon & Wed, 12:00 PM - 1:15 PM', room: 'MCB A-13, Academic Block' },
      { id: 'S4', instructor: 'Kashif Zaheer Malik', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'A-4, Academic Block' },
      { id: 'R1', component: 'Recitation', instructor: 'Nida Naz', meets: 'Fri, 8:00 AM - 8:50 AM', room: 'A-2, Academic Block' },
      { id: 'R10', component: 'Recitation', instructor: 'Anum Fatima', meets: 'Fri, 2:00 PM - 2:50 PM', room: 'A-6, Academic Block' },
      { id: 'R11', component: 'Recitation', instructor: 'Anum Fatima', meets: 'Fri, 4:00 PM - 4:50 PM', room: 'A-6, Academic Block' },
      { id: 'R12', component: 'Recitation', instructor: 'Anum Fatima', meets: 'Fri, 5:00 PM - 5:50 PM', room: 'A-6, Academic Block' },
      { id: 'R2', component: 'Recitation', instructor: 'Nida Naz', meets: 'Fri, 12:00 PM - 12:50 PM', room: 'A-6, Academic Block' },
      { id: 'R3', component: 'Recitation', instructor: 'Nida Naz', meets: 'Fri, 10:00 AM - 10:50 AM', room: 'A-15, Academic Block' },
      { id: 'R4', component: 'Recitation', instructor: 'Khadija Aftab', meets: 'Thu, 3:00 PM - 3:50 PM', room: 'CR 2-06, SAHSOL' },
      { id: 'R5', component: 'Recitation', instructor: 'Khadija Aftab', meets: 'Thu, 4:00 PM - 4:50 PM', room: 'CR 2-06, SAHSOL' },
      { id: 'R6', component: 'Recitation', instructor: 'Khadija Aftab', meets: 'Thu, 1:00 PM - 1:50 PM', room: 'A-2, Academic Block' },
      { id: 'R7', component: 'Recitation', instructor: 'Khadija Aftab', meets: 'Fri, 11:00 AM - 11:50 AM', room: 'A-6, Academic Block' },
      { id: 'R8', component: 'Recitation', instructor: 'Khadija Aftab', meets: 'Fri, 9:00 AM - 9:50 AM', room: 'A-6, Academic Block' },
      { id: 'R9', component: 'Recitation', instructor: 'Khadija Aftab', meets: 'Fri, 10:00 AM - 10:50 AM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'ECON 203', title: 'Reading Marx with Dickens', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Fahd Ali', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-12, Academic Block' },
    ],
  },
  {
    code: 'ECON 211', title: 'Intermediate Microeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Malik Fakhar Ahmed & Noor Adnan Qureshi', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-12, Academic Block' },
      { id: 'S2', instructor: 'Malik Fakhar Ahmed & Noor Adnan Qureshi', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: '204, SDSB' },
    ],
  },
  {
    code: 'ECON 221', title: 'Intermediate Macroeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Zahid Ali', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'MCB A-13, Academic Block' },
      { id: 'S2', instructor: 'Syed Zahid Ali', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'ECON 230', title: 'Statistics and Data Analysis', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Usman Elahi', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-12, Academic Block' },
      { id: 'S2', instructor: 'Usman Elahi', meets: 'Mon & Wed, 11:00 AM - 12:50 PM', room: '204, SDSB' },
      { id: 'S3', instructor: 'Amin Hussain', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-4, Academic Block' },
    ],
  },
  {
    code: 'ECON 2301', title: 'Data Analytics Lab I', credits: 2, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Eeman Shahzad Shahzad Qureshi', meets: 'Fri, 12:00 PM - 12:50 PM', room: 'A-4, Academic Block' },
      { id: 'S2', instructor: 'Eeman Shahzad Shahzad Qureshi', meets: 'Fri, 2:00 PM - 2:50 PM', room: 'A-14, Academic Block' },
      { id: 'S3', instructor: 'Yushma Umar', meets: 'Fri, 3:00 PM - 3:50 PM', room: 'A-12, Academic Block' },
      { id: 'L1', component: 'Lab', instructor: 'Eeman Shahzad Shahzad Qureshi', meets: 'Fri, 3:30 PM - 6:20 PM', room: 'Lab 1, IST' },
      { id: 'L2', component: 'Lab', instructor: 'Eeman Shahzad Shahzad Qureshi', meets: 'Tue, 2:00 PM - 4:50 PM', room: 'Lab 1, IST' },
      { id: 'L3', component: 'Lab', instructor: 'Yushma Umar', meets: 'Fri, 10:00 AM - 12:50 PM', room: 'Programming Studio' },
    ],
  },
  {
    code: 'ECON 233', title: 'Introduction to Game Theory', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Lyyla Khalid', meets: 'Tue & Thu, 9:00 AM - 10:50 AM', room: 'Syed Babar Ali CR 0-01' },
      { id: 'S2', instructor: 'Lyyla Khalid', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'ECON 240', title: 'Development Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Nadia Mukhtar Sayed', meets: 'Tue & Thu, 9:00 AM - 10:50 AM', room: 'SS, Academic Block' },
    ],
  },
  {
    code: 'ECON 244', title: 'Introduction to Environmental Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Sumaya Falak Memon', meets: 'Mon & Wed, 3:00 PM - 4:50 PM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'ECON 261', title: 'Principles of Finance', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Sheraz Latif Malik', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'CR 1-07, SAHSOL' },
    ],
  },
  {
    code: 'ECON 262', title: 'Mathematical Applications in Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Mushtaq Ahmad Khan', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'ECON 314', title: 'Law and Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Ali Hasanain', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'ECON 323', title: 'Economic History of South Asia', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Fahd Ali', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'ECON 330', title: 'Econometrics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Farah Said', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-12, Academic Block' },
      { id: 'S2', instructor: 'Muhammad Farooq Naseer', meets: 'Tue & Thu, 9:00 AM - 10:50 AM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'ECON 3301', title: 'Data Analytics Lab II', credits: 2, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Rabia Khan', meets: 'Fri, 5:30 PM - 6:20 PM', room: 'A-3, Academic Block' },
      { id: 'S2', instructor: 'Rabia Khan', meets: 'Fri, 12:30 PM - 1:20 PM', room: 'A-7, Academic Block' },
      { id: 'L1', component: 'Lab', instructor: 'Rabia Khan', meets: 'Fri, 2:00 PM - 4:50 PM', room: 'Lab 2, IST' },
      { id: 'L2', component: 'Lab', instructor: 'Rabia Khan', meets: 'Fri, 9:00 AM - 11:50 AM', room: 'Lab 1, IST' },
    ],
  },
  {
    code: 'ECON 3402', title: 'Gender Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Hana Zahir', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'ECON 3404', title: 'Ethics and Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Khalid Mir', meets: 'Mon & Wed, 1:00 PM - 2:50 PM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'ECON 3405', title: 'The Economics of Addiction', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Xiaolong Hou', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'CR 1-07, SAHSOL' },
    ],
  },
  {
    code: 'ECON 3406', title: 'Economics of Artificial Intelligence', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Ali Hasanain', meets: 'Mon & Wed, 12:30 PM - 2:20 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'ECON 343', title: 'Agriculture and Food Policy', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Abid Aman Burki', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-7, Academic Block' },
    ],
  },
  {
    code: 'ECON 4102', title: 'Gender and the Labor Market', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Hadia Majid', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'ECON 423', title: 'Growth Theories', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Antonio Marasco', meets: 'Mon & Wed, 4:30 PM - 6:20 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'ECON 438', title: 'Econometrics II', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Adeel Tariq', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'ECON 4405', title: 'Health Economics: Theory and Policy', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syeda Warda Riaz', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'ECON 441', title: 'Development Economics Theory', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Khalid Mir', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'ECON 4414', title: 'Topics in Energy Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Ayesha Ali', meets: 'Mon & Wed, 3:30 PM - 5:20 PM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'ECON 4602', title: 'Public Finance', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Sher Afghan Asad', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'ECON 511', title: 'Microeconomic Analysis', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Osama Khan', meets: 'Mon & Wed, 8:00 AM - 9:50 AM', room: 'A-2, Academic Block' },
    ],
  },
  {
    code: 'ECON 531', title: 'Econometrics and Research Methodology I', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Mushtaq Ahmad Khan', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'ECON 536', title: 'Topics in Mathematical Method for Economists', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Zahid Ali', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'CR 1-06, SAHSOL' },
    ],
  },

  // Education
  {
    code: 'EDU 212', title: 'Sociology of Education', credits: 4, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Tania Saeed', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'EDU 222', title: 'The Learning Gap: Critical Issues in Educational Psychology', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Ifrah Nadeem', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: '03, SOE' },
    ],
  },
  {
    code: 'EDU 223', title: 'Trauma-Informed Education Systems: Creating Cultures of Support and Change', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Fizza Suhail', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: '02, SOE' },
    ],
  },
  {
    code: 'EDU 274', title: 'Gender Media and Education', credits: 3, department: 'Education',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Hasham Nasir', meets: 'Tue, 2:00 PM - 4:50 PM', room: '02, SOE' },
    ],
  },
  {
    code: 'EDU 3204', title: 'Enhancing Inclusion: Exploring Autism and Intellectual Disability', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mariam Haider', meets: 'Tue & Thu, 3:00 PM - 4:15 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDU 321', title: 'Inclusive Pedagogy: Rethinking teaching, learning and assessment', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Fizza Suhail', meets: 'Tue & Thu, 4:00 PM - 5:15 PM', room: 'Mirza Muhammad Abdullah CR1-02' },
    ],
  },
  {
    code: 'EDU 3215', title: 'Understanding Diversity in Disability', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mariam Haider', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: '03, SOE' },
    ],
  },
  {
    code: 'EDU 352', title: 'Education Policy Analysis', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jasir Shahbaz', meets: 'Tue & Thu, 3:00 PM - 4:15 PM', room: '03, SOE' },
    ],
  },
  {
    code: 'EDU 353', title: 'Education and Conflict', credits: 3, department: 'Education',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Hasham Nasir', meets: 'Tue, 10:00 AM - 12:50 PM', room: '02, SOE' },
    ],
  },
  {
    code: 'EDU 412', title: 'Economics of Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jasir Shahbaz', meets: 'Tue & Thu, 11:30 AM - 12:45 PM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'EDU 422', title: 'Behavior Analysis for Effective Teaching', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Aaishay Haque', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDU 510', title: 'Interdisciplinary Theoretical Perspectives on Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Soufia Anis Siddiqi', meets: 'Tue & Thu, 10:30 AM - 11:45 AM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDU 512', title: 'The Arts and Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Razia Iram Sadik', cadence: 'Twice a week - 75 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Razia Iram Sadik', meets: 'Wed, 12:00 PM - 2:50 PM', room: '02, SOE' },
    ],
  },
  {
    code: 'EDU 540', title: 'Leadership: The Politics of Change', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mariam Chughtai', cadence: 'Twice a week - 75 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Mariam Chughtai', meets: 'Wed, 12:00 PM - 2:50 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDU 553', title: 'Politics of Education Reform', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Soufia Anis Siddiqi', meets: 'Mon & Wed, 3:00 PM - 4:15 PM', room: '04, SOE' },
    ],
  },
  {
    code: 'EDU 554', title: 'Technology, AI and Impact on Teaching and Educational development', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mohammad Mansoor Khan', cadence: 'Twice a week - 75 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Mohammad Mansoor Khan', meets: 'Mon, 12:00 PM - 2:50 PM', room: '02, SOE' },
    ],
  },
  {
    code: 'EDU 560', title: 'Research Methods in Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Sadaf Latafat', meets: 'Mon & Wed, 10:30 AM - 11:45 AM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDU 590', title: 'Observing Schools', credits: 1, department: 'Education',
    sections: [
      { id: 'F1', component: 'Field', instructor: 'Khansa Maria', meets: 'Fri, 8:00 AM - 1:50 PM' },
    ],
  },
  {
    code: 'EDU 690', title: 'Practicum Proseminar', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Razia Iram Sadik & Mohammad Mansoor Khan', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Tayyaba Tamim & Mohammad Mansoor Khan', cadence: 'Twice a week - 75 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Razia Iram Sadik', meets: 'Tue, 12:00 PM - 2:50 PM', room: '23, SOE' },
      { id: 'M2', component: 'Seminar', instructor: 'Sadaf Latafat', meets: 'Tue, 12:00 PM - 2:50 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDU 693', title: 'Academic Writing', credits: 1, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Sannia Hussain', meets: 'Mon, 12:00 PM - 12:50 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDUX 510', title: 'Interdisciplinary Theoretical Perspectives on Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 120 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Jasir Shahbaz & Tayyaba Tamim', meets: 'Sun, 11:00 AM - 12:50 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDUX 540', title: 'Leadership: The Politics of Change', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jessica Albrent', meets: 'Sat & Sun, 4:00 PM - 5:50 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDUX 552', title: 'Education for Sustainable Development', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mohammad Mansoor Khan', cadence: 'Twice a week - 120 min' },
    ],
  },
  {
    code: 'EDUX 554', title: 'Design-Based Research in Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jessica Albrent', cadence: 'Twice a week - 120 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Jessica Albrent', meets: 'Sat, 11:00 AM - 12:50 PM', room: '02, SOE' },
    ],
  },
  {
    code: 'EDUX 560', title: 'Research Methods in Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jessica Albrent', meets: 'Sat & Sun, 9:00 AM - 10:50 AM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDUX 564', title: 'Education and Artificial Intelligence: Critical Perspectives and Hands-on Practice', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Suleman Shahid & Tayyaba Tamim', cadence: 'Twice a week - 120 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Suleman Shahid & Tayyaba Tamim', meets: 'Sat, 2:00 PM - 5:50 PM', room: '03, SOE' },
    ],
  },
  {
    code: 'EDUX 590', title: 'Observing Schools', credits: 1, department: 'Education',
    sections: [
      { id: 'F1', component: 'Field', instructor: 'Khansa Maria', meets: 'Sat, 11:00 AM - 12:30 PM', room: '01, SOE' },
    ],
  },
  {
    code: 'EDUX 652', title: 'Introduction to Student Affairs', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Sadaf Latafat', cadence: 'Twice a week - 120 min' },
    ],
  },
  {
    code: 'EDUX 690', title: 'Practicum Proseminar', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 120 min' },
      { id: 'S2', instructor: 'Jessica Albrent', cadence: 'Once a week - 240 min' },
      { id: 'M1', component: 'Seminar', instructor: 'Jessica Albrent', meets: 'Sun, 11:00 AM - 12:50 PM', room: '02EDUX(Alter, SOE' },
      { id: 'M2', component: 'Seminar', instructor: 'Farah Nadeem', meets: 'Sun, 11:00 AM - 12:50 PM', room: '03EDUX(Alter, SOE' },
    ],
  },
  {
    code: 'EDUX 693', title: 'Academic Writing', credits: 1, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Sannia Hussain', meets: 'Sat, 2:00 PM - 3:30 PM', room: '01, SOE' },
    ],
  },

  // Electrical Engineering
  {
    code: 'EE 201', title: 'Introduction to Programming', credits: 4, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Mian Muhammad Awais & Shafay Shamail', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'Block 9-B2, SSE' },
      { id: 'L1', component: 'Lab', instructor: 'Mian Muhammad Awais & Shafay Shamail', meets: 'Fri, 2:00 PM - 4:50 PM', room: 'Lab 4, IST' },
    ],
  },
  {
    code: 'EE 202', title: 'Data Structures', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Maryam Abdul Ghafoor', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Maryam Abdul Ghafoor', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'EE 203', title: 'Engineering Models', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'EE 220', title: 'Digital Logic Circuits', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'EE 220L', title: 'Digital Logic Circuits Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Tue, 11:00 AM - 1:50 PM', room: 'EE Lab 2, SSE' },
      { id: 'L2', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Mon, 3:30 PM - 6:20 PM', room: 'EE Lab 2, SSE' },
      { id: 'L3', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L4', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Thu, 11:00 AM - 1:50 PM', room: 'EE Lab 2, SSE' },
      { id: 'L5', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', meets: 'Wed, 3:30 PM - 6:20 PM', room: 'EE Lab 2, SSE' },
    ],
  },
  {
    code: 'EE 240', title: 'Circuits I', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nauman Ahmad Zaffar', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Programming Studio' },
    ],
  },
  {
    code: 'EE 315', title: 'Foundations of AI and Machine Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Agha Ali Raza', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'EE 324', title: 'Microcontroller and Interfacing', credits: 2, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hafsa Qamar', meets: 'Tue & Thu, 10:00 AM - 10:50 AM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'EE 324L', title: 'Microcontroller and Interfacing Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Hafsa Qamar', meets: 'Wed, 9:30 AM - 12:20 PM', room: 'EE Lab 2, SSE' },
      { id: 'L2', component: 'Lab', instructor: 'Hafsa Qamar', meets: 'Mon, 9:30 AM - 12:20 PM', room: 'EE Lab 2, SSE' },
    ],
  },
  {
    code: 'EE 330', title: 'Electromagnetic Fields and Waves', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Imran Cheema', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'EE 340', title: 'Devices and Electronics', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'EE 340L', title: 'Devices and Electronics Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', meets: 'Fri, 3:00 PM - 5:50 PM', room: 'EE Lab 1, SSE' },
      { id: 'L2', component: 'Lab', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', meets: 'Fri, 9:00 AM - 11:50 AM', room: 'EE Lab 1, SSE' },
      { id: 'L3', component: 'Lab', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', meets: 'Tue, 3:30 PM - 6:20 PM', room: 'EE Lab 1, SSE' },
    ],
  },
  {
    code: 'EE 380', title: 'Communication Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Ijaz Haider Naqvi', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'EE 380L', title: 'Communication Systems Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Ijaz Haider Naqvi', meets: 'Fri, 2:00 PM - 4:50 PM', room: 'EE Lab 3, SSE' },
      { id: 'L2', component: 'Lab', instructor: 'Ijaz Haider Naqvi', meets: 'Wed, 3:30 PM - 6:20 PM', room: 'EE Lab 3, SSE' },
      { id: 'L3', component: 'Lab', instructor: 'Ijaz Haider Naqvi', meets: 'Fri, 9:30 AM - 12:20 PM', room: 'EE Lab 3, SSE' },
    ],
  },
  {
    code: 'EE 3812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'EE 402', title: 'Principles and Techniques of Data Science', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Saqib Muhammad Ilyas', meets: 'Mon & Wed, 9:00 AM - 10:15 AM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'EE 414', title: 'Deep Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'EE 417', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'EE 421', title: 'Digital System Design', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'EE 421L', title: 'Digital System Design Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Shahid Masud', meets: 'Fri, 2:00 PM - 4:50 PM', room: 'Lab 3, IST' },
    ],
  },
  {
    code: 'EE 453', title: 'Power System Protection and Stability', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Raheel Zafar', meets: 'Mon & Wed, 3:00 PM - 4:15 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'EE 5102', title: 'Advanced Topics in Machine Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tahir', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'EE 5105', title: 'AI on Edge Devices', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', meets: 'Sun, 2:00 PM - 5:00 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'EE 512', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'EE 515', title: 'Applied Probability', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'EE 517', title: 'Deep Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'EE 520', title: 'Computer Architecture', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Sohail Aslam Lab' },
    ],
  },
  {
    code: 'EE 5202', title: 'VLSI Design for Artificial Intelligence', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Siddiqi', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'Gen. Habibullah Khan CR 0-02' },
    ],
  },
  {
    code: 'EE 5203', title: 'Physics-informed machine learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nauman Zafar Butt', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'EE 5204', title: 'Applied Cryptography', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Siddiqi', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'EE 5502', title: 'Local Solutions for Energy Access', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Naveed Arshad & Nauman Ahmad Zaffar', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'EE 555', title: 'Renewable Energy Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Abbas Khan', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'EE 559', title: 'Power System Protection and Stability', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Raheel Zafar', meets: 'Mon & Wed, 3:00 PM - 4:15 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'EE 565', title: 'Mobile Robotics', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'EE 567', title: 'Multi-agent Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Jaleel', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'EE 5812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'EE 585', title: 'Communication Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Ijaz Haider Naqvi', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'Block 10-201, SSE' },
    ],
  },

  // Business Administration
  {
    code: 'EMBA 5013', title: 'Understanding Financial Accounting: Making More Authoritative Decisions', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Asad Alam', meets: 'Sat & Sun, 8:30 AM - 10:35 AM', room: '103, SDSB' },
      { id: 'S2', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5022', title: 'Corporate Finance', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Fazal Jawad Seyyed', meets: 'Sat & Sun, 11:05 AM - 1:10 PM', room: '203, SDSB' },
      { id: 'S2', instructor: 'Fazal Jawad Seyyed', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5041', title: 'Marketing Management', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ehsan Ul Haque', meets: 'Sat & Sun, 2:35 PM - 4:40 PM', room: '103, SDSB' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5063', title: 'Decision Analytics', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Jamshed Hasan Khan', meets: 'Sat & Sun, 11:05 AM - 1:10 PM', room: '103, SDSB' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5211', title: 'Business Law', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Faiza', meets: 'Sat & Sun, 8:30 AM - 10:35 AM', room: '203, SDSB' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 6071', title: 'Venture Creation', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Adnan Zahid', meets: 'Sat & Sun, 2:35 PM - 4:40 PM', room: '203, SDSB' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 6242', title: 'Corporate Governance', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Bushra Naqvi', meets: 'Sat & Sun, 8:30 AM - 10:35 AM', room: '203, SDSB' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'FMG 5101', title: 'Financial Statement Analysis and Value Creation', credits: 3, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Syed Kumail Abbas Rizvi', meets: 'Fri, Sat, Sun, 10:45 AM - 12:45 PM', room: '201, SDSB' },
    ],
  },
  {
    code: 'FMG 6102', title: 'Fintech Disruptions: Revolutionizing Financial Services', credits: 3, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Salman Khan', meets: 'Fri, Sat, Sun, 8:30 AM - 10:30 AM', room: '303, SDSB' },
    ],
  },
  {
    code: 'HMI 6101', title: 'Health Systems Management', credits: 1.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Kashif Maqbool Khan', meets: 'Fri, Sat, Sun, 4:30 PM - 6:30 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'HMI 6102', title: 'Healthcare Policy, Politics and Law', credits: 1.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ain Ul Momina & Muhammad Adeel Alvi', meets: 'Fri, Sat, Sun, 2:00 PM - 4:00 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'HMI 6202', title: 'Healthcare Operations Management', credits: 3, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Hassan Rauf Chaudhry & Kashif Maqbool Khan', meets: 'Fri, Sat, Sun, 8:30 AM - 10:30 AM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MBA 5041', title: 'Marketing Management', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ehsan Ul Haque', meets: 'Tue & Thu, 2:35 PM - 4:40 PM', room: '103, SDSB' },
      { id: 'S2', instructor: 'Ehsan Ul Haque', meets: 'Tue & Thu, 11:05 AM - 1:10 PM', room: '103, SDSB' },
    ],
  },
  {
    code: 'MBA 5051', title: 'Organizational Behaviour', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Arif Nazir Butt', meets: 'Mon & Wed, 11:05 AM - 1:10 PM', room: '103, SDSB' },
      { id: 'S2', instructor: 'Arif Nazir Butt', meets: 'Mon & Wed, 2:35 PM - 4:40 PM', room: '103, SDSB' },
    ],
  },
  {
    code: 'MBA 5091', title: 'Managerial Communication', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Mehroz Sajjad', meets: 'Tue & Thu, 5:00 PM - 7:05 PM', room: '103, SDSB' },
      { id: 'S2', instructor: 'Mehroz Sajjad', meets: 'Tue & Thu, 2:35 PM - 4:40 PM', room: '104, SDSB' },
    ],
  },
  {
    code: 'MBA 5201A', title: 'Financial Accounting I', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Asad Alam', meets: 'Tue & Thu, 11:05 AM - 1:10 PM', room: '104, SDSB' },
      { id: 'S2', instructor: 'Asad Alam', meets: 'Tue & Thu, 8:30 AM - 10:35 AM', room: '103, SDSB' },
    ],
  },
  {
    code: 'MBA 5201B', title: 'Financial Accounting II', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 5301', title: 'Finance Fundamentals', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Bushra Naqvi', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Bushra Naqvi', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 5701', title: 'Statistical Analysis for Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Jamshed Hasan Khan', meets: 'Mon & Wed, 2:35 PM - 4:40 PM', room: '104, SDSB' },
      { id: 'S2', instructor: 'Jamshed Hasan Khan', meets: 'Mon & Wed, 8:30 AM - 10:35 AM', room: '103, SDSB' },
    ],
  },
  {
    code: 'MBA 5901', title: 'Experiential Learning I', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ghufran Ahmad', meets: 'Fri, 8:30 AM - 1:30 PM', room: '104, SDSB' },
      { id: 'S2', instructor: 'Muhammad Ghufran Ahmad', meets: 'Fri, 2:00 PM - 7:00 PM', room: '103, SDSB' },
    ],
  },
  {
    code: 'MBA 6024', title: 'Islamic Banking', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Saad Azmat', meets: 'Mon & Wed, 12:00 PM - 1:30 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6025', title: 'Investments', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Syed Kumail Abbas Rizvi', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6032', title: 'Supply Chain Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Shakeel Sadiq Jajja', meets: 'Tue & Thu, 3:45 PM - 5:15 PM', room: '303, SDSB' },
      { id: 'S2', instructor: 'Muhammad Shakeel Sadiq Jajja', meets: 'Tue & Thu, 7:15 PM - 8:45 PM', room: '103, SDSB' },
    ],
  },
  {
    code: 'MBA 6036A', title: 'Product and Service Innovation', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Suleman Shahid', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6037B', title: 'Logistics Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', meets: 'Mon & Wed, 5:30 PM - 7:00 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6038A', title: 'Blockchain and Cryptocurrency', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6038C', title: 'Applied Data Science', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ussama Yaqub', meets: 'Mon & Wed, 3:45 PM - 5:15 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6039', title: 'Digital Marketing', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Moeen Naseer Butt', cadence: 'Twice a week - 90 min' },
      { id: 'S2', instructor: 'Moeen Naseer Butt', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6040', title: 'Retail Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6043A', title: 'Channel Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Luqman Awan', cadence: 'Twice a week - 90 min' },
      { id: 'S2', instructor: 'Muhammad Luqman Awan', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6045', title: 'Brand Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Moeen Naseer Butt', meets: 'Mon & Wed, 10:15 AM - 11:45 AM', room: '303, SDSB' },
      { id: 'S2', instructor: 'Moeen Naseer Butt', meets: 'Mon & Wed, 2:00 PM - 3:30 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6048', title: 'Sales Force Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Luqman Awan', meets: 'Tue & Thu, 2:00 PM - 3:30 PM', room: '303, SDSB' },
      { id: 'S2', instructor: 'Muhammad Luqman Awan', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6052', title: 'Human Resource Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Abdur Rahman Malik', meets: 'Mon, 7:15 PM - 8:45 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6060', title: 'Managing Workplace Diversity', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ayesha Masood', meets: 'Tue & Thu, 10:15 AM - 11:45 AM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6061', title: 'Understanding and Managing Self-Identity in Contemporary Organizations', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azfar Nisar', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6064', title: 'Negotiation Skills', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6069', title: 'The Restaurant Industry: ESP, Management and Innovation', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6168', title: 'Family Business', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Hassan Rauf Chaudhry', meets: 'Tue & Thu, 5:30 PM - 7:00 PM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6211', title: 'Business Law', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
      { id: 'S2', instructor: 'Sheharyar Sikander Hamid', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6311', title: 'Financial Institutions', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Samir Ahmed', meets: 'Mon & Wed, 8:30 AM - 10:00 AM', room: '303, SDSB' },
    ],
  },
  {
    code: 'MBA 6316', title: 'Financial Markets', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6317', title: 'Fintech - Concepts, Challenges and Opportunities', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6324A', title: 'Strategic Management of Non-profit Enterprises', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ehsan Ul Haque', cadence: 'Twice a week - 90 min' },
    ],
  },

  // Engineering
  {
    code: 'ENGG 100', title: 'Design and Measurement Lab', credits: 2, department: 'Engineering',
    sections: [
      { id: 'S1', instructor: 'Hafiz Muhammad Afzal & Qasim Imtiaz', meets: 'Tue, 9:30 AM - 10:20 AM', room: 'Block 10-201, SSE' },
      { id: 'S2', instructor: 'Muhammad Faryad', meets: 'Thu, 9:30 AM - 10:20 AM', room: 'Block 10-201, SSE' },
      { id: 'S3', instructor: 'Muhammad Faryad', meets: 'Fri, 2:00 PM - 2:50 PM', room: 'Block 10-302, SSE' },
      { id: 'S4', instructor: 'Nadeem Ahmad Khan', meets: 'Mon, 8:00 AM - 8:50 AM', room: 'Block 10-202, SSE' },
      { id: 'S5', instructor: 'Zubair Khalid', meets: 'Fri, 8:00 AM - 8:50 AM', room: 'Block 10-302, SSE' },
      { id: 'L1', component: 'Lab', instructor: 'Hafiz Muhammad Afzal & Qasim Imtiaz', meets: 'Thu, 9:30 AM - 2:20 PM', room: 'CH Teaching Lab-3, SSE' },
      { id: 'L2', component: 'Lab', instructor: 'Muhammad Faryad & Muhammad Hamza Humayun', meets: 'Tue, 9:30 AM - 2:20 PM', room: 'PHY Introductory Lab, SSE' },
      { id: 'L3', component: 'Lab', instructor: 'Muhammad Faryad & Muhammad Hamza Humayun', meets: 'Wed, 8:00 AM - 12:50 PM', room: 'PHY Introductory Lab, SSE' },
      { id: 'L4', component: 'Lab', instructor: 'Nadeem Ahmad Khan', meets: 'Mon, 1:00 PM - 5:50 PM', room: 'EE Lab 1, SSE' },
      { id: 'L5', component: 'Lab', instructor: 'Zubair Khalid', meets: 'Mon, 8:00 AM - 12:50 PM', room: 'EE Lab 1, SSE' },
    ],
  },
  {
    code: 'ENGG 362', title: 'Water and Society: A Systems Approach', credits: 3, department: 'Engineering',
    sections: [
      { id: 'S1', instructor: 'Abubakr Muhammad', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'ENGG 562', title: 'Climate Change Governance: Science, Data, and Models', credits: 3, department: 'Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Awais', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-302, SSE' },
    ],
  },

  // English
  {
    code: 'ENGL 1000', title: 'Introduction to Literature in English', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Saba Pirzadeh', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-4, Academic Block' },
      { id: 'S2', instructor: 'Sadia Zulfiqar', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'ENGL 2402', title: 'Comics Scholarship and Graphic Narrative', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Tom Edward Sewel', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'ENGL 2432', title: 'Narrative Essays', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Younis Bin Azeem', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'CR 1-07, SAHSOL' },
    ],
  },
  {
    code: 'ENGL 3211', title: '‘Ring Shout’: The Slave Narrative and Its Legacy', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Sadia Zulfiqar', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'ENGL 3254', title: 'Whale of a Tale: 19th Century American Novel', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Saba Pirzadeh', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-10, Academic Block' },
    ],
  },
  {
    code: 'ENGL 4572', title: 'Colonial Discourse and Postcolonial Theory', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Raniya Hosain', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
    ],
  },
  {
    code: 'ENGL 4812', title: 'Contagion: Text as Pathogen', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Tom Edward Sewel', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'Mirza Muhammad Abdullah CR1-02' },
    ],
  },

  // Environmental Science
  {
    code: 'ENV 102', title: 'Introduction to Environmental Studies', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Maryam Ibrahim', meets: 'Mon & Wed, 3:00 PM - 4:50 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'ENV 210', title: 'Methods in Environmental Studies', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Fazilda Nabeel', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'ENV 236', title: 'Disasters and Society', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', meets: 'Tue & Thu, 1:30 PM - 3:20 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'ENV 322', title: 'Environmental Governance', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'ENV 336', title: 'The Politics of Resources', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Ali Nobil Ahmad', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'ENV 362', title: 'Water and Society: A Systems Approach', credits: 3, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Abubakr Muhammad', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'ENV 462', title: 'Climate Change Governance: Science, Data, and Models', credits: 3, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Awais', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-302, SSE' },
    ],
  },

  // Finance
  {
    code: 'FINN 100', title: 'Principles of Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Salman Khan', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'A-7, Academic Block' },
    ],
  },
  {
    code: 'FINN 200', title: 'Intermediate Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Fazal Jawad Seyyed', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'B-2, SDSB' },
      { id: 'S2', instructor: 'Syed Hashim Mahmood Ali', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: '203, SDSB' },
      { id: 'S3', instructor: 'Syed Hashim Mahmood Ali', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'A-4, Academic Block' },
      { id: 'S4', instructor: 'Syed Hashim Mahmood Ali', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-4, Academic Block' },
      { id: 'S5', instructor: 'Fazal Jawad Seyyed', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: '201, SDSB' },
    ],
  },
  {
    code: 'FINN 222', title: 'Introduction to Mathematics of Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Ayesha Ahmad', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'FINN 243', title: 'Fintech Revolution: Market Disruption and Emerging Opportunities', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Hashim Mahmood Ali', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'FINN 341A', title: 'Financial Institutions and Markets', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Tanveer Shahzad', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'FINN 353', title: 'Investments', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Talha Farrukh', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'FINN 372', title: 'Actuarial Sciences and Insurance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Nauman Afzal Cheema', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'FINN 373', title: 'Fundamentals of Actuarial Mathematics I', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Syed', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: '204, SDSB' },
    ],
  },
  {
    code: 'FINN 400', title: 'Applied Corporate Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Aun Raza Rizvi', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'A-7, Academic Block' },
      { id: 'S2', instructor: 'Syed Aun Raza Rizvi', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'A-4, Academic Block' },
    ],
  },
  {
    code: 'FINN 403', title: 'Financial Modelling', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Talha Farrukh', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'Sohail Aslam Lab' },
    ],
  },
  {
    code: 'FINN 441', title: 'Islamic Banking and Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Saad Azmat', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: '201, SDSB' },
    ],
  },
  {
    code: 'FINN 453', title: 'Financial Derivatives', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Ayesha Ahmad', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'A-4, Academic Block' },
    ],
  },
  {
    code: 'FINN 454', title: 'Portfolio Management', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Kumail Abbas Rizvi', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'FINN 8201', title: 'Mathematical Modeling', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', cadence: 'Once a week - 180 min' },
    ],
  },

  // Law
  {
    code: 'GSL 101', title: 'Pakistan Studies and Legal History', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Asad Rahim Khan', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
      { id: 'S2', instructor: 'Marva Khan', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'Syed Babar Ali CR 0-01' },
      { id: 'S3', instructor: 'Saad Amir', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'Syed Babar Ali CR 0-01' },
      { id: 'S4', instructor: 'Muhammad Azeem', meets: 'Tue & Thu, 6:00 PM - 7:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'GSL 103', title: 'Chinese Language for Beginners (HSK Level 2)', credits: 4, department: 'Law',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Hui Qi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 471', title: 'Civil Procedure', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Fahad Malik', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'Moot Court' },
      { id: 'S2', instructor: 'Azwar Shakeel', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'CR 1-07, SAHSOL' },
    ],
  },
  {
    code: 'LAW 116', title: 'Introduction to Legal Systems and Reasoning', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Aisha Ahmad', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-5, Academic Block' },
      { id: 'S2', instructor: 'Raza Saeed', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-10, Academic Block' },
      { id: 'S3', instructor: 'Madiha Talat', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'Moot Court' },
      { id: 'S4', instructor: 'Ayesha Alam Malik', meets: 'Tue & Thu, 6:00 PM - 7:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'LAW 117', title: 'Law and Social Compact', credits: 2, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Aisha Ahmad & Asad Rahim Khan', meets: 'Thu, 4:00 PM - 5:50 PM', room: 'MCB A-13, Academic Block' },
      { id: 'S2', instructor: 'Marva Khan & Raza Saeed', meets: 'Fri, 10:00 AM - 11:50 AM', room: 'Abdul Razak Dawood CR 0-07' },
      { id: 'S3', instructor: 'Madiha Talat & Saad Amir', meets: 'Fri, 2:00 PM - 3:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
      { id: 'S4', meets: 'Thu, 6:00 PM - 7:50 PM', room: 'SBACR 0-01, SAHSOL' },
    ],
  },
  {
    code: 'LAW 220', title: 'Contracts', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Faiza', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'CR 1-07, SAHSOL' },
      { id: 'S2', instructor: 'Sheharyar Sikander Hamid', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'Syed Babar Ali CR 0-01' },
      { id: 'S3', instructor: 'Sheharyar Sikander Hamid', meets: 'Mon & Wed, 3:30 PM - 5:20 PM', room: 'Syed Babar Ali CR 0-01' },
    ],
  },
  {
    code: 'LAW 222', title: 'Torts', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Syeda Zehra Zaidi', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'A-9, Academic Block' },
      { id: 'S2', instructor: 'Ahmed Hasan Khan', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'LAW 240', title: 'Criminal Law', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Angbeen Atif Mirza', meets: 'Mon & Wed, 1:30 PM - 3:20 PM', room: 'A-14, Academic Block' },
      { id: 'S2', instructor: 'Angbeen Atif Mirza', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'CR 1-01, SAHSOL' },
      { id: 'S3', instructor: 'Marva Khan', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'LAW 280', title: 'Legal Practice I: Legal Writing and Research Methods', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Nabia Khawar', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-9, Academic Block' },
      { id: 'S2', instructor: 'Adnan Sattar', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
      { id: 'S3', instructor: 'Syeda Zehra Zaidi', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'LAW 303', title: 'Advanced Writing from the Trial', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Sarah Humayun', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: '205, SDSB' },
    ],
  },
  {
    code: 'LAW 3203', title: 'Introduction to Legal Aspects of Merger and Acquisition law in Pakistan', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Ali Awais', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'LAW 326', title: 'Intellectual Property Law', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Maria Farrukh Irfan Khan', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'Syed Babar Ali CR 0-01' },
    ],
  },
  {
    code: 'LAW 352', title: 'Public International Law', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Sikandar Ahmed Shah', meets: 'Mon & Wed, 9:00 AM - 10:50 AM', room: 'Block 10-304, SSE' },
      { id: 'S2', instructor: 'Ayesha Alam Malik', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'LAW 353', title: 'Human Rights', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Adnan Sattar', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'LAW 4505', title: 'Business and Human Rights: A Critical Legal Perspective from the South', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azeem', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'LAW 472', title: 'Criminal Procedure', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Haider Rasul Mirza', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'LAW 4812', title: 'Legal Practice II: Legal Instruments', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Summaiya Zaidi', meets: 'Mon & Wed, 11:30 AM - 1:20 PM', room: 'CR 2-01, SAHSOL' },
      { id: 'S2', instructor: 'Summaiya Zaidi', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'Mirza Muhammad Abdullah CR1-02' },
    ],
  },
  {
    code: 'LAW 4903', title: 'Topics in Law and Economics', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Uzair Kayani', meets: 'Mon & Wed, 11:00 AM - 12:50 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'LAW 4906', title: 'LUMS Law Clinic', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Maira Mumtaz', meets: 'Tue & Thu, 11:00 AM - 12:50 PM', room: 'A-2, Academic Block' },
    ],
  },
  {
    code: 'LAW 502', title: 'Advanced Legal Writing', credits: 3, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Uzair Kayani', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'LAW 582', title: 'Alternate Dispute Resolution', credits: 3, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Maria Farooq', meets: 'Mon & Wed, 4:30 PM - 5:45 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },

  // Gender Studies
  {
    code: 'GSS 210', title: 'Introduction to Gender and Sexuality Studies', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Sameera Abbas', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'SS, Academic Block' },
    ],
  },
  {
    code: 'GSS 212', title: 'Women\'s Lives Across Cultures', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Rabia Kamal', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-12, Academic Block' },
    ],
  },
  {
    code: 'GSS 315', title: 'Masculinities', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Nida Yasmeen Kirmani', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'GSS 316', title: 'Gender Economics', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Hana Zahir', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'GSS 3603', title: 'Ethics of Romantic Love', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Samira Musleh', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: '205, SDSB' },
    ],
  },
  {
    code: 'GSS 4112', title: 'Gender and the Labor Market', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Hadia Majid', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'GSS 414', title: 'Sex and the State', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Ghazal Asif', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
    ],
  },

  // History
  {
    code: 'HIST 100', title: 'Introduction to Historical Studies', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Ali Usman Qasmi', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'SS, Academic Block' },
    ],
  },
  {
    code: 'HIST 127', title: 'A Peoples History of Pakistan', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Ilyas Ahmad Chattha', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'HIST 215', title: 'Buddhist Art and Architecture in the Subcontinent', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Nadhra Shahbaz Naeem Khan', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'MCB A-13, Academic Block' },
    ],
  },
  {
    code: 'HIST 218', title: 'Nineteenth Century French Art: Neoclassicism to Impressionism', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Nadhra Shahbaz Naeem Khan', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'HIST 2304', title: 'The making of the Islamic world', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Essam Fahim', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'HIST 292', title: 'Introduction to Sanskrit', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Shahid Rasheed', meets: 'Tue & Thu, 4:30 PM - 6:20 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },
  {
    code: 'HIST 3204', title: 'The Past is a Foreign Country: Memory, Myth and Historical Storytelling', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Saman Tariq Malik', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'HIST 3215', title: 'Imperialism and its Discontents in South Asia', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Raza', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'HIST 3314', title: 'Technology and Social Change', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Waqar Zaidi', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'MCB A-13, Academic Block' },
    ],
  },
  {
    code: 'HIST 372', title: 'US Imperialism', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Ameem Lutfi', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: '305, SDSB' },
    ],
  },

  // Humanities & Social Sciences
  {
    code: 'HSS 101', title: 'First Year Advising Tutorial', credits: 0.5, department: 'Humanities & Social Sciences',
    sections: [
      { id: 'S1', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S10', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S11', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S12', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S13', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S14', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S15', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S16', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S17', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S18', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S19', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S2', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S20', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S21', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S3', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S4', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S5', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S6', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S7', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S8', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S9', meets: 'Fri, 10:00 AM - 12:50 PM' },
    ],
  },

  // Humanities
  {
    code: 'HUM 500', title: 'Theories and Methods in the Humanities', credits: 3, department: 'Humanities',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Mian Muhammad Nauman Faizi & Muhammad Ali Raza', meets: 'Tue, 3:30 PM - 6:20 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'HUM 512', title: 'Historical Methods', credits: 3, department: 'Humanities',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Ilyas Ahmad Chattha & Ameem Lutfi', meets: 'Mon, 2:00 PM - 4:50 PM', room: 'HSS Boardroom (1-0087)' },
    ],
  },

  // Languages
  {
    code: 'LANG 1202', title: 'Arabic for Quran', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Hafiz Abdul Qadeer', meets: 'Tue & Thu, 4:30 PM - 6:20 PM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'LANG 1204', title: 'Kashmiri I', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Khawaja Zahid Aziz', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'CR 1-06, SAHSOL' },
    ],
  },
  {
    code: 'LANG 122', title: 'Introduction to Balochi Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Hameed Ullah', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'CR 1-06, SAHSOL' },
    ],
  },
  {
    code: 'LANG 123', title: 'Introduction to Punjabi Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Zahid Hussain', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'CR 2-02, SAHSOL' },
    ],
  },
  {
    code: 'LANG 124', title: 'Introduction to Arabic Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Hafiz Abdul Qadeer', meets: 'Mon & Wed, 4:30 PM - 6:20 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'LANG 127', title: 'Introduction to Persian Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Samina Arifa', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'Mirza Muhammad Abdullah CR1-02' },
      { id: 'S2', instructor: 'Samina Arifa', meets: 'Tue & Thu, 2:30 PM - 4:20 PM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'LANG 128', title: 'Sindhi for Non-Sindhi Speakers', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Ashok Kumar Khatri', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
      { id: 'S2', instructor: 'Ashok Kumar Khatri', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
    ],
  },
  {
    code: 'LANG 129', title: 'Pashto for Non-Native Speakers', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Imad', meets: 'Mon & Wed, 11:00 AM - 12:50 PM', room: 'A-6, Academic Block' },
      { id: 'S2', instructor: 'Imad', meets: 'Tue & Thu, 11:00 AM - 12:50 PM', room: 'Syed Babar Ali CR 0-01' },
    ],
  },
  {
    code: 'LANG 2207', title: 'Enhancing Urdu Reading and Writing Skills', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Zahid Hussain', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'LANG 2208', title: 'Introduction to Sanskrit', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Shahid Rasheed', meets: 'Tue & Thu, 4:30 PM - 6:20 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },

  // Mathematics
  {
    code: 'MATH 100', title: 'Pre-Calculus', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Arhum Naseem Khawaja', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Arhum Naseem Khawaja', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 9-B2, SSE' },
      { id: 'S3', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'MATH 101', title: 'Calculus I', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Waqas Ali Azhar', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Block 9-B2, SSE' },
      { id: 'S2', instructor: 'Waqas Ali Azhar', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'B-3, SDSB' },
      { id: 'S3', instructor: 'Imran Anwar', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: 'Block 9-B2, SSE' },
      { id: 'S4', instructor: 'Adnan Khan', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'B-3, SDSB' },
      { id: 'S5', instructor: 'Omar Khawar Malik', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'MATH 101H', title: 'Calculus I (Honours)', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 102', title: 'Calculus II', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Sultan Sial', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'B-3, SDSB' },
      { id: 'S2', instructor: 'Sultan Sial', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Programming Studio' },
    ],
  },
  {
    code: 'MATH 120', title: 'Linear Algebra with Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Reza Abdolmaleki', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'MATH 204', title: 'Introduction to Formal Mathematics', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Shaheen Nazir', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'MATH 210', title: 'Introduction to Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-201, SSE' },
    ],
  },
  {
    code: 'MATH 212', title: 'Mathematical Modelling and Communication', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Ali Ashher Zaidi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 222', title: 'Linear Algebra II', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Haniya Azam', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'MATH 232', title: 'Introduction to Game Theory', credits: 4, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Lyyla Khalid', meets: 'Tue & Thu, 9:00 AM - 10:50 AM', room: 'Syed Babar Ali CR 0-01' },
      { id: 'S2', instructor: 'Lyyla Khalid', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'MATH 252', title: 'Discrete Mathematics', credits: 4, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Mudassir Shabbir', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'Block 10-301, SSE' },
      { id: 'S2', instructor: 'Mudassir Shabbir', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'Block 10-301, SSE' },
    ],
  },
  {
    code: 'MATH 3012', title: 'Introduction to Nonlinear Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Imran Anwar', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'CR 2-01, SAHSOL' },
    ],
  },
  {
    code: 'MATH 309', title: 'Introduction to Analysis II', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Qaisar Mehmood', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'MATH 341', title: 'Operations Research I', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: '203, SDSB' },
    ],
  },
  {
    code: 'MATH 407', title: 'General Topology', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Haniya Azam', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'MATH 412', title: 'Partial Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Ali Ashher Zaidi', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'MATH 437', title: 'Applied Stochastic Processes', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Adnan Khan', meets: 'Mon & Wed, 2:30 PM - 3:45 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'MATH 439', title: 'Applied Probability', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'MATH 4418', title: 'Numerical Linear Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Waqas Ali Azhar', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'MATH 507', title: 'Advanced General Topology', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Haniya Azam', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'MATH 513', title: 'Advanced Partial Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Ali Ashher Zaidi', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'MATH 521', title: 'Advanced Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Reza Abdolmaleki', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },
  {
    code: 'MATH 535', title: 'Advanced Applied Stochastic Process', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Adnan Khan', meets: 'Mon & Wed, 2:30 PM - 3:45 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'MATH 543', title: 'Advanced Numerical Linear Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Waqas Ali Azhar', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'MATH 547', title: 'Operational Research I', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: '203, SDSB' },
    ],
  },

  // Managerial Economics
  {
    code: 'MECO 111', title: 'Principles of Microeconomics', credits: 3, department: 'Managerial Economics',
    sections: [
      { id: 'S1', instructor: 'Abid Raza Khan', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: '101, SDSB' },
      { id: 'S2', instructor: 'Abid Raza Khan', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'A-11, Academic Block' },
      { id: 'S3', instructor: 'Abid Raza Khan', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'A-7, Academic Block' },
      { id: 'S4', instructor: 'Abid Raza Khan', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: 'B-1, SDSB' },
      { id: 'S5', instructor: 'Rabia Khan', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'A-8, Academic Block' },
      { id: 'S6', instructor: 'Rabia Khan', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'A-8, Academic Block' },
      { id: 'S7', instructor: 'Misbah Tanveer Chaudhry', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'B-1, SDSB' },
      { id: 'S8', instructor: 'Misbah Tanveer Chaudhry', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MECO 121', title: 'Principles of Macroeconomics', credits: 3, department: 'Managerial Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Zahid Ali', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: '201, SDSB' },
    ],
  },
  {
    code: 'MECO 2201', title: 'Introduction to Business Economics', credits: 1.5, department: 'Managerial Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Zahid Ali', meets: 'Daily, 4:30 PM - 6:40 PM', room: '103, SDSB' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'MECO 5201', title: 'Business Economics', credits: 1.5, department: 'Managerial Economics',
    sections: [
      { id: 'S1', instructor: 'Misbah Tanveer Chaudhry', meets: 'Fri, Sat, Sun, 2:00 PM - 4:00 PM', room: '201, SDSB' },
      { id: 'S2', instructor: 'Misbah Tanveer Chaudhry', meets: 'Fri, Sat, Sun, 8:30 AM - 10:30 AM', room: '204, SDSB' },
      { id: 'S3', instructor: 'Misbah Tanveer Chaudhry', meets: 'Fri, Sat, Sun, 10:45 AM - 12:45 PM', room: '203, SDSB' },
      { id: 'S4', instructor: 'Syed Zahid Ali', meets: 'Fri, Sat, Sun, 2:00 PM - 4:00 PM', room: '101, SDSB' },
    ],
  },

  // Management
  {
    code: 'MGMT 142', title: 'Principles of Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Mujeeb Rashid', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: '201, SDSB' },
      { id: 'S2', instructor: 'Mujeeb Rashid', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: '201, SDSB' },
      { id: 'S3', instructor: 'Mohsin Bashir', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'A-4, Academic Block' },
      { id: 'S4', instructor: 'Muhammad Aneeq Ismail', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'B-2, SDSB' },
      { id: 'S5', instructor: 'Muhammad Aneeq Ismail', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'B-1, SDSB' },
      { id: 'S6', instructor: 'Zainab Amir', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-11, Academic Block' },
      { id: 'S7', instructor: 'Zainab Amir', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: '201, SDSB' },
      { id: 'S8', instructor: 'Zainab Anjum', meets: 'Tue & Thu, 8:00 AM - 9:15 AM', room: 'A-7, Academic Block' },
    ],
  },
  {
    code: 'MGMT 212', title: 'Business Communication', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'A-8, Academic Block' },
      { id: 'S2', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: '101, SDSB' },
      { id: 'S3', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: '101, SDSB' },
      { id: 'S4', instructor: 'Mehr Farhan Cheema', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-3, Academic Block' },
      { id: 'S5', instructor: 'Mehr Farhan Cheema', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'A-11, Academic Block' },
      { id: 'S6', instructor: 'Jazib Zahir', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'MGMT 242', title: 'Business Ethics and Corporate Social Responsibility', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Razi Allah Lone', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'B-1, SDSB' },
      { id: 'S2', instructor: 'Razi Allah Lone', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: '203, SDSB' },
      { id: 'S3', instructor: 'Razi Allah Lone', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: '203, SDSB' },
    ],
  },
  {
    code: 'MGMT 244', title: 'Reforming The Public Sector', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ajmal', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'MGMT 247', title: 'Public Financial Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Sajid Siddique', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'MGMT 252', title: 'Logic and Critical Thinking', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Shabbir Ahsen', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'A-3, Academic Block' },
    ],
  },
  {
    code: 'MGMT 260', title: 'Business Law', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ali Sultan', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: 'A-1, Academic Block' },
      { id: 'S2', instructor: 'Ali Sultan', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'A-1, Academic Block' },
      { id: 'S3', instructor: 'Ali Sultan', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'MGMT 2601', title: 'Introduction to Management', credits: 1.5, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghulam Ali Arain', meets: 'Daily, 2:00 PM - 4:10 PM', room: '103, SDSB' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'MGMT 261', title: 'Introduction to Policy Analysis', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghazal Mir Zulfiqar', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MGMT 263', title: 'Contemporary Social Policy Issues in Pakistan', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ahsan Rana', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-7, Academic Block' },
    ],
  },
  {
    code: 'MGMT 348', title: 'Internet Governance and Technology Policy', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Gulalai Khan', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'A-4, Academic Block' },
    ],
  },
  {
    code: 'MGMT 365', title: 'Urban Planning and Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Suleman Ghani', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'MGMT 373', title: 'Personal Effectiveness', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azfar Nisar', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: '201, SDSB' },
    ],
  },
  {
    code: 'MGMT 386', title: 'Business, Government, and Society', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghazal Mir Zulfiqar', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MGMT 387', title: 'Managing Diverse People and Organizations', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ayesha Masood', meets: 'Mon & Wed, 12:30 PM - 1:45 PM', room: 'A-7, Academic Block' },
    ],
  },
  {
    code: 'MGMT 389', title: 'Fashion Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Sahar Atif', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'A-3, Academic Block' },
    ],
  },
  {
    code: 'MGMT 400', title: 'Strategic Business Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'A-4, Academic Block' },
      { id: 'S2', instructor: 'Adnan Zahid', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: '204, SDSB' },
      { id: 'S3', instructor: 'Anjum Fayyaz', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MGMT 481', title: 'Entrepreneurship', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Sahar Atif', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'MGMT 8402', title: 'Foundation of Management Research', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghulam Ali Arain', meets: 'Fri, 9:00 AM - 12:00 PM', room: '106, SDSB' },
    ],
  },
  {
    code: 'MGMT 8403', title: 'Applications of Psychology in Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Jawad Sarwar Naqvi Syed', meets: 'Tue, 9:00 AM - 12:00 PM', room: '106, SDSB' },
    ],
  },
  {
    code: 'MGMT 8404', title: 'Pedagogy', credits: 2, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Shakeel Sadiq Jajja', meets: 'Fri, 10:00 AM - 1:00 PM', room: '102, SDSB' },
    ],
  },

  // Marketing
  {
    code: 'MKTG 201', title: 'Principles of Marketing', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Komal Zain', meets: 'Mon & Wed, 9:30 AM - 10:45 AM', room: 'A-8, Academic Block' },
      { id: 'S2', instructor: 'Komal Zain', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: '101, SDSB' },
      { id: 'S3', instructor: 'Aaminah Zaman Malik', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: '101, SDSB' },
      { id: 'S4', instructor: 'Mahira Ilyas', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: '201, SDSB' },
      { id: 'S5', instructor: 'Saima Mujtaba Rana', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'MKTG 222', title: 'Retail Management', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Mahira Ilyas', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: '203, SDSB' },
    ],
  },
  {
    code: 'MKTG 2401', title: 'Introduction to Marketing', credits: 1.5, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Saima Mujtaba Rana', meets: 'Daily, 8:30 AM - 10:40 AM', room: '103, SDSB' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'MKTG 302', title: 'Digital Marketing', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Komal Zain', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MKTG 324', title: 'Integrated Marketing Communications', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Mehroz Sajjad', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'MKTG 332', title: 'Consumer Behaviour', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Ateeq Abdur Rauf', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: '101, SDSB' },
    ],
  },
  {
    code: 'MKTG 343', title: 'Marketing Models', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Muhammad Asim', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'MKTG 344', title: 'Data Driven Marketing', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Aleena Iqtidar', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'MKTG 345', title: 'Data Analytics for New Product Development', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Muhammad Asim', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'Trading Lab, SDSB' },
    ],
  },
  {
    code: 'MKTG 392', title: 'Brand Management', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Ismail Hussain Naqvi', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'MKTG 5401', title: 'Marketing Management', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Usman Iqbal Bhatty', meets: 'Fri, Sat, Sun, 4:30 PM - 6:30 PM', room: '201, SDSB' },
      { id: 'S2', instructor: 'Ateeq Abdul Rauf', meets: 'Fri, Sat, Sun, 2:00 PM - 4:00 PM', room: '204, SDSB' },
      { id: 'S3', instructor: 'Usman Iqbal Bhatty', meets: 'Fri, Sat, Sun, 2:00 PM - 4:00 PM', room: '203, SDSB' },
    ],
  },

  // Organisational Science
  {
    code: 'ORSC 201', title: 'Organizational Behaviour', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Aneeq Ismail', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'B-1, SDSB' },
      { id: 'S2', instructor: 'Mohsin Bashir', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: '101, SDSB' },
      { id: 'S3', instructor: 'Fiza Kanwal', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Block 10-202, SSE' },
      { id: 'S4', instructor: 'Zainab Anjum', meets: 'Mon & Wed, 8:00 AM - 9:15 AM', room: '204, SDSB' },
      { id: 'S5', instructor: 'Faiza Ali', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'B-1, SDSB' },
    ],
  },
  {
    code: 'ORSC 341', title: 'Human Resource Management', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'S1', instructor: 'Faiza Ali', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'B-2, SDSB' },
    ],
  },
  {
    code: 'ORSC 5301', title: 'Organizations and Leadership', credits: 1.5, department: 'Organisational Science',
    sections: [
      { id: 'S1', instructor: 'Ghulam Ali Arain', meets: 'Fri, Sat, Sun, 2:00 PM - 4:00 PM', room: '201, SDSB' },
      { id: 'S2', meets: 'Fri, Sat, Sun, 8:30 AM - 10:30 AM', room: '204, SDSB' },
      { id: 'S3', instructor: 'Faiza Ali', meets: 'Fri, Sat, Sun, 10:45 AM - 12:45 PM', room: '203, SDSB' },
      { id: 'S4', meets: 'Fri, Sat, Sun, 4:30 PM - 6:30 PM', room: '203, SDSB' },
    ],
  },
  {
    code: 'ORSC 8201', title: 'Seminar in Organization Theory', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Salma Zaman', meets: 'Mon, 9:00 AM - 12:00 PM', room: '106, SDSB' },
    ],
  },
  {
    code: 'ORSC 8402', title: 'Seminar in Human Resource Management', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Abdur Rahman Malik', meets: 'Tue, 9:00 AM - 12:00 PM', room: '102, SDSB' },
    ],
  },

  // Philosophy
  {
    code: 'PHIL 102', title: 'Philosophy Gym', credits: 4, department: 'Philosophy',
    sections: [
      { id: 'S1', instructor: 'Amber Riaz', meets: 'Tue & Thu, 11:00 AM - 12:50 PM', room: 'SS, Academic Block' },
      { id: 'S2', instructor: 'Amber Riaz', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'CR 1-07, SAHSOL' },
    ],
  },

  // Physics
  {
    code: 'PHY 101', title: 'Mechanics', credits: 4, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'B-3, SDSB' },
      { id: 'S2', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', meets: 'Tue & Thu, 10:30 AM - 11:45 AM', room: 'B-3, SDSB' },
      { id: 'R1', component: 'Recitation', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', meets: 'Mon, 11:30 AM - 12:20 PM', room: 'Block 9-B2, SSE' },
      { id: 'R2', component: 'Recitation', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', meets: 'Fri, 9:00 AM - 9:50 AM', room: 'Block 9-B2, SSE' },
    ],
  },
  {
    code: 'PHY 204', title: 'Electricity and Magnetism', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Rizwan Khalid', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'PHY 212', title: 'Quantum Mechanics I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'PHY 223', title: 'Mathematical Methods in Physics and Engineering I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },
  {
    code: 'PHY 300', title: 'Experimental Physics Lab II', credits: 3, department: 'Physics',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Hamza Humayun', meets: 'Mon, 8:00 AM - 4:50 PM', room: 'PHY Computational Lab, SSE' },
    ],
  },
  {
    code: 'PHY 301', title: 'Classical Mechanics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Tajdar Mufti', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'PHY 305', title: 'Electromagnetic Fields and Waves', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Muhammad Imran Cheema', meets: 'Tue & Thu, 12:30 PM - 1:45 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'PHY 307', title: 'Fundamentals of Astronomy – I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 313', title: 'Statistical Mechanics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Aeysha Khalique', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'PHY 335', title: 'Molecular Symmetry I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', meets: 'Tue & Thu, 3:30 PM - 4:45 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'PHY 404', title: 'Relativistic Electrodynamics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Tajdar Mufti', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'PHY 500', title: 'Graduate Physics Lab', credits: 3, department: 'Physics',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Hamza Humayun', meets: 'Mon, 8:00 AM - 4:50 PM', room: 'PHY Computational Lab, SSE' },
    ],
  },
  {
    code: 'PHY 504', title: 'Relativistic Electrodynamics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Tajdar Mufti', meets: 'Tue & Thu, 11:00 AM - 12:15 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'PHY 506', title: 'Fundamentals of Astronomy – I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 510', title: 'Advanced Statistical Mechanics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Aeysha Khalique', meets: 'Tue & Thu, 9:30 AM - 10:45 AM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'PHY 5313', title: 'Atomic and Laser Physics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Adam Zaman Chaudhry', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'B-3, SDSB' },
    ],
  },
  {
    code: 'PHY 603', title: 'Machine Learning for Physics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Nauman Zafar Butt', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-302, SSE' },
    ],
  },

  // Political Science
  {
    code: 'POL 320', title: 'Comparative Politics', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Asma ul-Husna Faiz', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-9, Academic Block' },
    ],
  },
  {
    code: 'POL 100', title: 'Introduction to Political Science', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mohammad Hamza Iftikhar', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'A-4, Academic Block' },
      { id: 'S2', instructor: 'Shahab ud Din Ahmad', meets: 'Mon & Wed, 8:00 AM - 9:50 AM', room: 'SS, Academic Block' },
      { id: 'S3', instructor: 'Mariam Farooq Awan', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-12, Academic Block' },
    ],
  },
  {
    code: 'POL 203', title: 'Introduction to Political Theory', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Adeel Hamza', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'SS, Academic Block' },
      { id: 'S2', instructor: 'Muhammad Shabbir Ahsen', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-12, Academic Block' },
    ],
  },
  {
    code: 'POL 229', title: 'Politics of Armed Groups', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mariam Farooq Awan', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'POL 268', title: 'Master Narratives: Minding Gender and Media Gaps', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Maria Amir', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'POL 272', title: 'Shakespeare and Political Philosophy', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Adeel Hamza', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-1, Academic Block' },
    ],
  },
  {
    code: 'POL 273', title: 'Islam, Caste, and Political Power: Lineage and Sovereignty from Arabia to South Asia', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Ateeb Ahmed', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-12, Academic Block' },
    ],
  },
  {
    code: 'POL 3202', title: 'Qualitative Research Methods in Political Science', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Younis Sarwer', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-14, Academic Block' },
    ],
  },
  {
    code: 'POL 324', title: 'Marxism and the Modern World', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Taimur Rahman', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-10, Academic Block' },
    ],
  },
  {
    code: 'POL 3302', title: 'Theories of IR', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Younis Sarwer', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'POL 335', title: 'Revolutionary War and Counterinsurgency', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Ahmad Mujtaba Siddiqi', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: '305, SDSB' },
    ],
  },
  {
    code: 'POL 338', title: 'Environmental Governance', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'POL 353', title: 'US Foreign Policy', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mohammad Hamza Iftikhar', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'POL 379', title: 'US Imperialism', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Ameem Lutfi', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: '305, SDSB' },
    ],
  },
  {
    code: 'POL 382', title: 'Ethnic Conflict and Conflict Resolution', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Hafiz Muhammad Salman Rafi', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: '205, SDSB' },
    ],
  },
  {
    code: 'POL 383', title: 'Ring Shout’: The Slave Narrative and Its Legacy', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Sadia Zulfiqar', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'POL 384', title: 'Institutions and Institutional Changes', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Shahab ud Din Ahmad', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-10, Academic Block' },
    ],
  },
  {
    code: 'POL 385', title: 'Constitutional Development in Pakistan', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mohammad Waseem', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'POL 464', title: 'Political Sociology', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Umair Javed', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
    ],
  },

  // Psychology
  {
    code: 'PSY 100', title: 'Introduction to Psychology and Human Behavior', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Imran Rashid', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'CR 1-01, SAHSOL' },
      { id: 'S2', instructor: 'Arman Ashraf', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'A-12, Academic Block' },
      { id: 'S3', instructor: 'Humair Yusuf', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'SS, Academic Block' },
      { id: 'S4', meets: 'Mon & Wed, 8:00 AM - 9:50 AM', room: 'A-3, Academic Block' },
    ],
  },
  {
    code: 'PSY 201', title: 'Cognition', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Yasser Hashmi', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'PSY 212', title: 'Theories of Learning', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Imran Rashid', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'PSY 214', title: 'Perception', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Yasser Hashmi', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'SS, Academic Block' },
    ],
  },
  {
    code: 'PSY 217', title: 'Biological Psychology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azam Khalid', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'Abdul Razak Dawood CR 0-07' },
    ],
  },
  {
    code: 'PSY 218', title: 'History of Psychology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'PSY 220', title: 'Psychopathology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azam Khalid', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'MCB A-13, Academic Block' },
    ],
  },
  {
    code: 'PSY 308', title: 'Critical Multicultural Psychology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Humair Yusuf', meets: 'Tue & Thu, 11:00 AM - 12:50 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'PSY 321', title: 'Life Span Development', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Arman Ashraf', meets: 'Tue & Thu, 10:30 AM - 12:20 PM', room: 'Block 10-304, SSE' },
    ],
  },

  // Religion
  {
    code: 'REL 215', title: 'Sufism: Key Texts and Cultural Practices', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Baqar Hassan Syed', meets: 'Tue & Thu, 1:30 PM - 3:20 PM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'REL 222', title: 'Buddhist Art and Architecture in the Subcontinent', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Nadhra Shahbaz Naeem Khan', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'MCB A-13, Academic Block' },
    ],
  },
  {
    code: 'REL 252', title: 'Introduction to Anthropology of Religion', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Dominic William Esler', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-15, Academic Block' },
    ],
  },
  {
    code: 'REL 263', title: 'The making of the Islamic world', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Essam Fahim', meets: 'Tue & Thu, 4:00 PM - 5:50 PM', room: 'A-16, Academic Block' },
    ],
  },
  {
    code: 'REL 315', title: 'Religion and Existentialism', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Mian Muhammad Nauman Faizi', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'Block 10-204, SSE' },
    ],
  },
  {
    code: 'REL 318', title: 'Ethics of Romantic Love', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Samira Musleh', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: '205, SDSB' },
    ],
  },

  // Science
  {
    code: 'SCI 5203', title: 'Physics-informed machine learning', credits: 3, department: 'Science',
    sections: [
      { id: 'S1', instructor: 'Nauman Zafar Butt', meets: 'Mon & Wed, 11:00 AM - 12:15 PM', room: 'Block 10-302, SSE' },
    ],
  },
  {
    code: 'SCP 500', title: 'Theory and the Social Sciences', credits: 3, department: 'Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Amen Jaffer & Asma ul-Husna Faiz', meets: 'Thu, 11:00 AM - 1:50 PM', room: '203, SDSB' },
    ],
  },
  {
    code: 'SCP 512', title: 'Politics and Development in the Global South', credits: 3, department: 'Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Umair Javed', meets: 'Fri, 10:00 AM - 12:50 PM', room: 'A-2, Academic Block' },
    ],
  },

  // Supply Chain Management
  {
    code: 'SCRM 6101', title: 'Operations and Supply Chain Strategy', credits: 3, department: 'Supply Chain Management',
    sections: [
      { id: 'S1', instructor: 'Ahsan Umar', meets: 'Fri, Sat, Sun, 10:45 AM - 12:45 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'SCRM 6303', title: 'Supply Chain Systems and Analytics', credits: 3, department: 'Supply Chain Management',
    sections: [
      { id: 'S1', instructor: 'Tabjeel Ashraf', meets: 'Fri, Sat, Sun, 5:30 PM - 7:30 PM', room: '104, SDSB' },
    ],
  },
  {
    code: 'SCRM 6401', title: 'Applied Research and Analysis', credits: 3, department: 'Supply Chain Management',
    sections: [
      { id: 'S1', instructor: 'Sheikh Attique Ur Rehman', meets: 'Sat & Sun, 4:30 PM - 6:30 PM', room: 'Trading Lab, SDSB' },
    ],
  },

  // Sociology
  {
    code: 'SOC 100', title: 'Introduction to Sociology', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Aftab Nasir', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'CR 1-07, SAHSOL' },
    ],
  },
  {
    code: 'SOC 223', title: 'Sociology of Education', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Tania Saeed', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'CR 1-01, SAHSOL' },
    ],
  },
  {
    code: 'SOC 226', title: 'Disasters and Society', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', meets: 'Tue & Thu, 1:30 PM - 3:20 PM', room: 'Block 10-304, SSE' },
    ],
  },
  {
    code: 'SOC 265', title: 'Introduction to Gender and Sexuality Studies', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Sameera Abbas', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'SS, Academic Block' },
    ],
  },
  {
    code: 'SOC 310', title: 'Classical Sociological Theory', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Amen Jaffer', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'SOC 346', title: 'The Politics of Resources', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Ali Nobil Ahmad', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'SOC 364', title: 'Masculinities', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Nida Yasmeen Kirmani', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: '204, SDSB' },
    ],
  },
  {
    code: 'SOC 373', title: '"Indigenous" Knowledge(s) Through a Sociological Lens', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Aftab Nasir', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: '305, SDSB' },
    ],
  },
  {
    code: 'SOC 412', title: 'Political Sociology', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Umair Javed', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
    ],
  },
  {
    code: 'SOC 462', title: 'Sociology of Emotions', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Tania Saeed', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'CR 2-01, SAHSOL' },
    ],
  },

  // Social Sciences
  {
    code: 'SS 100A', title: 'Introduction to Writing', credits: 2, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Anam Hassan', meets: 'Mon & Wed, 5:30 PM - 6:20 PM', room: 'A-1, Academic Block' },
      { id: 'S2', instructor: 'Uzma Safdar', meets: 'Mon & Wed, 5:30 PM - 6:20 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
      { id: 'S3', instructor: 'Uzma Safdar', meets: 'Tue & Thu, 10:00 AM - 10:50 AM', room: 'CR 2-01, SAHSOL' },
      { id: 'S4', instructor: 'Afsheen Salahuddin', meets: 'Tue & Thu, 11:00 AM - 11:50 AM', room: 'Sheikh Irshad Ahmed CR 0-06' },
      { id: 'S5', instructor: 'Anam Hassan', meets: 'Mon & Wed, 2:00 PM - 2:50 PM', room: 'Block 10-202, SSE' },
    ],
  },
  {
    code: 'SS 100', title: 'Writing and Communication', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Mahrukh Baig', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'CR 1-06, SAHSOL' },
      { id: 'S10', instructor: 'Aneeqa Mazhar Wattoo', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'Mirza Muhammad Abdullah CR1-02' },
      { id: 'S11', instructor: 'Sana Mohsin', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'CR 1-06, SAHSOL' },
      { id: 'S12', instructor: 'Afsheen Salahuddin', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'CR 2-02, SAHSOL' },
      { id: 'S13', instructor: 'Syed Javed Nazir', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
      { id: 'S14', instructor: 'Sana Mohsin', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'CR 1-06, SAHSOL' },
      { id: 'S15', instructor: 'Uzma Safdar', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'CR 2-02, SAHSOL' },
      { id: 'S16', instructor: 'Zainab Sattar', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'CR 2-07, SAHSOL' },
      { id: 'S17', instructor: 'Sheikh Taha Munir', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'CR 2-02, SAHSOL' },
      { id: 'S18', instructor: 'Hajra Ikram Butt', meets: 'Tue & Thu, 8:00 AM - 9:50 AM', room: 'CR 1-06, SAHSOL' },
      { id: 'S19', instructor: 'Zoya Mirza', meets: 'Tue & Thu, 9:30 AM - 11:20 AM', room: 'Gen. Habibullah Khan CR 0-02' },
      { id: 'S2', instructor: 'Hajra Ikram Butt', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'CR 2-07, SAHSOL' },
      { id: 'S20', instructor: 'Aamna Khalid', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'CR 2-07, SAHSOL' },
      { id: 'S21', instructor: 'Syeda Habibah Hussain Rizvi', meets: 'Mon & Wed, 11:00 AM - 12:50 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
      { id: 'S22', instructor: 'Farhana Shahzad', meets: 'Mon & Wed, 1:30 PM - 3:20 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
      { id: 'S23', instructor: 'Huda Imtiaz', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'Mirza Muhammad Abdullah CR1-02' },
      { id: 'S24', instructor: 'Syeda Habibah Hussain Rizvi', meets: 'Tue & Thu, 10:00 AM - 11:50 AM', room: 'CR 2-02, SAHSOL' },
      { id: 'S25', instructor: 'Sana Mohsin', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'Gen. Habibullah Khan CR 0-02' },
      { id: 'S26', instructor: 'Furrha Ahsan', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-2, Academic Block' },
      { id: 'S27', instructor: 'Aneeqa Mazhar Wattoo', meets: 'Mon & Wed, 3:30 PM - 5:20 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
      { id: 'S28', instructor: 'Mahrukh Baig', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'CR 2-02, SAHSOL' },
      { id: 'S29', instructor: 'Aqib Ali', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'CR 2-02, SAHSOL' },
      { id: 'S3', instructor: 'Farhana Shahzad', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-2, Academic Block' },
      { id: 'S30', instructor: 'Maria Amir', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-2, Academic Block' },
      { id: 'S4', instructor: 'Aqib Ali', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'Sheikh Irshad Ahmed CR 0-06' },
      { id: 'S5', instructor: 'Zainab Sattar', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'CR 1-06, SAHSOL' },
      { id: 'S6', instructor: 'Huda Imtiaz', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'CR 2-07, SAHSOL' },
      { id: 'S7', instructor: 'Sheikh Taha Munir', meets: 'Mon & Wed, 8:00 AM - 9:50 AM', room: 'CR 2-07, SAHSOL' },
      { id: 'S8', instructor: 'Maria Amir', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'A-2, Academic Block' },
      { id: 'S9', instructor: 'Afsheen Salahuddin', meets: 'Mon & Wed, 12:00 PM - 1:50 PM', room: 'CR 2-06, SAHSOL' },
    ],
  },
  {
    code: 'SS 101', title: 'Islamic Studies', credits: 2, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Asif Iftikhar', meets: 'Fri, 10:00 AM - 11:50 AM', room: 'SS, Academic Block' },
      { id: 'S2', instructor: 'Irfan Moeen Khan', meets: 'Fri, 8:00 AM - 9:50 AM', room: 'SS, Academic Block' },
      { id: 'S3', instructor: 'Aurangzeb Haneef', meets: 'Fri, 4:00 PM - 5:50 PM', room: 'MCB A-13, Academic Block' },
      { id: 'S4', instructor: 'Essam Fahim', meets: 'Wed, 3:30 PM - 5:20 PM', room: 'MCB A-13, Academic Block' },
      { id: 'S5', instructor: 'Baqar Hassan Syed', meets: 'Fri, 2:00 PM - 3:50 PM', room: 'MCB A-13, Academic Block' },
    ],
  },
  {
    code: 'SS 102', title: 'Pakistan Studies: Culture and Heritage', credits: 2, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Manahil Raza', meets: 'Fri, 4:00 PM - 5:50 PM', room: 'A-4, Academic Block' },
      { id: 'S2', instructor: 'Faaria Khan', meets: 'Wed, 10:00 AM - 11:50 AM', room: 'SS, Academic Block' },
      { id: 'S3', instructor: 'Faaria Khan', meets: 'Mon, 10:00 AM - 11:50 AM', room: 'SS, Academic Block' },
      { id: 'S4', instructor: 'Faaria Khan', meets: 'Fri, 10:00 AM - 11:50 AM', room: 'A-8, Academic Block' },
      { id: 'S5', instructor: 'Manahil Raza', meets: 'Fri, 2:00 PM - 3:50 PM', room: 'A-4, Academic Block' },
      { id: 'S6', instructor: 'Hafsa Omar Khawaja', meets: 'Fri, 8:00 AM - 9:50 AM', room: 'A-4, Academic Block' },
      { id: 'S7', instructor: 'Manahil Raza', meets: 'Tue, 10:00 AM - 11:50 AM', room: '203, SDSB' },
      { id: 'S8', instructor: 'Manahil Raza', meets: 'Mon, 3:30 PM - 5:20 PM', room: 'B-1, SDSB' },
      { id: 'S9', instructor: 'Faaria Khan', meets: 'Tue, 8:00 AM - 9:50 AM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'SS 103', title: 'Fehm-Ul-Quran', credits: 1, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Asif Iftikhar', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Asif Iftikhar', meets: 'Fri, 3:00 PM - 5:50 PM', room: 'A-5, Academic Block' },
    ],
  },
  {
    code: 'SS 1312', title: 'Fundamentals of Raag and Taal [Vocal and Flute]', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Muhammad Hanif', meets: 'Mon & Wed, 2:00 PM - 3:50 PM', room: 'A-6, Academic Block' },
      { id: 'S2', instructor: 'Muhammad Hanif', meets: 'Mon & Wed, 4:00 PM - 5:50 PM', room: 'A-6, Academic Block' },
    ],
  },
  {
    code: 'SS 187', title: 'Applied Statistics for Humanities', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Muhammad Salaar Arif Khan', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'Lab 1, IST' },
    ],
  },
  {
    code: 'SS 189', title: 'Data Literacy', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Zainab Sattar & 3 others', meets: 'Mon & Fri, 4:00 PM - 5:50 PM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'SS 2203', title: 'Digital Approaches to the Humanities', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Maira Rehman', meets: 'Tue & Thu, 12:00 PM - 1:50 PM', room: 'A-8, Academic Block' },
    ],
  },
  {
    code: 'SS 233', title: 'Media Writing', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Syed Javed Nazir', meets: 'Mon & Wed, 10:00 AM - 11:50 AM', room: 'A-11, Academic Block' },
    ],
  },
  {
    code: 'SS 3302', title: 'Professional Communication Skills', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Aamna Khalid', meets: 'Tue & Thu, 2:00 PM - 3:50 PM', room: 'A-10, Academic Block' },
    ],
  },

  // Science & Engineering
  {
    code: 'SSE 101', title: 'SSE Tutorials', credits: 0.5, department: 'Science & Engineering',
    sections: [
      { id: 'S1', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S10', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S11', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S12', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S13', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S14', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S15', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S16', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S17', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S18', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S19', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S2', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S20', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S21', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S22', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S23', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S24', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S25', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S26', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S27', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S28', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S29', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S3', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S30', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S31', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S32', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S33', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S34', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S35', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S36', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S37', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S4', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S5', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S6', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S7', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S8', meets: 'Fri, 10:00 AM - 12:50 PM' },
      { id: 'S9', meets: 'Fri, 10:00 AM - 12:50 PM' },
    ],
  },

  // Social Work
  {
    code: 'SWR 102', title: 'Swimming for Beginners', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Haider Awan & Chaudhary Abdul Aziz', meets: 'Tue & Thu, 10:00 AM - 11:15 AM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P2', component: 'Project', instructor: 'Rabia Yasin & Bashir Khalida', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P3', component: 'Project', instructor: 'Rashid Ahmad & Azmat Ullah', meets: 'Tue & Thu, 2:00 PM - 3:15 PM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P4', component: 'Project', instructor: 'Kausar Farooq', meets: 'Mon & Wed, 2:00 PM - 3:15 PM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P5', component: 'Project', instructor: 'Rabia Yasin & Bashir Khalida', meets: 'Tue & Thu, 12:00 PM - 1:15 PM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P6', component: 'Project', instructor: 'Muhammad Haider Awan & Chaudhary Abdul Aziz', meets: 'Mon & Wed, 12:00 PM - 1:15 PM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P7', component: 'Project', instructor: 'Kausar Farooq', meets: 'Tue & Thu, 4:00 PM - 5:15 PM', room: 'Coca-Cola Aquatic Center' },
      { id: 'P8', component: 'Project', instructor: 'Rashid Ahmad & Azmat Ullah', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Coca-Cola Aquatic Center' },
    ],
  },
  {
    code: 'SWR 103', title: 'Strength Training and Conditioning for Beginners', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Bilal Iqbal Khan', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'Gym, Sports Complex' },
      { id: 'P2', component: 'Project', instructor: 'Muhammad Shakeel', meets: 'Tue & Thu, 4:00 PM - 5:15 PM', room: 'Gym, Sports Complex' },
      { id: 'P3', component: 'Project', instructor: 'Haider Ali', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Gym, Sports Complex' },
      { id: 'P4', component: 'Project', instructor: 'Kanwal Yousaf', meets: 'Mon & Wed, 10:00 AM - 11:15 AM', room: 'Gym, Sports Complex' },
      { id: 'P5', component: 'Project', instructor: 'Aruba Naz', meets: 'Tue & Thu, 10:00 AM - 11:15 AM', room: 'Gym, Sports Complex' },
      { id: 'P6', component: 'Project', instructor: 'Shabana Kausar', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Gym, Sports Complex' },
    ],
  },
  {
    code: 'SWR 104', title: 'Basketball for Beginners', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Mohsin Riaz', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Basketball Court, Sports Complex' },
    ],
  },
  {
    code: 'SWR 105', title: 'Walk, Jog and Stretch for Fitness', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Babar Asad Khan', meets: 'Mon & Wed, 3:30 PM - 4:45 PM', room: 'Cricket Ground' },
    ],
  },
  {
    code: 'SWR 106', title: 'Squash for Beginners Course', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Qaisar Sarwar', meets: 'Mon & Wed, 4:00 PM - 5:15 PM', room: 'Squash Court, Sports Complex' },
    ],
  },
  {
    code: 'SWR 107', title: 'Badminton for Beginner Single and Doubles', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Adnan', meets: 'Tue & Thu, 5:00 PM - 6:15 PM', room: 'Badminton Court, Sports Complex' },
    ],
  },
  {
    code: 'SWR 108', title: 'Volleyball for Beginners Course', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Imran', meets: 'Mon & Wed, 5:00 PM - 6:15 PM', room: 'Volleyball Court, Sports Complex' },
    ],
  },

  // Technology Management
  {
    code: 'TME 6301', title: 'AI Applications in Business: Strategies for Technology Managers', credits: 3, department: 'Technology Management',
    sections: [
      { id: 'S1', instructor: 'Tanzeel Ur Rehman', meets: 'Fri, Sat, Sun, 3:15 PM - 5:15 PM', room: '303, SDSB' },
      { id: 'S2', instructor: 'Tanzeel Ur Rehman', meets: 'Fri, Sat, Sun, 10:45 AM - 12:45 PM', room: '303, SDSB' },
    ],
  },

];
