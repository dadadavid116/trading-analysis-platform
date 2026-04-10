import { useState, useRef, useEffect } from 'react';
import { sendChatMessage, validateStrategy, ChatMessage, StrategyResult } from '../api';
import { panelStyles } from './panelStyles';

/**
 * ChatPanel — AI chatbot panel powered by Claude.
 *
 * Renders a fixed-height scrollable conversation. Claude's markdown responses
 * (headings, bold, bullets, numbered lists, inline code) are formatted
 * for readability rather than displayed as raw symbols.
 */

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    // Fixed height so the message area scrolls instead of pushing the page down.
    height: '640px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1a1f',
    border: '1px solid #2a2a2e',
    borderRadius: '8px',
    padding: '16px',
    gap: '0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2a2a2e',
    paddingBottom: '10px',
    marginBottom: '10px',
    flexShrink: 0,
  },
  modelSelector: {
    backgroundColor: '#111114',
    border: '1px solid #2a2a2e',
    borderRadius: '4px',
    color: '#c8c8c8',
    fontSize: '11px',
    padding: '3px 6px',
    cursor: 'pointer',
  },
  // The scrollable message area — flex: 1 + minHeight: 0 is the key to making
  // a flex child scroll instead of overflow its parent.
  messageList: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '4px 2px',
    minHeight: 0,
  },
  messageGroup: (role: 'user' | 'assistant' | 'error'): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: role === 'user' ? 'flex-end' : 'flex-start',
  }),
  roleLabel: (role: 'user' | 'assistant'): React.CSSProperties => ({
    fontSize: '10px',
    color: '#555',
    marginBottom: '3px',
    paddingLeft: role === 'assistant' ? '2px' : '0',
    paddingRight: role === 'user' ? '2px' : '0',
  }),
  bubble: (role: 'user' | 'assistant'): React.CSSProperties => ({
    maxWidth: '88%',
    padding: role === 'user' ? '9px 13px' : '10px 14px',
    borderRadius: role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
    backgroundColor: role === 'user' ? '#1e3a5f' : '#1e1e28',
    color: '#d4d4d4',
    fontSize: '13px',
    lineHeight: '1.6',
    border: role === 'assistant' ? '1px solid #2a2a38' : 'none',
    wordBreak: 'break-word' as const,
  }),
  errorBubble: {
    maxWidth: '88%',
    alignSelf: 'flex-start',
    backgroundColor: '#2a1a1a',
    border: '1px solid #5f2a2a',
    borderRadius: '8px',
    color: '#f44336',
    fontSize: '12px',
    padding: '7px 11px',
  },
  typing: {
    color: '#555',
    fontSize: '12px',
    fontStyle: 'italic',
    alignSelf: 'flex-start',
    paddingLeft: '4px',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #2a2a2e',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: '#111114',
    border: '1px solid #2a2a2e',
    borderRadius: '6px',
    color: '#d0d0d0',
    fontSize: '13px',
    padding: '9px 11px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    minHeight: '38px',
    overflowY: 'hidden' as const,  // JS overrides to 'auto' once content exceeds the cap
  },
  sendButton: (disabled: boolean): React.CSSProperties => ({
    backgroundColor: disabled ? '#1e1e26' : '#1e3a5f',
    border: `1px solid ${disabled ? '#2a2a2e' : '#2a4a7f'}`,
    borderRadius: '6px',
    color: disabled ? '#444' : '#90b8e0',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    padding: '0 18px',
    flexShrink: 0,
    transition: 'all 0.15s',
  }),
  strategyButton: (disabled: boolean): React.CSSProperties => ({
    backgroundColor: disabled ? '#1e1e26' : '#1e2a1e',
    border: `1px solid ${disabled ? '#2a2a2e' : '#2a5f2a'}`,
    borderRadius: '6px',
    color: disabled ? '#444' : '#66bb6a',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    padding: '0 10px',
    flexShrink: 0,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  }),
};

// ── Markdown renderer ──────────────────────────────────────────────────────────
//
// Parses the subset of markdown Claude typically emits:
//   ## / ### headings, **bold**, *italic*, `code`, - / • / 1. lists
//
// Returns React nodes — no external dependency needed.

