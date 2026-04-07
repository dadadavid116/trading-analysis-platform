import { useState, useRef, useEffect } from 'react';
import { sendChatMessage, ChatMessage } from '../api';
import { panelStyles } from './panelStyles';

/**
 * ChatPanel — AI chatbot panel powered by Claude.
 *
 * The user can have a back-and-forth conversation with Claude about BTC market
 * data. Claude has access to live market context and can create, list, and
 * delete price alerts on behalf of the user.
 *
 * Designed to support multiple models in the future — the model selector is
 * already in place but only "Claude" is active until other API keys are added.
 */

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '420px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2a2a2e',
    paddingBottom: '8px',
    marginBottom: '4px',
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
  messageList: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '8px 0',
  },
  bubble: (role: 'user' | 'assistant'): React.CSSProperties => ({
    maxWidth: '85%',
    padding: '8px 12px',
    borderRadius: role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    backgroundColor: role === 'user' ? '#1e3a5f' : '#1e1e26',
    color: '#d0d0d0',
    fontSize: '13px',
    lineHeight: '1.5',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    border: role === 'assistant' ? '1px solid #2a2a2e' : 'none',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  }),
  roleLabel: (role: 'user' | 'assistant'): React.CSSProperties => ({
    fontSize: '10px',
    color: '#666',
    marginBottom: '2px',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
  }),
  inputRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: '#111114',
    border: '1px solid #2a2a2e',
    borderRadius: '6px',
    color: '#d0d0d0',
    fontSize: '13px',
    padding: '8px 10px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    minHeight: '36px',
    maxHeight: '100px',
  },
  sendButton: (disabled: boolean): React.CSSProperties => ({
    backgroundColor: disabled ? '#2a2a2e' : '#1e3a5f',
    border: 'none',
    borderRadius: '6px',
    color: disabled ? '#555' : '#90b8e0',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    padding: '0 16px',
    flexShrink: 0,
    transition: 'background-color 0.15s',
  }),
  typing: {
    color: '#555',
    fontSize: '12px',
    fontStyle: 'italic',
    alignSelf: 'flex-start',
  },
  errorBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a1a1a',
    border: '1px solid #5f2a2a',
    borderRadius: '8px',
    color: '#f44336',
    fontSize: '12px',
    padding: '6px 10px',
  },
};

// ── Available models ───────────────────────────────────────────────────────────
// Add more entries here when OpenAI/xAI keys are available.
const MODELS = [
  { value: 'claude', label: 'Claude' },
  // { value: 'chatgpt', label: 'ChatGPT' },  // enable when OPENAI_API_KEY is set
  // { value: 'grok',   label: 'Grok'    },  // enable when XAI_API_KEY is set
];

// ── Component ──────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

function ChatPanel() {
  const [model, setModel] = useState('claude');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content:
        'Hi! I\'m your BTC trading assistant. I have access to live market data and can manage your price alerts.\n\nTry asking:\n• "What\'s the current BTC price?"\n• "Set an alert when BTC goes above $70,000"\n• "Show my alerts"\n• "Delete alert #3"',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Build the history sent to the backend (exclude error messages and the
  // initial greeting since it's hardcoded, not from the API).
  function buildHistory(): { role: 'user' | 'assistant'; content: string }[] {
    return messages
      .filter((m) => m.role !== 'error')
      .slice(1) // skip the hardcoded greeting
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: DisplayMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const history = buildHistory();
      const response = await sendChatMessage(text, history, model);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.reply },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Send on Enter, new line on Shift+Enter.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{ ...panelStyles.card, padding: '16px' }}>
      <div style={styles.container}>
        {/* Header */}
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

        {/* Message list */}
        <div style={styles.messageList}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <span style={styles.roleLabel(msg.role === 'user' ? 'user' : 'assistant')}>
                {msg.role === 'user' ? 'You' : msg.role === 'error' ? '' : 'Claude'}
              </span>
              {msg.role === 'error' ? (
                <div style={styles.errorBubble}>{msg.content}</div>
              ) : (
                <div style={styles.bubble(msg.role === 'user' ? 'user' : 'assistant')}>
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <span style={styles.typing}>Claude is thinking…</span>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <div style={styles.inputRow}>
          <textarea
            style={styles.input}
            placeholder="Ask about BTC or set a price alert… (Enter to send)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
    </div>
  );
}

export default ChatPanel;
