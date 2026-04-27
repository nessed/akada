const fs = require('fs');

let dash = fs.readFileSync('app/dashboard/page.tsx', 'utf8');
dash = dash.replace(
  /  if \(loading\) \{\r?\n    return \(\r?\n      <PageShell>\r?\n        <div className="pt-20 text-center text-muted-soft text-sm font-serif italic">\r?\n          Loading…\r?\n        <\/div>\r?\n      <\/PageShell>\r?\n    \);\r?\n  \}/,
  `  if (loading) {
    return (
      <PageShell>
        <div className="animate-pulse opacity-40">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="h-3 w-16 bg-line rounded mb-2.5" />
              <div className="h-8 w-32 bg-line rounded mb-3" />
              <div className="h-4 w-48 bg-line rounded" />
            </div>
            <div className="h-10 w-10 bg-line rounded-full" />
          </div>
          <div className="h-24 bg-paper border border-line rounded-[14px] mb-8" />
          <div className="flex flex-col gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-paper border border-line rounded-[14px]" />
            ))}
          </div>
        </div>
      </PageShell>
    );
  }`
);

dash = dash.replace(
  /function EmptyPanel\(\{\r?\n  title,\r?\n  text,\r?\n  action,\r?\n  onAction,\r?\n\}: \{\r?\n  title: string;\r?\n  text: string;\r?\n  action: string;\r?\n  onAction: \(\) => void;\r?\n\}\) \{\r?\n  return \(\r?\n    <section className="rounded-\[14px\] border border-dashed border-line-strong bg-paper px-5 py-6 text-center">\r?\n      <h3 className="m-0 font-serif text-\[20px\] font-medium tracking-\[-0.01em\]">\r?\n        \{title\}\r?\n      <\/h3>\r?\n      <p className="mx-auto mt-2 mb-0 max-w-\[280px\] text-\[13px\] leading-\[1.55\] text-muted">\r?\n        \{text\}\r?\n      <\/p>\r?\n      <button\r?\n        type="button"\r?\n        onClick=\{onAction\}\r?\n        className="mt-4 rounded-full bg-ink px-4 py-2 text-xs font-medium text-bg"\r?\n      >\r?\n        \{action\}\r?\n      <\/button>\r?\n    <\/section>\r?\n  \);\r?\n\}/,
  `function EmptyPanel({
  title,
  action,
  onAction,
}: {
  title: string;
  text?: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="py-8 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">
        The page is blank. Add your first course...
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong bg-transparent px-3.5 py-1.5 text-[11px] font-medium text-muted-soft transition-colors hover:border-line-strong hover:text-ink uppercase tracking-[0.04em]"
      >
        <span aria-hidden className="text-[14px] leading-none font-light">+</span>
        {action}
      </button>
    </div>
  );
}`
);

fs.writeFileSync('app/dashboard/page.tsx', dash);

let timer = fs.readFileSync('app/timer/page.tsx', 'utf8');
timer = timer.replace(
  /  if \(!course && !pendingLog\) \{\r?\n    return \(\r?\n      <div className="min-h-\[100dvh\] flex items-center justify-center text-muted-soft text-sm font-serif italic">\r?\n        Loading…\r?\n      <\/div>\r?\n    \);\r?\n  \}/,
  `  if (!course && !pendingLog) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="animate-pulse opacity-40 flex flex-col items-center">
          <div className="h-5 w-20 bg-line rounded mb-2" />
          <div className="h-8 w-48 bg-line rounded mb-16" />
          <div className="h-[264px] w-[264px] rounded-full border-[2.5px] border-line border-dashed" />
        </div>
      </div>
    );
  }`
);
fs.writeFileSync('app/timer/page.tsx', timer);
