# Akada — UI & Aesthetic Design Choices

This document outlines the core visual philosophy, UI elements, and styling choices behind the Akada Study Planner. The app is designed to feel like a "quiet place to study"—minimalist, organic, and distraction-free, mimicking the tactile feel of a high-quality physical notebook.

## 🎨 Visual Philosophy & Aesthetic
Akada's design moves away from the stark, high-contrast flat designs typical of modern software. Instead, it leans into a **warm, organic "notebook" aesthetic**. It feels tangible, calming, and personal, utilizing soft paper tones, ink-like typography, and soothing pastel accents.

## 🖌️ Color Palette
The color system is heavily curated to resemble premium paper, ink, and mild highlighters.

### Core Foundation (Paper & Ink)
- **Backgrounds (`bg`, `bg-tint`, `paper`)**: The app uses `#FAFAF6` as its primary background, an off-white, slightly warm tone resembling high-quality journal paper. True white (`#FFFFFF`) is used sparingly for elevated cards.
- **Lines (`line`, `line-strong`)**: `#E8E5DC` and `#DDD8CB`. Borders and dividers resemble the faint ruled lines of a notebook rather than harsh digital borders.
- **Text (`ink`, `ink-soft`, `muted`)**: Instead of pure black, text relies on deep, warm charcoals like `#1A1915` and `#4B4943`, mimicking the look of pen ink and reducing eye strain.

### The Pastel Highlighter Palette
For course categorization and tags, Akada uses a beautifully crafted palette of muted pastels. Each color is paired with a soft "tint" version used for backgrounds, while the strong value is used for text, borders, or accents.
- **Sage**: `#A8B89B`
- **Rose**: `#D4A5A5`
- **Lavender**: `#B5A8C9`
- **Peach**: `#E2B594`
- **Sky**: `#A8BCC9`
- **Clay**: `#C99B7E`
- **Butter**: `#D9C58C`
- **Mint**: `#9FC1B0`
- **Slate**: `#9AA3AB`
- **Mauve**: `#B89BAA`

## 🖋️ Typography
Typography in Akada blends modern readability with classic literary elegance.
- **Sans-Serif (`Inter`)**: Used for the majority of the UI, providing clean, highly legible structure.
- **Serif (`Fraunces`)**: Applied to headings, quotes, or focal points to give the application an elegant, editorial, and sophisticated character.
- **Monospace (`JetBrains Mono`)**: Used purposefully for data, durations, and the study timer, grounding the numbers in a precise, tool-like feel.

## 🖼️ Textures & Custom UI Elements
- **Radial Mesh Gradients**: The global background (`globals.css`) incorporates very subtle radial gradients `rgba(180, 170, 140, 0.10)`. This uneven lighting effect breathes life into the background, making the "paper" feel slightly textured and organic rather than a flat digital canvas.
- **Notebook Range Sliders**: The native `<input type="range">` elements are deeply customized to resemble tactile physical knobs sitting on top of notebook lines.
- **Clean App Chrome**: Scrollbars are entirely hidden across the application, achieving a seamless, native-app feel that doesn't distract the user.

## 🎬 Micro-Animations
Movement in the app is soft and deliberate:
- **`slide-up`**: A smooth `0.26s` entrance using a custom cubic-bezier curve (`0.2, 0.7, 0.2, 1`), ensuring panels and modals float in weightlessly.
- **`fade-in`**: Subtle opacity transitions for dynamic content.
- **`tick`**: A slow, `2.4s` pulsing animation used during active study timers to indicate progression without frantic or stressful ticking.
