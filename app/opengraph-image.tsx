import { ImageResponse } from 'next/og';

export const alt = 'Akada — a calm study planner for courses, tasks and focused sessions';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Rendered once at build time. Uses only system-default typography so it
// needs no network access and no font files in the bundle.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#FAF8F2',
          color: '#1A1714',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 78,
              border: '3px solid #1A1714',
              background: '#FBF8EF',
              fontSize: 38,
              fontStyle: 'italic',
              fontWeight: 600,
            }}
          >
            A
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em' }}>Akada</div>
            <div
              style={{
                fontSize: 17,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#7A756A',
                marginTop: 4,
              }}
            >
              Study Planner
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 86,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              maxWidth: 900,
            }}
          >
            A quiet place to study.
          </div>
          <div style={{ fontSize: 30, color: '#5A554C', marginTop: 26, maxWidth: 860 }}>
            Courses, assignments, focused study sessions, and the progress to show for them.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', width: 300, height: 3, background: '#1A1714' }} />
          <div style={{ fontSize: 22, color: '#7A756A' }}>Track. Focus. Review.</div>
        </div>
      </div>
    ),
    size,
  );
}