function renderInline(text: string, key?: number): React.ReactNode {
  // Split on **bold**, *italic*, `code` spans.
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g);
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} style={{ color: '#f0c040', fontWeight: 700 }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={i} style={{ color: '#b0c8e8' }}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={i}
              style={{
                backgroundColor: '#111114',
                color: '#90b8e0',
                fontSize: '12px',
                padding: '1px 5px',
                borderRadius: '3px',
                border: '1px solid #2a2a3e',
                fontFamily: 'monospace',
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </span>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // ── H2 heading ──
    if (line.startsWith('## ')) {
      nodes.push(
        <div
          key={i}
          style={{
            fontWeight: 700,
            fontSize: '14px',
            color: '#e8e8e8',
            marginTop: nodes.length > 0 ? '12px' : '0',
            marginBottom: '4px',
            borderBottom: '1px solid #2a2a38',
            paddingBottom: '3px',
          }}
        >
          {renderInline(line.slice(3))}
        </div>
      );
      i++;
      continue;
    }

    // ── H3 heading ──
    if (line.startsWith('### ')) {
      nodes.push(
        <div
          key={i}
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: '#c8c8e0',
            marginTop: nodes.length > 0 ? '8px' : '0',
            marginBottom: '2px',
          }}
        >
          {renderInline(line.slice(4))}
        </div>
      );
      i++;
      continue;
    }

    // ── Unordered bullet: -, •, or * at line start ──
    if (/^[-•*]\s/.test(line)) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: '4px' }}>
          <span style={{ color: '#4a90d9', flexShrink: 0, marginTop: '1px' }}>•</span>
          <span style={{ flex: 1 }}>{renderInline(line.replace(/^[-•*]\s+/, ''))}</span>
        </div>
      );
      i++;
      continue;
    }

    // ── Ordered list: "1. " ──
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: '4px' }}>
          <span
            style={{
              color: '#4a90d9',
              flexShrink: 0,
              minWidth: '18px',
              textAlign: 'right',
              marginTop: '1px',
            }}
          >
            {numMatch[1]}.
          </span>
          <span style={{ flex: 1 }}>{renderInline(numMatch[2])}</span>
        </div>
      );
      i++;
      continue;
    }

    // ── Horizontal rule ──
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #2a2a38', margin: '8px 0' }} />);
      i++;
      continue;
    }

    // ── Blank line → small gap ──
    if (line.trim() === '') {
      // Avoid stacking multiple gaps
      const last = nodes[nodes.length - 1];
      const isGap = last && (last as React.ReactElement)?.props?.style?.height !== undefined;
      if (!isGap && nodes.length > 0) {
        nodes.push(<div key={i} style={{ height: '6px' }} />);
      }
      i++;
      continue;
    }

    // ── Regular paragraph line ──
    nodes.push(
      <div key={i} style={{ lineHeight: '1.65' }}>
        {renderInline(line)}
      </div>
    );
    i++;
  }

  return <>{nodes}</>;
}

// ── Available models ───────────────────────────────────────────────────────────

const MODELS = [
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'ChatGPT' },
  // { value: 'grok', label: 'Grok' },  // coming in a future phase
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: 'user' | 'assistant' | 'error' | 'strategy';
  content: string;
  strategyData?: StrategyResult;   // only present for role === 'strategy'
  strategyApproved?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

