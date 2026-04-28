const fs = require('fs');

function replaceLines(file, start, count, replacement) {
  let lines = fs.readFileSync(file, 'utf8').split(/\\r?\\n/);
  lines.splice(start, count, replacement);
  fs.writeFileSync(file, lines.join('\\n'));
}

replaceLines('components/SettingsSheet.tsx', 172, 10,
`                <img
                  src={shownAvatar || '/default-avatar.png'}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />`);

replaceLines('app/onboarding/page.tsx', 333, 7,
`              <img src={avatarPreview || '/default-avatar.png'} alt="Avatar" className="w-full h-full object-cover" />`);
