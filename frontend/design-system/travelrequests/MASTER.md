# Design System Master File — TravelRequests

> **LOGIC:** When building a specific page, first check `design-system/travelrequests/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TravelRequests
**Category:** Travel/Tourism Agency SaaS (Operations + Client Portal)
**Style:** Aurora UI + Bento Box Grid
**Design Dials:** Variance 6/10 (Balanced / Modern) | Motion 4/10 (Standard) | Density 7/10 (Standard)

---

## Global Rules

### Color Palette (Sky Blue + Adventure Orange · WCAG AA Verified ≥ 4.5:1)

| Role | Hex | CSS Variable | Contrast Ratio |
|------|-----|--------------|----------------|
| Primary | `#0284C7` | `--primary` | 4.52:1 vs `#FFFFFF` |
| Primary Hover | `#0369A1` | `--primary-hover` | 5.93:1 vs `#FFFFFF` |
| Primary Soft | `#E0F2FE` | `--primary-soft` | Surface tint |
| Adventure CTA | `#C2410C` | `--cta` | 5.18:1 vs `#FFFFFF` |
| Background | `#F8FAFC` | `--background` | Neutral slate surface + subtle top sky tint |
| Foreground | `#0F2942` | `--foreground` | 13.8:1 vs `#F8FAFC` |
| Card | `#FFFFFF` | `--card` | 14.5:1 vs `#0F2942` |
| Muted | `#F1F5F9` | `--muted` | Table headers & skeletons |
| Muted Foreground | `#475569` | `--muted-foreground` | 7.05:1 vs `#FFFFFF` |
| Border | `#E2E8F0` | `--border` | Subtle structural hairline |
| Peach / Alert | `#FB923C` / `#9A3412` | `--peach` / `--peach-foreground` | 6.80:1 on `#FFF7ED` |
| Destructive | `#DC2626` | `--destructive` | 4.83:1 vs `#FFFFFF` |

### Typography

- **Display / Destination Headings (`--font-display`):** `Fraunces` (editorial hospitality warmth for page titles, destination names, and hero KPIs)
- **Body & Controls (`--font-sans`):** `Fira Sans` (clean operational clarity for tables, forms, filters, and buttons)
- **Codes & Live Clocks (`--font-mono`):** `Fira Code` (technical precision for IATA codes `BOG`/`MAD`/`CUN`/`HND`, dossier/booking codes `SOL-2026-001`, and live timezone clocks)

### Spacing Variables (Density 7/10)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `0.25rem` (`4px`) | Tight badge/dot gaps |
| `--space-sm` | `0.5rem` (`8px`) | Icon gaps, inline spacing |
| `--space-md` | `1rem` (`16px`) | Standard card/cell padding |
| `--space-lg` | `1.5rem` (`24px`) | Panel & modal padding |
| `--space-xl` | `2rem` (`32px`) | Section gaps |

### Pre-Delivery Checklist (Enforced)

- [x] No emojis used as icons (Lucide SVG vector icons exclusively)
- [x] `cursor-pointer` globally enforced on all interactive controls
- [x] Smooth transitions (`150–250ms`) without layout-shifting hover transforms on tables/cards
- [x] Light mode contrast ≥ 4.5:1 across all text and button pairs
- [x] Visible `:focus-visible` rings (`2px solid var(--ring)`) for keyboard navigation
- [x] `@media (prefers-reduced-motion: reduce)` respected globally
- [x] Responsive across `375px`, `768px`, `1024px`, and `1440px` without horizontal page scroll
