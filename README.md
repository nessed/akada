# Akada — Study Planner

*A quiet place to study.*

Akada is a modern, beautifully designed academic planner and study companion built to help students track their coursework, manage tasks, and optimize their study sessions. It provides an intuitive interface for planning semesters, setting daily and weekly goals, and measuring study productivity over time.

## 🚀 Features

- **Course Management:** Organize your classes by color, track weekly goal hours, and manage your academic load efficiently.
- **Task Tracking:** Keep tabs on assignments and deadlines, with priority levels and course association.
- **Study Timer:** Built-in timer to log focused study sessions directly to specific courses and tasks.
- **Progress & Stats:** Visualize your study habits and monitor your performance across different subjects over the semester.
- **User Onboarding:** Seamless profile setup, custom avatar support, and personalized daily goal configurations.
- **Secure Authentication:** Full user authentication and data protection powered by Supabase Row Level Security (RLS).

## 🛠️ Tech Stack

- **Frontend Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Fonts:** Inter, JetBrains Mono, and Fraunces (via `next/font`)

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18+)
- A Supabase project

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd academic-planner
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env.local` file in the root directory and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Database Setup:**
   Run the SQL statements found in `supabase/schema.sql` in your Supabase project's SQL Editor to create the necessary tables and Row Level Security (RLS) policies.

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## 🗄️ Database Schema Overview

The Supabase database consists of the following core tables:
- `courses`: Stores user's active classes, colors, and weekly study goals.
- `tasks`: Associated with courses, tracks deadlines and priority levels.
- `sessions`: Logs individual study sessions, duration, and optional notes.
- `semesters`: Tracks the academic term boundaries for a user.
- `user_settings`: User profile data including display name, avatar URL, and daily goals.

All tables are protected by Row Level Security (RLS) policies ensuring users can only access their own data.

## 📄 License
This project is for personal or academic use.
