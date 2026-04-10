import { useState, useRef, useEffect } from 'react';
import { sendChatMessage, ChatMessage } from '../api';
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
  role: 'user' | 'assistant' | 'error';
  content: string;
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

  function buildHistory(): { role: 'user' | 'assistant'; content: string }[] {
    return messages
      .filter((m) => m.role !== 'error')
      .slice(1) // skip hardcoded greeting
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    // Reset textarea height back to one line after sending.
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
    setLoading(true);

    try {
      const response = await sendChatMessage(text, buildHistory(), model);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [...prev, { role: 'error', content: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
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
          <div key={i} style={styles.messageGroup(msg.role)}>
            {msg.role !== 'error' && (
              <span style={styles.roleLabel(msg.role === 'user' ? 'user' : 'assistant')}>
                {msg.role === 'user'
                  ? 'You'
                  : MODELS.find((m) => m.value === model)?.label ?? 'Assistant'}
              </span>
            )}

            {msg.role === 'error' ? (
              <div style={styles.errorBubble}>{msg.content}</div>
            ) : msg.role === 'user' ? (
              // User messages: plain text, no markdown needed.
              <div style={styles.bubble('user')}>{msg.content}</div>
            ) : (
              // Assistant messages: full markdown rendering.
              <div style={styles.bubble('assistant')}>{renderMarkdown(msg.content)}</div>
            )}
          </div>
        ))}

        {loading && (
          <span style={styles.typing}>
            {MODELS.find((m) => m.value === model)?.label ?? 'Assistant'} is thinking…
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
      </div>
    </div>
  );
}

export default ChatPanel;
