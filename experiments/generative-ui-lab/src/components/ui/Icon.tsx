import type { SVGProps } from 'react';

const paths = {
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  library: 'M4 5h5v15H4zM10 5h5v15h-5M17 4l4 15',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  inspect: 'M8 4H5v16h14V4h-3M8 3h8v4H8zM8 12h8M8 16h5',
  trend: 'M4 4v16h16M7 15l4-5 4 2 5-7',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',
  'arrow-up': 'M12 19V5m-6 6 6-6 6 6',
  'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  bookmark: 'M6 4h12v17l-6-4-6 4z',
  compass: 'm15 9-2 4-4 2 2-4 4-2ZM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
