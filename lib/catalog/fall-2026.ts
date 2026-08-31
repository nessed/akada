import type { CatalogCourse } from './types';

/**
 * Fall 2026 course catalog - GENERATED, do not edit by hand.
 *
 * Source: Fall Semester 2026 - Course Memo.xlsx (registrar memo, one row per section).
 * Regenerate with:
 *   python scripts/build-catalog.py "Fall Semester 2026 - Course Memo.xlsx" \
 *       --out lib/catalog/fall-2026.ts --export FALL_2026 --term "Fall 2026"
 *
 * Only what the picker renders is kept: code, title, credits, department
 * and the section list. `meets` is present only for the courses whose memo
 * entry publishes a day/time on the timetable; every other section carries
 * `cadence` instead - how often it meets and for how long, which is all the
 * memo says about when those ones run.
 *
 * Pointing the app at a different term is a one-line change in
 * `lib/catalog/index.ts` - see ACTIVE_CATALOG there.
 */
export const FALL_2026: CatalogCourse[] = [
  // Accounting
  {
    code: 'ACCT 100', title: 'Principles of Financial Accounting', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Syed Zain ul Abidin', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
      { id: 'S2', instructor: 'Omair Haroon', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
      { id: 'S3', instructor: 'Omair Haroon', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S4', instructor: 'Zainab Mehmood', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
      { id: 'S5', instructor: 'Zainab Mehmood', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
      { id: 'S6', instructor: 'Zainab Mehmood', meets: 'Tue & Thu, 5:00 PM - 6:15 PM' },
      { id: 'S7', instructor: 'Saira Rizwan', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
      { id: 'S8', instructor: 'Saira Rizwan', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'ACCT 130', title: 'Principles of Management Accounting', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Ayesha Bhatti', meets: 'Fri, 9:00 AM - 10:40 AM' },
      { id: 'S2', instructor: 'Mahin Moazzam', meets: 'Fri, 9:00 AM - 10:40 AM' },
      { id: 'R1', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 11:00 AM - 11:45 AM' },
      { id: 'R2', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 12:00 PM - 12:45 PM' },
      { id: 'R3', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 2:00 PM - 2:45 PM' },
      { id: 'R4', component: 'Recitation', instructor: 'Ayesha Bhatti', meets: 'Fri, 3:00 PM - 3:45 PM' },
      { id: 'R5', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 11:00 AM - 11:45 AM' },
      { id: 'R6', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 12:00 PM - 12:45 PM' },
      { id: 'R7', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 2:00 PM - 2:45 PM' },
      { id: 'R8', component: 'Recitation', instructor: 'Mahin Moazzam', meets: 'Fri, 3:00 PM - 3:45 PM' },
    ],
  },
  {
    code: 'ACCT 202', title: 'Theory and Concepts of Accounting - Islamic Perspective', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Abdul Rauf', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'ACCT 220', title: 'Corporate Financial Reporting I', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Samia Ahmed Ali', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Samia Ahmed Ali', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
      { id: 'S3', instructor: 'Samia Ahmed Ali', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
      { id: 'S4', instructor: 'Mohib Abbas Ali', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
      { id: 'S5', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'ACCT 370', title: 'Applied Taxation', credits: 3, department: 'Accounting',
    sections: [
      { id: 'S1', instructor: 'Ayesha Bhatti', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
      { id: 'S2', instructor: 'Nafeh Akbar', cadence: 'Twice a week - 75 min' },
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
      { id: 'S1', cadence: '4 times a week - 120 min' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'ACF 5101', title: 'Financial Management and Accounting', credits: 3, department: 'Accounting & Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Mubashir Ali', cadence: '3 times a week - 120 min' },
    ],
  },

  // Artificial Intelligence
  {
    code: 'AI 500', title: 'Foundations of AI', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'AI 501', title: 'Mathematics for AI', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'AI 624', title: 'AI on Edge Devices', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'AI 630', title: 'Responsible AI Engineering', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'AI 631', title: 'Quantum Machine Learning', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'AI 651', title: 'Deep Learning for Time, Space, and Graphs', credits: 3, department: 'Artificial Intelligence',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', cadence: 'Once a week - 150 min' },
    ],
  },

  // Anthropology
  {
    code: 'ANTH 100', title: 'Introduction to Cultural Anthropology', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Sadaf Ahmad', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Rabia Kamal', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ANTH 253', title: 'Women\'s Lives Across Cultures', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Rabia Kamal', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ANTH 268', title: 'Introduction to Anthropology of Religion', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Dominic William Esler', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ANTH 320', title: 'Qualitative Research Methods', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Fizzah Sajjad', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ANTH 333', title: 'Ethics of Romantic Love', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Samira Musleh', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ANTH 453', title: 'Sex and the State', credits: 4, department: 'Anthropology',
    sections: [
      { id: 'S1', instructor: 'Ghazal Asif', cadence: 'Twice a week - 100 min' },
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
      { id: 'S1', instructor: 'Muhammad Tariq & 2 others', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 216', title: 'Molecular Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tariq & Muhammad Shoaib', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 221', title: 'Genetics', credits: 4, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tariq & Khurram Bashir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'BIO 300', title: 'Methods in Cell and Molecular Biology', credits: 4, department: 'Biology',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Tariq & 6 others', cadence: '3 times a week - 200 min' },
    ],
  },
  {
    code: 'BIO 313', title: 'Cell Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Amir Faisal & Khurram Bashir', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 331', title: 'Computational Biology II', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Laraib Iqbal Malik', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 401', title: 'Seminars in Biology', credits: 1, department: 'Biology',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Khurram Bashir', cadence: 'Once a week - 50 min' },
    ],
  },
  {
    code: 'BIO 403', title: 'Critical thinking, Scientific Writing and Ethics', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Khurram Bashir & Muhammad Shoaib', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 500', title: 'Advanced Methods in Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Tariq & 6 others', cadence: '3 times a week - 150 min' },
    ],
  },
  {
    code: 'BIO 503', title: 'Critical Thinking, Scientific Writing and Ethics', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Khurram Bashir & Muhammad Shoaib', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 516', title: 'Advanced Molecular and Cell Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Shaper Mirza & Zaigham Shahzad', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 524', title: 'Evolution', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Zaigham Shahzad', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 531', title: 'Computational Biology', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Laraib Iqbal Malik', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'BIO 541', title: 'Epidemiology and Methods in Clinical Research', credits: 3, department: 'Biology',
    sections: [
      { id: 'S1', instructor: 'Shaper Mirza & Muhammad Shoaib', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Chemical Engineering
  {
    code: 'CHE 210', title: 'Physical Chemistry', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Falak Sher', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 260', title: 'Principles of Chemical Engineering', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Qandeel Almas', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 280', title: 'Math Methods in Chemical Engineering I', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Shahid Usman Bin', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 300A', title: 'Chemical Engineering Lab II', credits: 1, department: 'Chemical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Hafiz Muhammad Afzal', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CHE 320', title: 'Separation Processes', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Tauqeer Abbas', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 352', title: 'Heat and Mass Transfer', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Ali Rauf', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 373', title: 'Advanced Fluid Dynamics', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Qasim Imtiaz', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 401A', title: 'Chemical Engineering Lab - V', credits: 1, department: 'Chemical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Hafiz Muhammad Afzal & Shahid Usman Bin', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CHE 401B', title: 'Chemical Engineering Lab - VI', credits: 1, department: 'Chemical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Syed Qamber Ali Zaidi', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CHE 415', title: 'Renewable Energy: Applications and Economics', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Tauqeer Abbas', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 422', title: 'Chemical Process Safety', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Faheem Hassan Akhtar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHE 440', title: 'Chemical Process Design I', credits: 3, department: 'Chemical Engineering',
    sections: [
      { id: 'S1', instructor: 'Qandeel Almas', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Qandeel Almas', cadence: 'Twice a week - 150 min' },
    ],
  },

  // Chemistry
  {
    code: 'CHEM 101', title: 'Principles of Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Basit Yameen', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Habib-ur- Rehman', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 221', title: 'Molecular Symmetry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 231', title: 'Fundamentals of Organic Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Irshad Hussain', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 314', title: 'Quantum Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Habib-ur- Rehman', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 324', title: 'Inorganic Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 332', title: 'Chemistry of the Organic Functional Groups', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Rahman Shah Zaib Saleem', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 342', title: 'Analytical Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 410', title: 'Physical Chemistry Lab', credits: 2, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Salman Noshear Arshad', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Salman Noshear Arshad', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CHEM 430', title: 'Organic Chemistry Lab II', credits: 2, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Muhammad Saeed', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Saeed', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CHEM 511', title: 'Advanced Physical Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Falak Sher', cadence: 'Twice a week - 75 min' },
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
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 531', title: 'Advanced Organic Chemistry I', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Irshad Hussain', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 532', title: 'Chemistry of Biomolecules', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Muhammad Saeed', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 711', title: 'Selected Topics in Physical Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Falak Sher', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 721', title: 'Selected Topics in Inorganic Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CHEM 731', title: 'Selected Topics in Organic Chemistry', credits: 3, department: 'Chemistry',
    sections: [
      { id: 'S1', instructor: 'Irshad Hussain', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Communication & Learning
  {
    code: 'CLCA 1000', title: 'Adab and Literature', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Bilal Tanweer & Fatima Fayyaz', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 1222', title: 'Anatomy of a Screenplay', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2119', title: 'Mechanics of Fiction', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Bilal Tanweer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2133', title: 'Fountain of the Sun: Rumi’s Masnavi and Divan', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Fatima Fayyaz', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2143', title: 'Modern Urdu Novel', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Nasir Abbas', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2214', title: 'Mechanics of Film', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Zebunnisa Hamid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2222', title: 'The Art of Filmmaking', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Raja Mohammad Tabish Habib', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2422', title: 'Introduction to Sanskrit', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Shahid Rasheed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2523', title: 'Illustrative Storytelling', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Mahnoor Azeem', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 2524', title: 'Introduction to Motion Media', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tayyab Younas', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 3122', title: 'Mir and Ghalib', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Ahtisham Ali', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 3202', title: 'Digital Media Production', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Zebunnisa Hamid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CLCA 3414', title: 'The Past is a Foreign Country: Memory, Myth and Historical Storytelling', credits: 4, department: 'Communication & Learning',
    sections: [
      { id: 'S1', instructor: 'Saman Tariq Malik', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Computer Science
  {
    code: 'CS 100', title: 'Computational Problem Solving', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', cadence: 'Twice a week - 50 min' },
      { id: 'S2', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', cadence: 'Twice a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Muhammad Hamad Alizai & Malik Jahan Khan', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 200', title: 'Introduction to Programming', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Mian Muhammad Awais & Shafay Shamail', cadence: 'Twice a week - 75 min' },
      { id: 'L1', component: 'Lab', instructor: 'Mian Muhammad Awais & Shafay Shamail', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 2001', title: 'Introduction to Programming with Python', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Waqar Ahmad', cadence: 'Twice a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Waqar Ahmad', cadence: 'Twice a week - 150 min' },
    ],
  },
  {
    code: 'CS 202', title: 'Data Structures', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Maryam Abdul Ghafoor', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Maryam Abdul Ghafoor', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 210', title: 'Discrete Mathematics', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Mudassir Shabbir', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Mudassir Shabbir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CS 220', title: 'Digital Logic Circuits', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 220L', title: 'Digital Logic Circuits Lab', credits: 1, department: 'Computer Science',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L3', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L4', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L5', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 225', title: 'Fundamentals of Computer Systems', credits: 4, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Jahangir Ikram', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Muhammad Jahangir Ikram', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'CS 233', title: 'Introduction to Computational Social Sciences', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Ihsan Ayyub Qazi & Ayesha Ali', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 330', title: 'Computational Biology II', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Laraib Iqbal Malik', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 331', title: 'Foundations of AI and Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Agha Ali Raza', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 334', title: 'Principles and Techniques of Data Science', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Saqib Muhammad Ilyas', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 340', title: 'Databases', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Asim Karim & Basit Shafiq', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 365', title: 'AI-Driven Software Engineering', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 370', title: 'Operating Systems', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Naveed Anwar Bhatti', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Naveed Anwar Bhatti', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 3812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 425', title: 'Digital System Design', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 425L', title: 'Digital System Design Lab', credits: 1, department: 'Computer Science',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Shahid Masud', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 4302', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 4305', title: 'AI on Edge Devices', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', cadence: 'Once a week - 150 min' },
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
      { id: 'S1', instructor: 'Momin Ayub Uppal', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 437', title: 'Deep Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 4602', title: 'Coding for Careers', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Saqib Muhammad Ilyas & Maryam Abdul Ghafoor', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 487', title: 'Cloud Development', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Ali Khawaja', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 501', title: 'Applied Probability', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5309', title: 'AI on Edge Devices', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 5316', title: 'NLP Theory and Applications', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Asim Karim', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5317', title: 'Deep Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5323', title: 'Deep Learning for Time, Space, and Graphs', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 5325', title: 'Quantum Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 5326', title: 'Advanced GenAI and Agents', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Agha Ali Raza', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5603', title: 'Cloud Development', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Ali Khawaja', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5604', title: 'AI-Driven Software Engineering', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5803', title: 'Applied Cryptography', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Siddiqi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 5812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 582', title: 'Distributed Systems', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Zafar Ayyub Qazi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 593', title: 'Mobile Robotics', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 622', title: 'Computer Architecture', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 630', title: 'Responsible AI Engineering', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Abdul Ali Bangash', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 6304', title: 'Advanced Topics in Machine Learning', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tahir', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 6315', title: 'Multi-agent Systems', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Hassan Jaleel', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 653', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'CS 667', title: 'Coding for Careers', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Saqib Muhammad Ilyas & Maryam Abdul Ghafoor', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'CS 682', title: 'Topics in Computer and Network Security', credits: 3, department: 'Computer Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Fareed Zaffar', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Data Science
  {
    code: 'DISC 112', title: 'Computer and Problem Solving', credits: 4, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Humbal Tariq', meets: 'Mon & Wed, 8:00 AM - 9:15 AM' },
      { id: 'L1', component: 'Lab', instructor: 'Humbal Tariq', meets: 'Fri, 9:00 AM - 11:50 AM' },
    ],
  },
  {
    code: 'DISC 203', title: 'Probability and Statistics', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Maheen Aamir Syed', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Sana Sami', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
      { id: 'S3', instructor: 'Sana Sami', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
      { id: 'S4', instructor: 'Sana Sami', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
      { id: 'S5', instructor: 'Sana Sami', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
      { id: 'S6', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
      { id: 'S7', meets: 'Mon & Wed' },
    ],
  },
  {
    code: 'DISC 212', title: 'Introduction to Management Science', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
      { id: 'S2', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
      { id: 'S3', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
      { id: 'S4', instructor: 'Zaid Saeed Khan', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
      { id: 'S5', instructor: 'Zaid Saeed Khan', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'DISC 231', title: 'Operations Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Samnan Ali', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'DISC 320', title: 'Management Inquiry: Research Skills for Business Problems', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Zehra Waheed & Aleena Iqtidar', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
      { id: 'S2', instructor: 'Zehra Waheed & Aleena Iqtidar', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'DISC 321', title: 'Decision Analysis', credits: 4, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Sheikh Attique Ur Rehman', meets: 'Mon & Wed, 9:00 AM - 10:50 AM' },
      { id: 'S2', instructor: 'Sheikh Attique Ur Rehman', meets: 'Tue & Thu, 9:00 AM - 10:50 AM' },
    ],
  },
  {
    code: 'DISC 322', title: 'Optimization Methods in Management Science', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
      { id: 'S2', instructor: 'Kamran Rashid', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'DISC 323', title: 'Decision Behaviour', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Sheikh Attique Ur Rehman', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
      { id: 'S2', instructor: 'Sheikh Attique Ur Rehman', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'DISC 325', title: 'Business Data Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'DISC 326', title: 'Data Science for Decision Making', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Asad Shoaib', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'DISC 327', title: 'Risk Management Process', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'DISC 331', title: 'Project Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Samnan Ali', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'DISC 333', title: 'Supply Chain and Logistics Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'DISC 335', title: 'Transportation and Logistics Management', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Zaid Saeed Khan', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'DISC 420', title: 'Business Analytics', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Maheen Aamir Syed', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Maheen Aamir Syed', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'DISC 472', title: 'Generative AI for Business and Automation', credits: 4, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Adnan Zahid', meets: 'Mon & Wed, 3:30 PM - 5:10 PM' },
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
      { id: 'S1', instructor: 'Zehra Waheed', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'DISC 6501', title: 'Applied Data Analysis', credits: 3, department: 'Data Science',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
      { id: 'S2', cadence: '3 times a week - 120 min' },
      { id: 'S3', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'DISC 8301', title: 'Seminar in Operations and Supply Chain Strategy', credits: 3, department: 'Data Science',
    sections: [
      { id: 'M1', component: 'Seminar', cadence: 'Once a week - 180 min' },
    ],
  },
  {
    code: 'DISC 8601', title: 'Regression Models', credits: 1.5, department: 'Data Science',
    sections: [
      { id: 'S1', cadence: 'Once a week - 180 min' },
    ],
  },
  {
    code: 'DISC 8602', title: 'Multilevel Models', credits: 1.5, department: 'Data Science',
    sections: [
      { id: 'S1', cadence: 'Once a week - 180 min' },
    ],
  },
  {
    code: 'DISC 8605', title: 'Structural Equation Models', credits: 1.5, department: 'Data Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ghufran Ahmad', cadence: 'Once a week - 180 min' },
    ],
  },

  // Economics
  {
    code: 'ECON 100', title: 'Principles of Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Nadia Mukhtar Sayed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 111', title: 'Principles of Microeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Tareena Musaddiq', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Tareena Musaddiq', cadence: 'Twice a week - 75 min' },
      { id: 'S3', instructor: 'Syed Muhammad Hasan', cadence: 'Twice a week - 75 min' },
      { id: 'S4', instructor: 'Syed Muhammad Hasan', cadence: 'Twice a week - 75 min' },
      { id: 'R1', component: 'Recitation', cadence: 'Once a week - 50 min' },
      { id: 'R10', component: 'Recitation', instructor: 'Rida Hameed', cadence: 'Once a week - 50 min' },
      { id: 'R11', component: 'Recitation', instructor: 'Rida Hameed', cadence: 'Once a week - 50 min' },
      { id: 'R12', component: 'Recitation', instructor: 'Rida Hameed', cadence: 'Once a week - 50 min' },
      { id: 'R2', component: 'Recitation', cadence: 'Once a week - 50 min' },
      { id: 'R3', component: 'Recitation', cadence: 'Once a week - 50 min' },
      { id: 'R4', component: 'Recitation', cadence: 'Once a week - 50 min' },
      { id: 'R5', component: 'Recitation', cadence: 'Once a week - 50 min' },
      { id: 'R6', component: 'Recitation', cadence: 'Once a week - 50 min' },
      { id: 'R7', component: 'Recitation', instructor: 'Rida Hameed', cadence: 'Once a week - 50 min' },
      { id: 'R8', component: 'Recitation', instructor: 'Rida Hameed', cadence: 'Once a week - 50 min' },
      { id: 'R9', component: 'Recitation', instructor: 'Rida Hameed', cadence: 'Once a week - 50 min' },
    ],
  },
  {
    code: 'ECON 121', title: 'Principles of Macroeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Kashif Zaheer Malik', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Ahmed M. Khalid', cadence: 'Twice a week - 75 min' },
      { id: 'S3', instructor: 'Ahmed M. Khalid', cadence: 'Twice a week - 75 min' },
      { id: 'S4', instructor: 'Kashif Zaheer Malik', cadence: 'Twice a week - 75 min' },
      { id: 'R1', component: 'Recitation', instructor: 'Nida Naz', cadence: 'Once a week - 50 min' },
      { id: 'R10', component: 'Recitation', instructor: 'Anum Fatima', cadence: 'Once a week - 50 min' },
      { id: 'R11', component: 'Recitation', instructor: 'Anum Fatima', cadence: 'Once a week - 50 min' },
      { id: 'R12', component: 'Recitation', instructor: 'Anum Fatima', cadence: 'Once a week - 50 min' },
      { id: 'R2', component: 'Recitation', instructor: 'Nida Naz', cadence: 'Once a week - 50 min' },
      { id: 'R3', component: 'Recitation', instructor: 'Nida Naz', cadence: 'Once a week - 50 min' },
      { id: 'R4', component: 'Recitation', instructor: 'Khadija Aftab', cadence: 'Once a week - 50 min' },
      { id: 'R5', component: 'Recitation', instructor: 'Khadija Aftab', cadence: 'Once a week - 50 min' },
      { id: 'R6', component: 'Recitation', instructor: 'Khadija Aftab', cadence: 'Once a week - 50 min' },
      { id: 'R7', component: 'Recitation', instructor: 'Khadija Aftab', cadence: 'Once a week - 50 min' },
      { id: 'R8', component: 'Recitation', instructor: 'Khadija Aftab', cadence: 'Once a week - 50 min' },
      { id: 'R9', component: 'Recitation', instructor: 'Khadija Aftab', cadence: 'Once a week - 50 min' },
    ],
  },
  {
    code: 'ECON 203', title: 'Reading Marx with Dickens', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Fahd Ali', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 211', title: 'Intermediate Microeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Malik Fakhar Ahmed & Noor Adnan Qureshi', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Malik Fakhar Ahmed & Noor Adnan Qureshi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 221', title: 'Intermediate Macroeconomics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Zahid Ali', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Syed Zahid Ali', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 230', title: 'Statistics and Data Analysis', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Usman Elahi', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Usman Elahi', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Amin Hussain', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 2301', title: 'Data Analytics Lab I', credits: 2, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Eeman Shahzad Shahzad Qureshi', cadence: 'Once a week - 50 min' },
      { id: 'S2', instructor: 'Eeman Shahzad Shahzad Qureshi', cadence: 'Once a week - 50 min' },
      { id: 'S3', instructor: 'Yushma Umar', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Eeman Shahzad Shahzad Qureshi', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Eeman Shahzad Shahzad Qureshi', cadence: 'Once a week - 150 min' },
      { id: 'L3', component: 'Lab', instructor: 'Yushma Umar', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'ECON 233', title: 'Introduction to Game Theory', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Lyyla Khalid', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Lyyla Khalid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 240', title: 'Development Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Nadia Mukhtar Sayed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 244', title: 'Introduction to Environmental Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 261', title: 'Principles of Finance', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Sheraz Latif Malik', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 262', title: 'Mathematical Applications in Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Mushtaq Ahmad Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 314', title: 'Law and Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Ali Hasanain', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 323', title: 'Economic History of South Asia', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Fahd Ali', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 330', title: 'Econometrics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Farah Said', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Muhammad Farooq Naseer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 3301', title: 'Data Analytics Lab II', credits: 2, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Rabia Khan', cadence: 'Once a week - 50 min' },
      { id: 'S2', instructor: 'Rabia Khan', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Rabia Khan', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Rabia Khan', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'ECON 3402', title: 'Gender Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Hana Zahir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 3404', title: 'Ethics and Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Khalid Mir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 3405', title: 'The Economics of Addiction', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Xiaolong Hou', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 3406', title: 'Economics of Artificial Intelligence', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Ali Hasanain', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 343', title: 'Agriculture and Food Policy', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Abid Aman Burki', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 4102', title: 'Gender and the Labor Market', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Hadia Majid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 423', title: 'Growth Theories', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Antonio Marasco', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 438', title: 'Econometrics II', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Adeel Tariq', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 4405', title: 'Health Economics: Theory and Policy', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syeda Warda Riaz', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 441', title: 'Development Economics Theory', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Khalid Mir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 4414', title: 'Topics in Energy Economics', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Ayesha Ali', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 4602', title: 'Public Finance', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Sher Afghan Asad', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 511', title: 'Microeconomic Analysis', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Osama Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 531', title: 'Econometrics and Research Methodology I', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Mushtaq Ahmad Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ECON 536', title: 'Topics in Mathematical Method for Economists', credits: 4, department: 'Economics',
    sections: [
      { id: 'S1', instructor: 'Syed Zahid Ali', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Education
  {
    code: 'EDU 212', title: 'Sociology of Education', credits: 4, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Tania Saeed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'EDU 222', title: 'The Learning Gap: Critical Issues in Educational Psychology', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Ifrah Nadeem', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 223', title: 'Trauma-Informed Education Systems: Creating Cultures of Support and Change', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Fizza Suhail', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 274', title: 'Gender Media and Education', credits: 3, department: 'Education',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Hasham Nasir', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EDU 3204', title: 'Enhancing Inclusion: Exploring Autism and Intellectual Disability', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mariam Haider', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 321', title: 'Inclusive Pedagogy: Rethinking teaching, learning and assessment', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Fizza Suhail', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 3215', title: 'Understanding Diversity in Disability', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mariam Haider', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 352', title: 'Education Policy Analysis', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jasir Shahbaz', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 353', title: 'Education and Conflict', credits: 3, department: 'Education',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Hasham Nasir', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EDU 412', title: 'Economics of Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jasir Shahbaz', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 422', title: 'Behavior Analysis for Effective Teaching', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Aaishay Haque', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 510', title: 'Interdisciplinary Theoretical Perspectives on Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Soufia Anis Siddiqi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 512', title: 'The Arts and Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Razia Iram Sadik', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 540', title: 'Leadership: The Politics of Change', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mariam Chughtai', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 553', title: 'Politics of Education Reform', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Soufia Anis Siddiqi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 554', title: 'Technology, AI and Impact on Teaching and Educational development', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Mohammad Mansoor Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 560', title: 'Research Methods in Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Sadaf Latafat', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 590', title: 'Observing Schools', credits: 1, department: 'Education',
    sections: [
      { id: 'F1', component: 'Field', instructor: 'Khansa Maria', cadence: 'Once a week - 300 min' },
    ],
  },
  {
    code: 'EDU 690', title: 'Practicum Proseminar', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Razia Iram Sadik & Mohammad Mansoor Khan', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Tayyaba Tamim & Mohammad Mansoor Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EDU 693', title: 'Academic Writing', credits: 1, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Sannia Hussain', cadence: 'Once a week - 50 min' },
    ],
  },
  {
    code: 'EDUX 510', title: 'Interdisciplinary Theoretical Perspectives on Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 120 min' },
    ],
  },
  {
    code: 'EDUX 540', title: 'Leadership: The Politics of Change', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 120 min' },
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
    ],
  },
  {
    code: 'EDUX 560', title: 'Research Methods in Education', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Jessica Albrent', cadence: 'Twice a week - 120 min' },
    ],
  },
  {
    code: 'EDUX 564', title: 'Education and Artificial Intelligence: Critical Perspectives and Hands-on Practice', credits: 3, department: 'Education',
    sections: [
      { id: 'S1', instructor: 'Suleman Shahid & Tayyaba Tamim', cadence: 'Twice a week - 120 min' },
    ],
  },
  {
    code: 'EDUX 590', title: 'Observing Schools', credits: 1, department: 'Education',
    sections: [
      { id: 'F1', component: 'Field', cadence: 'Once a week - 90 min' },
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
    ],
  },
  {
    code: 'EDUX 693', title: 'Academic Writing', credits: 1, department: 'Education',
    sections: [
      { id: 'S1', cadence: 'Once a week - 90 min' },
    ],
  },

  // Electrical Engineering
  {
    code: 'EE 201', title: 'Introduction to Programming', credits: 4, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Mian Muhammad Awais & Shafay Shamail', cadence: 'Twice a week - 75 min' },
      { id: 'L1', component: 'Lab', instructor: 'Mian Muhammad Awais & Shafay Shamail', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 202', title: 'Data Structures', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Maryam Abdul Ghafoor', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Maryam Abdul Ghafoor', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 203', title: 'Engineering Models', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 220', title: 'Digital Logic Circuits', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 220L', title: 'Digital Logic Circuits Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L3', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L4', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
      { id: 'L5', component: 'Lab', instructor: 'Talha Manzoor & Muhammad Adeel Ahmed Pasha', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 240', title: 'Circuits I', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nauman Ahmad Zaffar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 315', title: 'Foundations of AI and Machine Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Agha Ali Raza', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 324', title: 'Microcontroller and Interfacing', credits: 2, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hafsa Qamar', cadence: 'Twice a week - 50 min' },
    ],
  },
  {
    code: 'EE 324L', title: 'Microcontroller and Interfacing Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Hafsa Qamar', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Hafsa Qamar', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 330', title: 'Electromagnetic Fields and Waves', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Imran Cheema', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 340', title: 'Devices and Electronics', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 340L', title: 'Devices and Electronics Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', cadence: 'Once a week - 150 min' },
      { id: 'L3', component: 'Lab', instructor: 'Nauman Ahmad Zaffar & Nauman Zafar Butt', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 380', title: 'Communication Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Ijaz Haider Naqvi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 380L', title: 'Communication Systems Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Ijaz Haider Naqvi', cadence: 'Once a week - 150 min' },
      { id: 'L2', component: 'Lab', instructor: 'Ijaz Haider Naqvi', cadence: 'Once a week - 150 min' },
      { id: 'L3', component: 'Lab', instructor: 'Ijaz Haider Naqvi', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 3812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 402', title: 'Principles and Techniques of Data Science', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Saqib Muhammad Ilyas', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 414', title: 'Deep Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 417', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 421', title: 'Digital System Design', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 421L', title: 'Digital System Design Lab', credits: 1, department: 'Electrical Engineering',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Shahid Masud', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 453', title: 'Power System Protection and Stability', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Raheel Zafar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5102', title: 'Advanced Topics in Machine Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Tahir', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5105', title: 'AI on Edge Devices', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Zubair Khalid', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'EE 512', title: 'Digital Image Processing and Machine Vision', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nadeem Ahmad Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 515', title: 'Applied Probability', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 517', title: 'Deep Learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 520', title: 'Computer Architecture', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Shahid Masud', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5202', title: 'VLSI Design for Artificial Intelligence', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Siddiqi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5203', title: 'Physics-informed machine learning', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Nauman Zafar Butt', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5204', title: 'Applied Cryptography', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Siddiqi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5502', title: 'Local Solutions for Energy Access', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Naveed Arshad & Nauman Ahmad Zaffar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 555', title: 'Renewable Energy Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Abbas Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 559', title: 'Power System Protection and Stability', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Raheel Zafar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 565', title: 'Mobile Robotics', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Talha Manzoor', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 567', title: 'Multi-agent Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Hassan Jaleel', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 5812', title: 'Introduction to Blockchain: Technology and Applications', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Zartash Afzal Uzmi & 2 others', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'EE 585', title: 'Communication Systems', credits: 3, department: 'Electrical Engineering',
    sections: [
      { id: 'S1', instructor: 'Ijaz Haider Naqvi', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Business Administration
  {
    code: 'EMBA 5013', title: 'Understanding Financial Accounting: Making More Authoritative Decisions', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5022', title: 'Corporate Finance', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Fazal Jawad Seyyed', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Fazal Jawad Seyyed', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5041', title: 'Marketing Management', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5063', title: 'Decision Analytics', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 5211', title: 'Business Law', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 6071', title: 'Venture Creation', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'EMBA 6242', title: 'Corporate Governance', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'FMG 5101', title: 'Financial Statement Analysis and Value Creation', credits: 3, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Syed Kumail Abbas Rizvi', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'FMG 6102', title: 'Fintech Disruptions: Revolutionizing Financial Services', credits: 3, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Salman Khan', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'HMI 6101', title: 'Health Systems Management', credits: 1.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'HMI 6102', title: 'Healthcare Policy, Politics and Law', credits: 1.5, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'HMI 6202', title: 'Healthcare Operations Management', credits: 3, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'MBA 5041', title: 'Marketing Management', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 5051', title: 'Organizational Behaviour', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Arif Nazir Butt', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Arif Nazir Butt', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 5091', title: 'Managerial Communication', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Mehroz Sajjad', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Mehroz Sajjad', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 5201A', title: 'Financial Accounting I', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Asad Alam', cadence: 'Twice a week - 125 min' },
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
      { id: 'S1', cadence: 'Twice a week - 125 min' },
      { id: 'S2', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 5901', title: 'Experiential Learning I', credits: 1, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ghufran Ahmad', cadence: 'Twice a week - 125 min' },
      { id: 'S2', instructor: 'Muhammad Ghufran Ahmad', cadence: 'Twice a week - 125 min' },
    ],
  },
  {
    code: 'MBA 6024', title: 'Islamic Banking', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Saad Azmat', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', instructor: 'Muhammad Shakeel Sadiq Jajja', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', instructor: 'Moeen Naseer Butt', cadence: 'Twice a week - 90 min' },
      { id: 'S2', instructor: 'Moeen Naseer Butt', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6048', title: 'Sales Force Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Luqman Awan', cadence: 'Twice a week - 90 min' },
      { id: 'S2', instructor: 'Muhammad Luqman Awan', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6052', title: 'Human Resource Management', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Muhammad Abdur Rahman Malik', cadence: 'Twice a week - 90 min' },
    ],
  },
  {
    code: 'MBA 6060', title: 'Managing Workplace Diversity', credits: 0.5, department: 'Business Administration',
    sections: [
      { id: 'S1', instructor: 'Ayesha Masood', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', instructor: 'Hassan Rauf Chaudhry', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', cadence: 'Twice a week - 90 min' },
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
      { id: 'S1', instructor: 'Hafiz Muhammad Afzal & Qasim Imtiaz', cadence: 'Once a week - 50 min' },
      { id: 'S2', instructor: 'Muhammad Faryad', cadence: 'Once a week - 50 min' },
      { id: 'S3', instructor: 'Muhammad Faryad', cadence: 'Once a week - 50 min' },
      { id: 'S4', instructor: 'Nadeem Ahmad Khan', cadence: 'Once a week - 50 min' },
      { id: 'S5', instructor: 'Zubair Khalid', cadence: 'Once a week - 50 min' },
      { id: 'L1', component: 'Lab', instructor: 'Hafiz Muhammad Afzal & Qasim Imtiaz', cadence: 'Once a week - 250 min' },
      { id: 'L2', component: 'Lab', instructor: 'Muhammad Faryad & Muhammad Hamza Humayun', cadence: 'Once a week - 250 min' },
      { id: 'L3', component: 'Lab', instructor: 'Muhammad Faryad & Muhammad Hamza Humayun', cadence: 'Once a week - 250 min' },
      { id: 'L4', component: 'Lab', instructor: 'Nadeem Ahmad Khan', cadence: 'Once a week - 250 min' },
      { id: 'L5', component: 'Lab', instructor: 'Zubair Khalid', cadence: 'Once a week - 250 min' },
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
      { id: 'S1', instructor: 'Muhammad Awais', cadence: 'Twice a week - 75 min' },
    ],
  },

  // English
  {
    code: 'ENGL 1000', title: 'Introduction to Literature in English', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Saba Pirzadeh', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Sadia Zulfiqar', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENGL 2402', title: 'Comics Scholarship and Graphic Narrative', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Tom Edward Sewel', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENGL 2432', title: 'Narrative Essays', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Younis Bin Azeem', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENGL 3211', title: '‘Ring Shout’: The Slave Narrative and Its Legacy', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Sadia Zulfiqar', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENGL 3254', title: 'Whale of a Tale: 19th Century American Novel', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Saba Pirzadeh', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENGL 4572', title: 'Colonial Discourse and Postcolonial Theory', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Raniya Hosain', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENGL 4812', title: 'Contagion: Text as Pathogen', credits: 4, department: 'English',
    sections: [
      { id: 'S1', instructor: 'Tom Edward Sewel', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Environmental Science
  {
    code: 'ENV 102', title: 'Introduction to Environmental Studies', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Maryam Ibrahim', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENV 210', title: 'Methods in Environmental Studies', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Fazilda Nabeel', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENV 236', title: 'Disasters and Society', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENV 322', title: 'Environmental Governance', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'ENV 336', title: 'The Politics of Resources', credits: 4, department: 'Environmental Science',
    sections: [
      { id: 'S1', instructor: 'Ali Nobil Ahmad', cadence: 'Twice a week - 100 min' },
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
      { id: 'S1', instructor: 'Muhammad Awais', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Finance
  {
    code: 'FINN 100', title: 'Principles of Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Salman Khan', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'FINN 200', title: 'Intermediate Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Fazal Jawad Seyyed', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Syed Hashim Mahmood Ali', meets: 'Tue & Thu, 8:00 AM - 9:15 AM' },
      { id: 'S3', instructor: 'Syed Hashim Mahmood Ali', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
      { id: 'S4', instructor: 'Syed Hashim Mahmood Ali', meets: 'Tue & Thu, 5:00 PM - 6:15 PM' },
      { id: 'S5', instructor: 'Fazal Jawad Seyyed', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'FINN 222', title: 'Introduction to Mathematics of Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Ayesha Ahmad', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'FINN 243', title: 'Fintech Revolution: Market Disruption and Emerging Opportunities', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Hashim Mahmood Ali', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'FINN 341A', title: 'Financial Institutions and Markets', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Tanveer Shahzad', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'FINN 353', title: 'Investments', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Talha Farrukh', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'FINN 372', title: 'Actuarial Sciences and Insurance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Nauman Afzal Cheema', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'FINN 373', title: 'Fundamentals of Actuarial Mathematics I', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Syed', meets: 'Tue & Thu, 8:00 AM - 9:15 AM' },
    ],
  },
  {
    code: 'FINN 400', title: 'Applied Corporate Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Aun Raza Rizvi', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Syed Aun Raza Rizvi', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'FINN 403', title: 'Financial Modelling', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Talha Farrukh', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'FINN 441', title: 'Islamic Banking and Finance', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Saad Azmat', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'FINN 453', title: 'Financial Derivatives', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'FINN 454', title: 'Portfolio Management', credits: 3, department: 'Finance',
    sections: [
      { id: 'S1', instructor: 'Syed Kumail Abbas Rizvi', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
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
      { id: 'S1', instructor: 'Asad Rahim Khan', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Marva Khan', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Saad Amir', cadence: 'Twice a week - 100 min' },
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
      { id: 'S1', instructor: 'Fahad Malik', cadence: 'Twice a week - 100 min' },
      { id: 'S2', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 116', title: 'Introduction to Legal Systems and Reasoning', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Aisha Ahmad', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Raza Saeed', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Madiha Talat', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 117', title: 'Law and Social Compact', credits: 2, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Aisha Ahmad & Asad Rahim Khan', cadence: 'Once a week - 100 min' },
      { id: 'S2', instructor: 'Marva Khan & Raza Saeed', cadence: 'Once a week - 100 min' },
      { id: 'S3', instructor: 'Madiha Talat & Saad Amir', cadence: 'Once a week - 100 min' },
    ],
  },
  {
    code: 'LAW 220', title: 'Contracts', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Faiza', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Sheharyar Sikander Hamid', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Sheharyar Sikander Hamid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 222', title: 'Torts', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Syeda Zehra Zaidi', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Ahmed Hasan Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 240', title: 'Criminal Law', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Angbeen Atif Mirza', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Angbeen Atif Mirza', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Marva Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 280', title: 'Legal Practice I: Legal Writing and Research Methods', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Nabia Khawar', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Adnan Sattar', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Syeda Zehra Zaidi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 303', title: 'Advanced Writing from the Trial', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Sarah Humayun', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 3203', title: 'Introduction to Legal Aspects of Merger and Acquisition law in Pakistan', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Ali Awais', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 326', title: 'Intellectual Property Law', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Maria Farrukh Irfan Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 352', title: 'Public International Law', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Sikandar Ahmed Shah', cadence: 'Twice a week - 100 min' },
      { id: 'S2', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 353', title: 'Human Rights', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Adnan Sattar', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 4505', title: 'Business and Human Rights: A Critical Legal Perspective from the South', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azeem', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 472', title: 'Criminal Procedure', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Haider Rasul Mirza', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 4812', title: 'Legal Practice II: Legal Instruments', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Summaiya Zaidi', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Summaiya Zaidi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 4903', title: 'Topics in Law and Economics', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Uzair Kayani', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 4906', title: 'LUMS Law Clinic', credits: 4, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Maira Mumtaz', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LAW 502', title: 'Advanced Legal Writing', credits: 3, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Uzair Kayani', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'LAW 582', title: 'Alternate Dispute Resolution', credits: 3, department: 'Law',
    sections: [
      { id: 'S1', instructor: 'Maria Farooq', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Gender Studies
  {
    code: 'GSS 210', title: 'Introduction to Gender and Sexuality Studies', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Sameera Abbas', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'GSS 212', title: 'Women\'s Lives Across Cultures', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Rabia Kamal', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'GSS 315', title: 'Masculinities', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Nida Yasmeen Kirmani', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'GSS 316', title: 'Gender Economics', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Hana Zahir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'GSS 3603', title: 'Ethics of Romantic Love', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Samira Musleh', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'GSS 4112', title: 'Gender and the Labor Market', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Hadia Majid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'GSS 414', title: 'Sex and the State', credits: 4, department: 'Gender Studies',
    sections: [
      { id: 'S1', instructor: 'Ghazal Asif', cadence: 'Twice a week - 100 min' },
    ],
  },

  // History
  {
    code: 'HIST 100', title: 'Introduction to Historical Studies', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Ali Usman Qasmi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 127', title: 'A Peoples History of Pakistan', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Ilyas Ahmad Chattha', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 215', title: 'Buddhist Art and Architecture in the Subcontinent', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Nadhra Shahbaz Naeem Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 218', title: 'Nineteenth Century French Art: Neoclassicism to Impressionism', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Nadhra Shahbaz Naeem Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 2304', title: 'The making of the Islamic world', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Essam Fahim', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 292', title: 'Introduction to Sanskrit', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Shahid Rasheed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 3204', title: 'The Past is a Foreign Country: Memory, Myth and Historical Storytelling', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Saman Tariq Malik', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 3215', title: 'Imperialism and its Discontents in South Asia', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ali Raza', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 3314', title: 'Technology and Social Change', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Waqar Zaidi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'HIST 372', title: 'US Imperialism', credits: 4, department: 'History',
    sections: [
      { id: 'S1', instructor: 'Ameem Lutfi', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Humanities & Social Sciences
  {
    code: 'HSS 101', title: 'First Year Advising Tutorial', credits: 0.5, department: 'Humanities & Social Sciences',
    sections: [
      { id: 'S1', cadence: 'Once a week - 100 min' },
      { id: 'S10', cadence: 'Once a week - 100 min' },
      { id: 'S11', cadence: 'Once a week - 100 min' },
      { id: 'S12', cadence: 'Once a week - 100 min' },
      { id: 'S13', cadence: 'Once a week - 100 min' },
      { id: 'S14', cadence: 'Once a week - 100 min' },
      { id: 'S15', cadence: 'Once a week - 100 min' },
      { id: 'S16', cadence: 'Once a week - 100 min' },
      { id: 'S17', cadence: 'Once a week - 100 min' },
      { id: 'S18', cadence: 'Once a week - 100 min' },
      { id: 'S2', cadence: 'Once a week - 100 min' },
      { id: 'S3', cadence: 'Once a week - 100 min' },
      { id: 'S4', cadence: 'Once a week - 100 min' },
      { id: 'S5', cadence: 'Once a week - 100 min' },
      { id: 'S6', cadence: 'Once a week - 100 min' },
      { id: 'S7', cadence: 'Once a week - 100 min' },
      { id: 'S8', cadence: 'Once a week - 100 min' },
      { id: 'S9', cadence: 'Once a week - 100 min' },
    ],
  },

  // Humanities
  {
    code: 'HUM 500', title: 'Theories and Methods in the Humanities', credits: 3, department: 'Humanities',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Mian Muhammad Nauman Faizi & Muhammad Ali Raza', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'HUM 512', title: 'Historical Methods', credits: 3, department: 'Humanities',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Ilyas Ahmad Chattha & Ameem Lutfi', cadence: 'Once a week - 150 min' },
    ],
  },

  // Languages
  {
    code: 'LANG 1202', title: 'Arabic for Quran', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Hafiz Abdul Qadeer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 1204', title: 'Kashmiri I', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Khawaja Zahid Aziz', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 122', title: 'Introduction to Balochi Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Hameed Ullah', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 123', title: 'Introduction to Punjabi Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Zahid Hussain', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 124', title: 'Introduction to Arabic Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Hafiz Abdul Qadeer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 127', title: 'Introduction to Persian Language', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Samina Arifa', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Samina Arifa', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 128', title: 'Sindhi for Non-Sindhi Speakers', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Ashok Kumar Khatri', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Ashok Kumar Khatri', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 129', title: 'Pashto for Non-Native Speakers', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Imad', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Imad', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 2207', title: 'Enhancing Urdu Reading and Writing Skills', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Zahid Hussain', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'LANG 2208', title: 'Introduction to Sanskrit', credits: 4, department: 'Languages',
    sections: [
      { id: 'S1', instructor: 'Shahid Rasheed', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Mathematics
  {
    code: 'MATH 100', title: 'Pre-Calculus', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Arhum Naseem Khawaja', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Arhum Naseem Khawaja', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 101', title: 'Calculus I', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Waqas Ali Azhar', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Waqas Ali Azhar', cadence: 'Twice a week - 75 min' },
      { id: 'S3', instructor: 'Imran Anwar', cadence: 'Twice a week - 75 min' },
      { id: 'S4', instructor: 'Adnan Khan', cadence: 'Twice a week - 75 min' },
      { id: 'S5', instructor: 'Omar Khawar Malik', cadence: 'Twice a week - 75 min' },
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
      { id: 'S1', instructor: 'Sultan Sial', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 120', title: 'Linear Algebra with Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Reza Abdolmaleki', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 204', title: 'Introduction to Formal Mathematics', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Shaheen Nazir', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 210', title: 'Introduction to Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Hassan Mohy-ud-Din', cadence: 'Twice a week - 75 min' },
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
      { id: 'S1', instructor: 'Haniya Azam', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 232', title: 'Introduction to Game Theory', credits: 4, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Lyyla Khalid', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Lyyla Khalid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'MATH 252', title: 'Discrete Mathematics', credits: 4, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Mudassir Shabbir', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Mudassir Shabbir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'MATH 3012', title: 'Introduction to Nonlinear Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Imran Anwar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 309', title: 'Introduction to Analysis II', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 341', title: 'Operations Research I', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 407', title: 'General Topology', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Haniya Azam', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 412', title: 'Partial Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Ali Ashher Zaidi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 437', title: 'Applied Stochastic Processes', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Adnan Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 439', title: 'Applied Probability', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Momin Ayub Uppal', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 4418', title: 'Numerical Linear Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Waqas Ali Azhar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 507', title: 'Advanced General Topology', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Haniya Azam', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 513', title: 'Advanced Partial Differential Equations', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Ali Ashher Zaidi', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 521', title: 'Advanced Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Reza Abdolmaleki', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 535', title: 'Advanced Applied Stochastic Process', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Adnan Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 543', title: 'Advanced Numerical Linear Algebra', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Waqas Ali Azhar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'MATH 547', title: 'Operational Research I', credits: 3, department: 'Mathematics',
    sections: [
      { id: 'S1', instructor: 'Kamran Rashid', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Managerial Economics
  {
    code: 'MECO 111', title: 'Principles of Microeconomics', credits: 3, department: 'Managerial Economics',
    sections: [
      { id: 'S1', instructor: 'Abid Raza Khan', meets: 'Mon & Wed, 8:00 AM - 9:15 AM' },
      { id: 'S2', instructor: 'Abid Raza Khan', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
      { id: 'S3', instructor: 'Abid Raza Khan', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
      { id: 'S4', instructor: 'Abid Raza Khan', meets: 'Tue & Thu, 8:00 AM - 9:15 AM' },
      { id: 'S5', instructor: 'Rabia Khan', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
      { id: 'S6', instructor: 'Rabia Khan', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
      { id: 'S7', instructor: 'Misbah Tanveer Chaudhry', meets: 'Tue & Thu, 8:00 AM - 9:15 AM' },
      { id: 'S8', instructor: 'Misbah Tanveer Chaudhry', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'MECO 121', title: 'Principles of Macroeconomics', credits: 3, department: 'Managerial Economics',
    sections: [
      { id: 'S1', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'MECO 2201', title: 'Introduction to Business Economics', credits: 1.5, department: 'Managerial Economics',
    sections: [
      { id: 'S1', cadence: '4 times a week - 120 min' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'MECO 5201', title: 'Business Economics', credits: 1.5, department: 'Managerial Economics',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
      { id: 'S2', cadence: '3 times a week - 120 min' },
      { id: 'S3', cadence: '3 times a week - 120 min' },
      { id: 'S4', cadence: '3 times a week - 120 min' },
    ],
  },

  // Management
  {
    code: 'MGMT 142', title: 'Principles of Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Mujeeb Rashid', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
      { id: 'S2', instructor: 'Mujeeb Rashid', meets: 'Tue & Thu, 5:00 PM - 6:15 PM' },
      { id: 'S3', instructor: 'Mohsin Bashir', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
      { id: 'S4', instructor: 'Muhammad Aneeq Ismail', meets: 'Mon & Wed, 8:00 AM - 9:15 AM' },
      { id: 'S5', instructor: 'Muhammad Aneeq Ismail', meets: 'Tue & Thu, 5:00 PM - 6:15 PM' },
      { id: 'S6', instructor: 'Zainab Amir', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
      { id: 'S7', instructor: 'Zainab Amir', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
      { id: 'S8', instructor: 'Zainab Anjum', meets: 'Tue & Thu, 8:00 AM - 9:15 AM' },
    ],
  },
  {
    code: 'MGMT 212', title: 'Business Communication', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
      { id: 'S3', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
      { id: 'S4', instructor: 'Mehr Farhan Cheema', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
      { id: 'S5', instructor: 'Mehr Farhan Cheema', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S6', instructor: 'Jazib Zahir', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'MGMT 242', title: 'Business Ethics and Corporate Social Responsibility', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Razi Allah Lone', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S2', instructor: 'Razi Allah Lone', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
      { id: 'S3', instructor: 'Razi Allah Lone', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'MGMT 244', title: 'Reforming The Public Sector', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ajmal', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'MGMT 247', title: 'Public Financial Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Sajid Siddique', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'MGMT 252', title: 'Logic and Critical Thinking', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Shabbir Ahsen', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'MGMT 260', title: 'Business Law', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ali Sultan', meets: 'Mon & Wed, 8:00 AM - 9:15 AM' },
      { id: 'S2', instructor: 'Ali Sultan', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
      { id: 'S3', instructor: 'Ali Sultan', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'MGMT 2601', title: 'Introduction to Management', credits: 1.5, department: 'Management',
    sections: [
      { id: 'S1', cadence: '4 times a week - 120 min' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'MGMT 261', title: 'Introduction to Policy Analysis', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghazal Mir Zulfiqar', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'MGMT 263', title: 'Contemporary Social Policy Issues in Pakistan', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Ahsan Rana', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'MGMT 348', title: 'Internet Governance and Technology Policy', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Gulalai Khan', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'MGMT 365', title: 'Urban Planning and Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Suleman Ghani', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'MGMT 373', title: 'Personal Effectiveness', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azfar Nisar', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'MGMT 386', title: 'Business, Government, and Society', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghazal Mir Zulfiqar', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'MGMT 387', title: 'Managing Diverse People and Organizations', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ayesha Masood', meets: 'Mon & Wed, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'MGMT 389', title: 'Fashion Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Sahar Atif', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'MGMT 400', title: 'Strategic Business Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Anjum Fayyaz', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
      { id: 'S2', instructor: 'Adnan Zahid', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
      { id: 'S3', meets: 'Tue & Thu, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'MGMT 481', title: 'Entrepreneurship', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Sahar Atif', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'MGMT 8402', title: 'Foundation of Management Research', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', instructor: 'Ghulam Ali Arain', cadence: 'Once a week - 180 min' },
    ],
  },
  {
    code: 'MGMT 8403', title: 'Applications of Psychology in Management', credits: 3, department: 'Management',
    sections: [
      { id: 'S1', cadence: 'Once a week - 180 min' },
    ],
  },
  {
    code: 'MGMT 8404', title: 'Pedagogy', credits: 2, department: 'Management',
    sections: [
      { id: 'S1', cadence: 'Once a week - 180 min' },
    ],
  },

  // Marketing
  {
    code: 'MKTG 201', title: 'Principles of Marketing', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Komal Zain', meets: 'Mon & Wed, 9:30 AM - 10:45 AM' },
      { id: 'S2', instructor: 'Komal Zain', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
      { id: 'S3', instructor: 'Aaminah Zaman Malik', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
      { id: 'S4', instructor: 'Mahira Ilyas', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
      { id: 'S5', instructor: 'Saima Mujtaba Rana', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'MKTG 222', title: 'Retail Management', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Mahira Ilyas', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'MKTG 2401', title: 'Introduction to Marketing', credits: 1.5, department: 'Marketing',
    sections: [
      { id: 'S1', cadence: '4 times a week - 120 min' },
      { id: 'S2', cadence: '4 times a week - 120 min' },
    ],
  },
  {
    code: 'MKTG 302', title: 'Digital Marketing', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Komal Zain', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'MKTG 324', title: 'Integrated Marketing Communications', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Mehroz Sajjad', meets: 'Mon & Wed, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'MKTG 332', title: 'Consumer Behaviour', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Ateeq Abdur Rauf', meets: 'Tue & Thu, 12:30 PM - 1:45 PM' },
    ],
  },
  {
    code: 'MKTG 343', title: 'Marketing Models', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Muhammad Asim', meets: 'Mon & Wed, 2:00 PM - 3:15 PM' },
    ],
  },
  {
    code: 'MKTG 344', title: 'Data Driven Marketing', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Aleena Iqtidar', meets: 'Tue & Thu, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'MKTG 345', title: 'Data Analytics for New Product Development', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Muhammad Asim', meets: 'Mon & Wed, 3:30 PM - 4:45 PM' },
    ],
  },
  {
    code: 'MKTG 392', title: 'Brand Management', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', instructor: 'Ismail Hussain Naqvi', meets: 'Mon & Wed, 5:00 PM - 6:15 PM' },
    ],
  },
  {
    code: 'MKTG 5401', title: 'Marketing Management', credits: 3, department: 'Marketing',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
      { id: 'S2', cadence: '3 times a week - 120 min' },
      { id: 'S3', cadence: '3 times a week - 120 min' },
    ],
  },

  // Organisational Science
  {
    code: 'ORSC 201', title: 'Organizational Behaviour', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'S1', instructor: 'Muhammad Aneeq Ismail', meets: 'Tue & Thu, 3:30 PM - 4:45 PM' },
      { id: 'S2', instructor: 'Mohsin Bashir', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
      { id: 'S3', instructor: 'Fiza Kanwal', meets: 'Tue & Thu, 2:00 PM - 3:15 PM' },
      { id: 'S4', instructor: 'Zainab Anjum', meets: 'Mon & Wed, 8:00 AM - 9:15 AM' },
      { id: 'S5', instructor: 'Faiza Ali', meets: 'Tue & Thu, 9:30 AM - 10:45 AM' },
    ],
  },
  {
    code: 'ORSC 341', title: 'Human Resource Management', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'S1', instructor: 'Faiza Ali', meets: 'Tue & Thu, 11:00 AM - 12:15 PM' },
    ],
  },
  {
    code: 'ORSC 5301', title: 'Organizations and Leadership', credits: 1.5, department: 'Organisational Science',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
      { id: 'S2', cadence: '3 times a week - 120 min' },
      { id: 'S3', cadence: '3 times a week - 120 min' },
      { id: 'S4', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'ORSC 8201', title: 'Seminar in Organization Theory', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Salma Zaman', cadence: 'Once a week - 180 min' },
    ],
  },
  {
    code: 'ORSC 8402', title: 'Seminar in Human Resource Management', credits: 3, department: 'Organisational Science',
    sections: [
      { id: 'S1', cadence: 'Once a week - 180 min' },
    ],
  },

  // Philosophy
  {
    code: 'PHIL 102', title: 'Philosophy Gym', credits: 4, department: 'Philosophy',
    sections: [
      { id: 'S1', instructor: 'Amber Riaz', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Amber Riaz', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Physics
  {
    code: 'PHY 101', title: 'Mechanics', credits: 4, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', cadence: 'Twice a week - 75 min' },
      { id: 'S2', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', cadence: 'Twice a week - 75 min' },
      { id: 'R1', component: 'Recitation', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', cadence: 'Once a week - 50 min' },
      { id: 'R2', component: 'Recitation', instructor: 'Syed Moeez Hassan & Adam Zaman Chaudhry', cadence: 'Once a week - 50 min' },
    ],
  },
  {
    code: 'PHY 204', title: 'Electricity and Magnetism', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Rizwan Khalid', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 212', title: 'Quantum Mechanics I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Muhammad Faryad', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 223', title: 'Mathematical Methods in Physics and Engineering I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 300', title: 'Experimental Physics Lab II', credits: 3, department: 'Physics',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Hamza Humayun', cadence: 'Once a week - 450 min' },
    ],
  },
  {
    code: 'PHY 301', title: 'Classical Mechanics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Tajdar Mufti', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 305', title: 'Electromagnetic Fields and Waves', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Muhammad Imran Cheema', cadence: 'Twice a week - 75 min' },
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
      { id: 'S1', instructor: 'Aeysha Khalique', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 335', title: 'Molecular Symmetry I', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Ghayoor Abbas Chotana', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 404', title: 'Relativistic Electrodynamics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Tajdar Mufti', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 500', title: 'Graduate Physics Lab', credits: 3, department: 'Physics',
    sections: [
      { id: 'L1', component: 'Lab', instructor: 'Muhammad Hamza Humayun', cadence: 'Once a week - 450 min' },
    ],
  },
  {
    code: 'PHY 504', title: 'Relativistic Electrodynamics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Tajdar Mufti', cadence: 'Twice a week - 75 min' },
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
      { id: 'S1', instructor: 'Aeysha Khalique', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 5313', title: 'Atomic and Laser Physics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Adam Zaman Chaudhry', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'PHY 603', title: 'Machine Learning for Physics', credits: 3, department: 'Physics',
    sections: [
      { id: 'S1', instructor: 'Nauman Zafar Butt', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Political Science
  {
    code: 'POL 320', title: 'Comparative Politics', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Asma ul-Husna Faiz', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 100', title: 'Introduction to Political Science', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mohammad Hamza Iftikhar', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Shahab ud Din Ahmad', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Mariam Farooq Awan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 203', title: 'Introduction to Political Theory', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Adeel Hamza', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Muhammad Shabbir Ahsen', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 229', title: 'Politics of Armed Groups', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mariam Farooq Awan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 268', title: 'Master Narratives: Minding Gender and Media Gaps', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Maria Amir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 272', title: 'Shakespeare and Political Philosophy', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Adeel Hamza', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 273', title: 'Islam, Caste, and Political Power: Lineage and Sovereignty from Arabia to South Asia', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Ateeb Ahmed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 3202', title: 'Qualitative Research Methods in Political Science', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Younis Sarwer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 324', title: 'Marxism and the Modern World', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Taimur Rahman', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 3302', title: 'Theories of IR', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Younis Sarwer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 335', title: 'Revolutionary War and Counterinsurgency', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 338', title: 'Environmental Governance', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 353', title: 'US Foreign Policy', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mohammad Hamza Iftikhar', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 379', title: 'US Imperialism', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Ameem Lutfi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 382', title: 'Ethnic Conflict and Conflict Resolution', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Hafiz Muhammad Salman Rafi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 383', title: 'Ring Shout’: The Slave Narrative and Its Legacy', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Sadia Zulfiqar', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 384', title: 'Institutions and Institutional Changes', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Shahab ud Din Ahmad', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 385', title: 'Constitutional Development in Pakistan', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Mohammad Waseem', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'POL 464', title: 'Political Sociology', credits: 4, department: 'Political Science',
    sections: [
      { id: 'S1', instructor: 'Umair Javed', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Psychology
  {
    code: 'PSY 100', title: 'Introduction to Psychology and Human Behavior', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Imran Rashid', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Arman Ashraf', cadence: 'Twice a week - 100 min' },
      { id: 'S3', instructor: 'Humair Yusuf', cadence: 'Twice a week - 100 min' },
      { id: 'S4', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 201', title: 'Cognition', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Yasser Hashmi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 212', title: 'Theories of Learning', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Imran Rashid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 214', title: 'Perception', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Yasser Hashmi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 217', title: 'Biological Psychology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azam Khalid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 218', title: 'History of Psychology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 220', title: 'Psychopathology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Muhammad Azam Khalid', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 308', title: 'Critical Multicultural Psychology', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Humair Yusuf', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'PSY 321', title: 'Life Span Development', credits: 4, department: 'Psychology',
    sections: [
      { id: 'S1', instructor: 'Arman Ashraf', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Religion
  {
    code: 'REL 215', title: 'Sufism: Key Texts and Cultural Practices', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Baqar Hassan Syed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'REL 222', title: 'Buddhist Art and Architecture in the Subcontinent', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Nadhra Shahbaz Naeem Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'REL 252', title: 'Introduction to Anthropology of Religion', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Dominic William Esler', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'REL 263', title: 'The making of the Islamic world', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Essam Fahim', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'REL 315', title: 'Religion and Existentialism', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Mian Muhammad Nauman Faizi', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'REL 318', title: 'Ethics of Romantic Love', credits: 4, department: 'Religion',
    sections: [
      { id: 'S1', instructor: 'Samira Musleh', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Science
  {
    code: 'SCI 5203', title: 'Physics-informed machine learning', credits: 3, department: 'Science',
    sections: [
      { id: 'S1', instructor: 'Nauman Zafar Butt', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SCP 500', title: 'Theory and the Social Sciences', credits: 3, department: 'Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Amen Jaffer & Asma ul-Husna Faiz', cadence: 'Once a week - 150 min' },
    ],
  },
  {
    code: 'SCP 512', title: 'Politics and Development in the Global South', credits: 3, department: 'Science',
    sections: [
      { id: 'M1', component: 'Seminar', instructor: 'Umair Javed', cadence: 'Once a week - 150 min' },
    ],
  },

  // Supply Chain Management
  {
    code: 'SCRM 6101', title: 'Operations and Supply Chain Strategy', credits: 3, department: 'Supply Chain Management',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'SCRM 6303', title: 'Supply Chain Systems and Analytics', credits: 3, department: 'Supply Chain Management',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
    ],
  },
  {
    code: 'SCRM 6401', title: 'Applied Research and Analysis', credits: 3, department: 'Supply Chain Management',
    sections: [
      { id: 'S1', instructor: 'Sheikh Attique Ur Rehman', cadence: '3 times a week - 120 min' },
    ],
  },

  // Sociology
  {
    code: 'SOC 100', title: 'Introduction to Sociology', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Aftab Nasir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 223', title: 'Sociology of Education', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Tania Saeed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 226', title: 'Disasters and Society', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Sana Khosa', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 265', title: 'Introduction to Gender and Sexuality Studies', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Sameera Abbas', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 310', title: 'Classical Sociological Theory', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Amen Jaffer', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 346', title: 'The Politics of Resources', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Ali Nobil Ahmad', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 364', title: 'Masculinities', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Nida Yasmeen Kirmani', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 373', title: '"Indigenous" Knowledge(s) Through a Sociological Lens', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Aftab Nasir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 412', title: 'Political Sociology', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Umair Javed', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SOC 462', title: 'Sociology of Emotions', credits: 4, department: 'Sociology',
    sections: [
      { id: 'S1', instructor: 'Tania Saeed', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Social Sciences
  {
    code: 'SS 100A', title: 'Introduction to Writing', credits: 2, department: 'Social Sciences',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 50 min' },
      { id: 'S2', cadence: 'Twice a week - 50 min' },
      { id: 'S3', cadence: 'Twice a week - 50 min' },
      { id: 'S4', cadence: 'Twice a week - 50 min' },
      { id: 'S5', cadence: 'Twice a week - 50 min' },
    ],
  },
  {
    code: 'SS 100', title: 'Writing and Communication', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', cadence: 'Twice a week - 100 min' },
      { id: 'S10', cadence: 'Twice a week - 100 min' },
      { id: 'S11', cadence: 'Twice a week - 100 min' },
      { id: 'S12', cadence: 'Twice a week - 100 min' },
      { id: 'S13', cadence: 'Twice a week - 100 min' },
      { id: 'S14', cadence: 'Twice a week - 100 min' },
      { id: 'S15', cadence: 'Twice a week - 100 min' },
      { id: 'S16', cadence: 'Twice a week - 100 min' },
      { id: 'S17', cadence: 'Twice a week - 100 min' },
      { id: 'S18', cadence: 'Twice a week - 100 min' },
      { id: 'S19', cadence: 'Twice a week - 100 min' },
      { id: 'S2', cadence: 'Twice a week - 100 min' },
      { id: 'S20', cadence: 'Twice a week - 100 min' },
      { id: 'S21', cadence: 'Twice a week - 100 min' },
      { id: 'S22', cadence: 'Twice a week - 100 min' },
      { id: 'S23', cadence: 'Twice a week - 100 min' },
      { id: 'S24', cadence: 'Twice a week - 100 min' },
      { id: 'S25', cadence: 'Twice a week - 100 min' },
      { id: 'S26', cadence: 'Twice a week - 100 min' },
      { id: 'S27', cadence: 'Twice a week - 100 min' },
      { id: 'S28', cadence: 'Twice a week - 100 min' },
      { id: 'S29', cadence: 'Twice a week - 100 min' },
      { id: 'S3', cadence: 'Twice a week - 100 min' },
      { id: 'S30', cadence: 'Twice a week - 100 min' },
      { id: 'S4', cadence: 'Twice a week - 100 min' },
      { id: 'S5', cadence: 'Twice a week - 100 min' },
      { id: 'S6', cadence: 'Twice a week - 100 min' },
      { id: 'S7', cadence: 'Twice a week - 100 min' },
      { id: 'S8', cadence: 'Twice a week - 100 min' },
      { id: 'S9', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SS 101', title: 'Islamic Studies', credits: 2, department: 'Social Sciences',
    sections: [
      { id: 'S1', cadence: 'Once a week - 100 min' },
      { id: 'S2', cadence: 'Once a week - 100 min' },
      { id: 'S3', cadence: 'Once a week - 100 min' },
      { id: 'S4', cadence: 'Once a week - 100 min' },
      { id: 'S5', cadence: 'Once a week - 100 min' },
    ],
  },
  {
    code: 'SS 102', title: 'Pakistan Studies: Culture and Heritage', credits: 2, department: 'Social Sciences',
    sections: [
      { id: 'S1', cadence: 'Once a week - 100 min' },
      { id: 'S2', cadence: 'Once a week - 100 min' },
      { id: 'S3', cadence: 'Once a week - 100 min' },
      { id: 'S4', cadence: 'Once a week - 100 min' },
      { id: 'S5', cadence: 'Once a week - 100 min' },
      { id: 'S6', cadence: 'Once a week - 100 min' },
      { id: 'S7', cadence: 'Once a week - 100 min' },
      { id: 'S8', cadence: 'Once a week - 100 min' },
      { id: 'S9', cadence: 'Once a week - 100 min' },
    ],
  },
  {
    code: 'SS 103', title: 'Fehm-Ul-Quran', credits: 1, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Asif Iftikhar', cadence: 'Once a week - 50 min' },
    ],
  },
  {
    code: 'SS 1312', title: 'Fundamentals of Raag and Taal [Vocal and Flute]', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Muhammad Hanif', cadence: 'Twice a week - 100 min' },
      { id: 'S2', instructor: 'Muhammad Hanif', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SS 187', title: 'Applied Statistics for Humanities', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Muhammad Salaar Arif Khan', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SS 189', title: 'Data Literacy', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Zainab Sattar & 3 others', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SS 2203', title: 'Digital Approaches to the Humanities', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Maira Rehman', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SS 233', title: 'Media Writing', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Syed Javed Nazir', cadence: 'Twice a week - 100 min' },
    ],
  },
  {
    code: 'SS 3302', title: 'Professional Communication Skills', credits: 4, department: 'Social Sciences',
    sections: [
      { id: 'S1', instructor: 'Aamna Khalid', cadence: 'Twice a week - 100 min' },
    ],
  },

  // Science & Engineering
  {
    code: 'SSE 101', title: 'SSE Tutorials', credits: 0.5, department: 'Science & Engineering',
    sections: [
      { id: 'S1', cadence: 'Once a week - 150 min' },
      { id: 'S10', cadence: 'Once a week - 150 min' },
      { id: 'S11', cadence: 'Once a week - 150 min' },
      { id: 'S12', cadence: 'Once a week - 150 min' },
      { id: 'S13', cadence: 'Once a week - 150 min' },
      { id: 'S14', cadence: 'Once a week - 150 min' },
      { id: 'S15', cadence: 'Once a week - 150 min' },
      { id: 'S16', cadence: 'Once a week - 150 min' },
      { id: 'S17', cadence: 'Once a week - 150 min' },
      { id: 'S18', cadence: 'Once a week - 150 min' },
      { id: 'S19', cadence: 'Once a week - 150 min' },
      { id: 'S2', cadence: 'Once a week - 150 min' },
      { id: 'S20', cadence: 'Once a week - 150 min' },
      { id: 'S21', cadence: 'Once a week - 150 min' },
      { id: 'S22', cadence: 'Once a week - 150 min' },
      { id: 'S23', cadence: 'Once a week - 150 min' },
      { id: 'S24', cadence: 'Once a week - 150 min' },
      { id: 'S25', cadence: 'Once a week - 150 min' },
      { id: 'S26', cadence: 'Once a week - 150 min' },
      { id: 'S27', cadence: 'Once a week - 150 min' },
      { id: 'S28', cadence: 'Once a week - 150 min' },
      { id: 'S29', cadence: 'Once a week - 150 min' },
      { id: 'S3', cadence: 'Once a week - 150 min' },
      { id: 'S30', cadence: 'Once a week - 150 min' },
      { id: 'S31', cadence: 'Once a week - 150 min' },
      { id: 'S32', cadence: 'Once a week - 150 min' },
      { id: 'S33', cadence: 'Once a week - 150 min' },
      { id: 'S4', cadence: 'Once a week - 150 min' },
      { id: 'S5', cadence: 'Once a week - 150 min' },
      { id: 'S6', cadence: 'Once a week - 150 min' },
      { id: 'S7', cadence: 'Once a week - 150 min' },
      { id: 'S8', cadence: 'Once a week - 150 min' },
      { id: 'S9', cadence: 'Once a week - 150 min' },
    ],
  },

  // Social Work
  {
    code: 'SWR 102', title: 'Swimming for Beginners', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Haider Awan & Chaudhary Abdul Aziz', cadence: 'Twice a week - 75 min' },
      { id: 'P2', component: 'Project', instructor: 'Rabia Yasin & Bashir Khalida', cadence: 'Twice a week - 75 min' },
      { id: 'P3', component: 'Project', instructor: 'Rashid Ahmad & Azmat Ullah', cadence: 'Twice a week - 75 min' },
      { id: 'P4', component: 'Project', instructor: 'Kausar Farooq', cadence: 'Twice a week - 75 min' },
      { id: 'P5', component: 'Project', instructor: 'Rabia Yasin & Bashir Khalida', cadence: 'Twice a week - 75 min' },
      { id: 'P6', component: 'Project', instructor: 'Muhammad Haider Awan & Chaudhary Abdul Aziz', cadence: 'Twice a week - 75 min' },
      { id: 'P7', component: 'Project', instructor: 'Kausar Farooq', cadence: 'Twice a week - 75 min' },
      { id: 'P8', component: 'Project', instructor: 'Rashid Ahmad & Azmat Ullah', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SWR 103', title: 'Strength Training and Conditioning for Beginners', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Bilal Iqbal Khan', cadence: 'Twice a week - 75 min' },
      { id: 'P2', component: 'Project', instructor: 'Muhammad Shakeel', cadence: 'Twice a week - 75 min' },
      { id: 'P3', component: 'Project', cadence: 'Twice a week - 75 min' },
      { id: 'P4', component: 'Project', instructor: 'Kanwal Yousaf', cadence: 'Twice a week - 75 min' },
      { id: 'P5', component: 'Project', instructor: 'Aruba Naz', cadence: 'Twice a week - 75 min' },
      { id: 'P6', component: 'Project', instructor: 'Shabana Kausar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SWR 104', title: 'Basketball for Beginners', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Mohsin Riaz', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SWR 105', title: 'Walk, Jog and Stretch for Fitness', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Babar Asad Khan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SWR 106', title: 'Squash for Beginners Course', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Qaisar Sarwar', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SWR 107', title: 'Badminton for Beginner Single and Doubles', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Adnan', cadence: 'Twice a week - 75 min' },
    ],
  },
  {
    code: 'SWR 108', title: 'Volleyball for Beginners Course', credits: 1, department: 'Social Work',
    sections: [
      { id: 'P1', component: 'Project', instructor: 'Muhammad Imran', cadence: 'Twice a week - 75 min' },
    ],
  },

  // Technology Management
  {
    code: 'TME 6301', title: 'AI Applications in Business: Strategies for Technology Managers', credits: 3, department: 'Technology Management',
    sections: [
      { id: 'S1', cadence: '3 times a week - 120 min' },
      { id: 'S2', instructor: 'Tanzeel Ur Rehman', cadence: '3 times a week - 120 min' },
    ],
  },

];
