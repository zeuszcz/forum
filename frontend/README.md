# endless-war — frontend

Next.js 15 (App Router, RSC) + TypeScript + Tailwind + shadcn/ui.

## Local (without Docker)

```bash
npm install
npm run dev      # http://localhost:3000
```

## Scripts

| Script | What |
|--------|------|
| `npm run dev` | dev server with Turbopack |
| `npm run build` | production build |
| `npm run start` | production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript no-emit check |
| `npm run format` | Prettier write |

## Layout

```
src/
├── app/                Next.js App Router pages
│   ├── layout.tsx      Root layout with Header/Footer
│   ├── page.tsx        Landing page
│   └── globals.css     Design tokens + Tailwind
├── components/
│   ├── ui/             shadcn/ui primitives
│   └── layout/         Header, Footer
└── lib/
    └── utils.ts        cn(), formatters
```

## Adding shadcn components

```bash
npx shadcn@latest add dialog dropdown-menu avatar tooltip
```

## Brand

Tokens are defined in [`src/app/globals.css`](src/app/globals.css) as CSS variables and exposed via Tailwind in [`tailwind.config.ts`](tailwind.config.ts). See root [`docs/brand.md`](../docs/brand.md) for the full system.
