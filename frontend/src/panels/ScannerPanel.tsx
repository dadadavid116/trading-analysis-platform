import type { CSSProperties } from 'react';

export default function ScannerPanel() {
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Market Scanner</span>
        <span style={badgeStyle}>Phase 30</span>
      </div>
      <div style={bodyStyle}>
        <div style={iconStyle}>⚡</div>
        <div style={labelStyle}>Multi-asset signal scanner</div>
        <div style={subStyle}>
          Momentum breakouts · Liquidation clusters · OI divergence
        </div>
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display:         'flex',
  flexDirection:   'column',
  height:          '100%',
  backgroundColor: '#0d0d10',
  overflow:        'hidden',
};

const headerStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  gap:             '8px',
  padding:         '8px 14px',
  borderBottom:    '1px solid #1e1e22',
  backgroundColor: '#111115',
  flexShrink:      0,
};

const titleStyle: CSSProperties = {
  fontSize:      '12px',
  fontWeight:    600,
  color:         '#ccc',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const badgeStyle: CSSProperties = {
  fontSize:        '10px',
  padding:         '1px 6px',
  borderRadius:    '3px',
  border:          '1px solid #2a2a3a',
  color:           '#555',
  backgroundColor: '#111',
};

const bodyStyle: CSSProperties = {
  flex:           1,
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            '8px',
  opacity:        0.35,
};

const iconStyle: CSSProperties = { fontSize: '28px' };

const labelStyle: CSSProperties = {
  color:      '#888',
  fontSize:   '13px',
  fontWeight: 600,
};

const subStyle: CSSProperties = {
  color:     '#555',
  fontSize:  '11px',
  textAlign: 'center',
  maxWidth:  '200px',
  lineHeight: '1.5',
};
