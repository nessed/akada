const fs = require('fs');
let lines = fs.readFileSync('app/dashboard/page.tsx', 'utf8').split(/\r?\n/);
lines.splice(436, 34,
`              todayTasks.map((task, index) => (
                <DashboardTaskItem 
                  key={task.id} 
                  task={task} 
                  course={courses.find((c) => c.id === task.courseId)} 
                  isLast={index === todayTasks.length - 1} 
                  onToggle={handleToggleTask} 
                  onStartTimer={handleStartTimerForTask} 
                />
              ))`
);
fs.writeFileSync('app/dashboard/page.tsx', lines.join('\\n'));
