---
name: Metropolitan Mall Tenant Portal
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#544245'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#877274'
  outline-variant: '#dac0c3'
  surface-tint: '#9b4054'
  primary: '#9a4054'
  on-primary: '#ffffff'
  primary-container: '#b9586c'
  on-primary-container: '#140003'
  inverse-primary: '#ffb2be'
  secondary: '#76565b'
  on-secondary: '#ffffff'
  secondary-container: '#ffd5db'
  on-secondary-container: '#7a5a5f'
  tertiary: '#795831'
  on-tertiary: '#ffffff'
  tertiary-container: '#947047'
  on-tertiary-container: '#0a0400'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9de'
  primary-fixed-dim: '#ffb2be'
  on-primary-fixed: '#400014'
  on-primary-fixed-variant: '#7c293d'
  secondary-fixed: '#ffd9de'
  secondary-fixed-dim: '#e5bcc2'
  on-secondary-fixed: '#2c1519'
  on-secondary-fixed-variant: '#5c3f44'
  tertiary-fixed: '#ffddba'
  tertiary-fixed-dim: '#eabf8f'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#5f411c'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  headline-xl:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.03em
  body-md:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  space-2xs: 0.25rem
  space-xs: 0.375rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.25rem
  space-2xl: 1.75rem
---

## Brand & Style
The design system embodies a modern, premium architectural aesthetic tailored for retail tenants and property managers at Metropolitan Mall Bekasi. It balances enterprise operational rigor with high-end commercial property refinement. Rather than presenting raw administrative tables or stark wireframes, the interface creates an atmosphere of polished real estate elegance—clean spatial structures, refined micro-surfaces, subtle depth cues, and balanced contrast.

The emotional goal is trust, commercial vitality, and effortless clarity. The visual language blends Swiss-style structural minimalism with tactile modern mobile cards: crisp, expansive surfaces, focused dusty rose and muted mauve tones, deliberate metric framing, and tactile interactive targets designed for high-density mobile usage.

## Colors
The palette elevates the mall's existing base into a refined rainbow-derived architectural palette anchored by dusty rose (`#B9586C`) and a sophisticated mauve/slate accent (`#906E73`). 

- **Primary (`#B9586C`)**: Dominates high-priority actions, strong framing, and prominent card titles.
- **Secondary (`#906E73`)**: Provides focused interactive highlights, active bottom navigation states, and primary badge accents without shouting.
- **Tertiary (`#947047`)**: Utilized for live availability, inventory status indicators, and confirmed slot states.
- **Neutral surfaces**: Grounded on `#F8FAFC` to avoid stark white glare, allowing pure white (`#FFFFFF`) card surfaces to float naturally with distinct structural boundaries.

## Typography
The typography utilizes a clean pairing of **Montserrat** for headlines, figures, and structural badges, and **DM Sans** for descriptions, specifications, and instructions.

Numbers, pricing (`Rp. 70.000,-/hari`), and key metrics receive intentional geometric shaping with negative tracking (`-0.01em` to `-0.02em`) to communicate financial solidity. Technical details (dimensions, material specifications) leverage `body-sm` with balanced weights to preserve legibility in tight vertical spaces.

## Layout & Spacing
The layout follows a disciplined 4px / 8px incremental scale tailored for mobile screens. An outer screen margin of `1.25rem` (20px) creates clean visual breathing room along mobile hardware edges while maximizing usable card canvas.

- **Metric Strips**: Triple-column metric modules use `space-md` gaps with subtle vertical line dividers to keep data dense yet scannable.
- **Card Padding**: Inner card padding is standard at `1rem` (16px), ensuring compact layout efficiency without crowding interactive links or specs.
- **Section Rhythm**: A consistent `1.75rem` (28px) gap separates major categorical sections (e.g., Hero, Stat Bar, Media Categories) to avoid visual fatigue.

## Elevation & Depth
Elevation is achieved using crisp surface layering and soft ambient light rather than harsh drop shadows:

- **Level 0 (Canvas)**: Background surface `#F8FAFC`.
- **Level 1 (Cards & Modules)**: Pure `#FFFFFF` surfaces bounded by a refined 1px border (`#E2E8F0`) paired with an ambient shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)`.
- **Level 2 (Active Sheets / Elevated Cards)**: Elevated interactive elements or floating action buttons receive `0 10px 15px -3px rgba(15, 23, 42, 0.06), 0 4px 6px -4px rgba(15, 23, 42, 0.03)`.
- **Bottom Navigation**: Sticky bar styled with a glass-frosted backdrop blur (`backdrop-filter: blur(12px)`) on `rgba(255, 255, 255, 0.92)` framed by an ultra-clean top border (`#E2E8F0`).

## Shapes
A roundedness level of 2 (`0.5rem` / 8px baseline) provides modern architectural balance—neither excessively blocky nor overly playful:

- **Buttons & Form Controls**: `0.75rem` (12px) for smooth hand ergonomics.
- **Cards & Media Previews**: `1rem` (16px) corner radii for structural balance.
- **Pills & Status Tags**: Fully rounded `9999px` to distinguish quick-scan badges from actionable containers.
- **Media Thumbnails**: `0.75rem` (12px) radius with a subtle inset 1px border overlay to frame user-uploaded assets cleanly.

## Components

### Buttons
- **Primary Action**: Solid `#B9586C` background, `#FFFFFF` text, `0.75rem` border radius, 48px standard touch height, accompanied by a clean directional chevron (`→`). Subtle active state scaling (`0.98`).
- **Secondary Action**: `#FFFFFF` background, 1px border in `#CBD5E1`, `#B9586C` label, paired for equal visual weight without color collision.
- **Inline Text Links**: `#906E73` with medium weight and micro-icons for navigational drill-downs (e.g., `Lacak dengan nomor pengajuan`).

### Stat Metric Bar
- Encased within an unified container or distinct pill containers.
- Numerical values styled with `stat-metric` over a muted uppercase label (`label-sm`).
- Vertical divider lines rendered in `#E2E8F0` to enforce clear data separation without heavy card encapsulation.

### Listing & Media Cards
- Encapsulated within crisp white cards with `1rem` corner rounding and subtle borders.
- **Image thumbnail**: Fixed aspect ratio (e.g., 4:3 or 1:1, 80px mobile thumbnail) with rounded edges.
- **Typography hierarchy**: Item Title (`headline-md`) immediately followed by clean price prominence (`price-tag` in `#0F172A`).
- **Metadata footer**: Accordion toggle for "Ketentuan pemasangan" on the left, paired with a right-aligned highlighted action button or link (`Ajukan Materi →`).

### Status Badges & Pills
- Pill-shaped (`9999px`) tags with low-saturation backgrounds:
  - *Active / Promo*: `#EEF2FF` with `#3730A3` text.
  - *Available / Ready*: `#ECFDF5` with `#059669` text.
  - *Pending Verification*: `#FFFBEB` with `#D97706` text.

### Form Inputs & Filters
- Clean white inputs with 1px border (`#CBD5E1`), transitioning to a 1.5px `#906E73` focus ring.
- Placeholder text in `#94A3B8`.

### Bottom Navigation
- Fixed 64px height with translucent background blur.
- 4 primary destinations: *Katalog*, *Ajukan*, *Lacak*, *Riwayat*.
- Active tab features filled `#B9586C` or `#906E73` icons with a top 2px indicator bar; inactive tabs render in `#94A3B8`.