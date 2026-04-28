const fs = require('fs');
let lines = fs.readFileSync('app/dashboard/page.tsx', 'utf8').split(/\r?\n/);
lines.splice(2, 0, "import { motion, useAnimation, PanInfo } from 'framer-motion';");

const componentStr = `
function DashboardTaskItem({ task, course, isLast, onToggle, onStartTimer }: { task: Task; course?: Course; isLast: boolean; onToggle: (id: string) => void; onStartTimer: (task: Task) => void; }) {
  const controls = useAnimation();
  
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 70;
    if (info.offset.x > threshold) {
      onToggle(task.id);
      controls.start({ x: 0 });
    } else {
      controls.start({ x: 0 });
    }
  };

  return (
    <div className={\`relative overflow-hidden group \${isLast ? '' : 'border-b border-dashed border-line'}\`}>
      <div className="absolute inset-0 flex items-center justify-start px-4 z-0 pointer-events-none">
        <div 
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase opacity-80" 
          style={{ color: course?.color || 'var(--ink)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Complete
        </div>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative z-10 flex items-center gap-3 px-3.5 py-[11px] bg-bg"
      >
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          aria-label="Mark complete"
          className="h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line-strong"
        />
        <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.4] text-ink">
          {task.title}
        </p>
        {course && (
          <button
            type="button"
            onClick={() => onStartTimer(task)}
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{
              background: course.tint || 'var(--bg-tint)',
              color: 'var(--ink)',
            }}
          >
            {course.code}
          </button>
        )}
      </motion.div>
    </div>
  );
}
`;

fs.writeFileSync('app/dashboard/page.tsx', lines.join('\\n') + componentStr);
