import type { SVGProps } from 'react';

const paths = {
  brand: 'M5 4h5v6H5zM14 4h5v6h-5zM5 14h5v6H5zM14 14h5v6h-5z',
  chat: 'M4 4h16v12H9l-5 4z',
  assets: 'm3 7 9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4-4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  arrow: 'M12 19V5m-6 6 6-6 6 6',
  expand: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  close: 'm6 6 12 12M6 18 18 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  source: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  stop: 'M6 6h12v12H6z',
  refresh: 'M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5M5 12a7 7 0 0 0 12 5',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',
  trend: 'M3 3v18h18M6 15l5-5 4 2 6-7',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6',
} as const;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
