export const ports = {
  server: 3000,
  website: 3001,
  dashboard: 3002,
} as const;

export type AppName = keyof typeof ports;
