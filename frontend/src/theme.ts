// SentinelCore SOC Theme Configuration

export const theme = {
  colors: {
    bg: '#0A0F14',
    panel: '#111927',
    panelAlt: '#0F1720',
    border: '#1F2A37',

    textPrimary: '#E6EDF3',
    textSecondary: '#9FB3C8',
    textDim: '#6B7C93',

    critical: '#FF3B3B',
    error: '#FF8A00',
    warning: '#FFD600',
    info: '#3BA4FF',
    success: '#00C853',

    hover: '#162131',
    highlight: '#1E293B',
    
    // Explicit row highlighting for high severity
    rowCriticalBg: '#2A0F10',
    rowErrorBg: '#2A1A0F',
  },
  typography: {
    fontFamily: '"Inter", monospace',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  density: {
    rowHeight: '30px',
    padding: '4px 8px',
  },
};

export type Theme = typeof theme;