function ChatPanel() {
  const [model, setModel] = useState('claude');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm your BTC trading assistant. Use the selector above to switch between **Claude** and **ChatGPT** — both have access to live market data and can manage your price alerts.\n\nTry asking:\n• \"What's the current BTC price?\"\n• \"Set an alert when BTC goes above $70,000\"\n• \"Show my alerts\"\n• \"Delete alert #3\"",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'chat' | 'strategy'>('chat');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to the latest message whenever the list changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Grow the textarea to fit its content up to MAX_INPUT_HEIGHT, then scroll.
  const MAX_INPUT_HEIGHT = 140;
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';                                      // shrink first so scrollHeight is accurate
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + 'px';
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
  }

  function buildHistory(): ChatMessage[] {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(1) // skip hardcoded greeting
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  function resetTextarea() {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }

  // Core chat send — reused by both the Send button and Approve & Set Alert.
  async function sendMessage(text: string) {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    setLoadingType('chat');
    try {
      const response = await sendChatMessage(text, buildHistory(), model);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [...prev, { role: 'error', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    resetTextarea();
    await sendMessage(text);
  }

  // Validate Strategy — sends to the OpenAI→Claude pipeline.
  async function handleValidateStrategy() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    resetTextarea();
    setLoading(true);
    setLoadingType('strategy');
    try {
      const result = await validateStrategy(text);
      setMessages((prev) => [
        ...prev,
        { role: 'strategy', content: result.name ?? 'Strategy', strategyData: result, strategyApproved: false },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [...prev, { role: 'error', content: `Strategy validation error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  // Approve & Set Alert — marks the card approved and auto-sends to Claude.
  function handleApproveStrategy(msgIndex: number, data: StrategyResult) {
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, strategyApproved: true } : m)),
    );
    const approvalMsg =
      `I've approved this trading strategy: "${data.name}". ` +
      `Entry: ${data.entry_condition}. Exit: ${data.exit_condition}. ` +
      `Timeframe: ${data.timeframe}. ` +
      `Take profit: ${data.take_profit}. Stop loss: ${data.stop_loss}. ` +
      `Based on these parameters, please suggest and create appropriate price alerts.`;
    sendMessage(approvalMsg);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={styles.panel}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          AI Chat — BTC/USDT
        </h2>
        <select
          style={styles.modelSelector}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Scrollable message list ── */}
      <div style={styles.messageList}>
        {messages.map((msg, i) => (
          <div key={i} style={styles.messageGroup(msg.role === 'strategy' ? 'assistant' : msg.role)}>
            {msg.role !== 'error' && msg.role !== 'strategy' && (
              <span style={styles.roleLabel(msg.role === 'user' ? 'user' : 'assistant')}>
                {msg.role === 'user'
                  ? 'You'
                  : MODELS.find((m) => m.value === model)?.label ?? 'Assistant'}
              </span>
            )}

            {msg.role === 'error' ? (
              <div style={styles.errorBubble}>{msg.content}</div>
            ) : msg.role === 'strategy' ? (
              <StrategyCard
                result={msg.strategyData!}
                approved={msg.strategyApproved ?? false}
                onApprove={() => handleApproveStrategy(i, msg.strategyData!)}
              />
            ) : msg.role === 'user' ? (
              <div style={styles.bubble('user')}>{msg.content}</div>
            ) : (
              <div style={styles.bubble('assistant')}>{renderMarkdown(msg.content)}</div>
            )}
          </div>
        ))}

        {loading && (
          <span style={styles.typing}>
            {loadingType === 'strategy'
              ? 'Validating strategy…'
              : `${MODELS.find((m) => m.value === model)?.label ?? 'Assistant'} is thinking…`}
          </span>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input row ── */}
      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          style={styles.input}
          placeholder="Ask about BTC or set a price alert… (Enter to send)"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={1}
        />
        <button
          style={styles.sendButton(loading || !input.trim())}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
        <button
          style={styles.strategyButton(loading || !input.trim())}
          onClick={handleValidateStrategy}
          disabled={loading || !input.trim()}
          title="Validate this text as a trading strategy (OpenAI → Claude pipeline)"
        >
          Validate Strategy
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;

// ── Strategy card ──────────────────────────────────────────────────────────────

interface StrategyCardProps {
  result: StrategyResult;
  approved: boolean;
  onApprove: () => void;
}

function StrategyCard({ result, approved, onApprove }: StrategyCardProps) {
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#111118',
    border: `1px solid ${result.valid ? '#2a5f2a' : '#5f2a2a'}`,
    borderRadius: '10px',
    padding: '12px 14px',
    maxWidth: '92%',
    fontSize: '12px',
  };

  if (!result.valid) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#f44336', fontWeight: 700, marginBottom: '6px', fontSize: '13px' }}>
          Invalid Strategy
        </div>
        <p style={{ color: '#aaa', margin: 0, lineHeight: '1.5' }}>{result.reason}</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ color: '#f5a623', fontWeight: 700, fontSize: '13px' }}>{result.name}</span>
        <span style={{ color: '#66bb6a', fontSize: '11px' }}>✓ Validated by OpenAI</span>
      </div>

      {/* Claude's summary */}
      <p style={{ color: '#c8c8c8', margin: '0 0 10px', lineHeight: '1.55' }}>
        {result.summary}
      </p>

      {/* Parameters grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr',
        gap: '3px 8px',
        backgroundColor: '#0e0e14',
        border: '1px solid #1e1e28',
        borderRadius: '6px',
        padding: '8px 10px',
        marginBottom: '10px',
        lineHeight: '1.6',
      }}>
        <Param label="Entry"      value={result.entry_condition ?? ''} />
        <Param label="Exit"       value={result.exit_condition  ?? ''} />
        <Param label="Timeframe"  value={result.timeframe       ?? ''} />
        <Param label="Stop Loss"  value={result.stop_loss       ?? ''} />
        <Param label="Take Profit" value={result.take_profit    ?? ''} />
      </div>

      {/* Action */}
      {approved ? (
        <span style={{ color: '#66bb6a', fontSize: '11px' }}>
          Approved — Claude is setting your alerts…
        </span>
      ) : (
        <button onClick={onApprove} style={approveButtonStyle}>
          Approve &amp; Set Alert
        </button>
      )}
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: '#666', fontSize: '11px' }}>{label}</span>
      <span style={{ color: '#c0c0c0', fontSize: '11px' }}>{value}</span>
    </>
  );
}

const approveButtonStyle: React.CSSProperties = {
  backgroundColor: '#1e2a1e',
  border: '1px solid #2a5f2a',
  borderRadius: '6px',
  color: '#66bb6a',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  padding: '5px 14px',
  transition: 'all 0.15s',
};
