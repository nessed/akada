const fs = require('fs');

let content = fs.readFileSync('app/dashboard/page.tsx', 'utf8');

const target = `              todayTasks.map((task, index) => {
                const course = courses.find((c) => c.id === task.courseId);
                return (
                  <div
                    key={task.id}
                    className={\`flex items-center gap-3 px-3.5 py-[11px] \${
                      index < todayTasks.length - 1 ? 'border-b border-dashed border-line' : ''
                    }\`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTask(task.id)}
                      aria-label="Mark complete"
                      className="h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line-strong"
                    />
                    <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.4] text-ink">
                      {task.title}
                    </p>
                    {course && (
                      <button
                        type="button"
                        onClick={() => handleStartTimerForTask(task)}
                        className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
                        style={{
                          background: course.tint || 'var(--bg-tint)',
                          color: 'var(--ink)',
                        }}
                      >
                        {course.code}
                      </button>
                    )}
                  </div>
                );
              })`;

const replacement = `              todayTasks.map((task, index) => (
                <DashboardTaskItem 
                  key={task.id} 
                  task={task} 
                  course={courses.find((c) => c.id === task.courseId)} 
                  isLast={index === todayTasks.length - 1} 
                  onToggle={handleToggleTask} 
                  onStartTimer={handleStartTimerForTask} 
                />
              ))`;

content = content.replace(target, replacement);

fs.writeFileSync('app/dashboard/page.tsx', content);
