// Configuração de marca para o Observatory. Tudo via env — o repo público
// não conhece marca específica. Quem instala configura.
//
// CTBZ_BRAND_PRIMARY      — marca a ser monitorada (ex: 'Acme'). Default 'YourBrand'.
// CTBZ_BRAND_COMPETITORS  — comma-sep de concorrentes a rastrear no scoring.

export interface BrandConfig {
  primary: string;
  competitors: string[];
  all: string[];
}

const DEFAULT_PRIMARY = 'YourBrand';

export function getBrandConfig(): BrandConfig {
  const primary = (process.env.CTBZ_BRAND_PRIMARY || DEFAULT_PRIMARY).trim();
  const competitors = (process.env.CTBZ_BRAND_COMPETITORS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    primary,
    competitors,
    all: [primary, ...competitors],
  };
}

// Concorrente principal para métricas de gap (primeiro da lista, ou null).
export function primaryCompetitor(b: BrandConfig = getBrandConfig()): string | null {
  return b.competitors[0] ?? null;
}
