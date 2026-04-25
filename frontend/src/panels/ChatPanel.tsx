import { useState, useRef, useEffect, useCallback } from 'react';
import {
  sendChatMessage,
  validateStrategy,
  saveChatSession,
  fetchChatSessions,
  fetchChatSession,
  ChatMessage,
  StrategyResult,
  ChatSessionSummary,
} from '../api';

/**
 * ChatPanel — full-height AI chat panel, docked to the right side of the dashboard.
 *
 * Header:  title + "Chat Settings" toggle button.
 *
 * Chat Settings panel (collapsible):
 *   - Model selector (Claude / ChatGPT)
 *   - Save this chat  / Clear this chat buttons
 *   - Recent session list — click any session to resume it
 *
 * Message area: scrollable conversation with Claude markdown rendering.
 * Input row:    auto-growing textarea + Send + Validate Strategy buttons.
 */

// ── Available models ───────────────────────────────────────────────────────────

const MODELS = [
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'ChatGPT' },
  // { value: 'grok', label: 'Grok' },  // Phase 24
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: 'user' | 'assistant' | 'error' | 'strategy';
  content: string;
  strategyData?: StrategyResult;
  strategyApproved?: boolean;
}

const GREETING: DisplayMessage = {
  role: 'assistant',
  content:
    "Hi! I'm your BTC trading assistant. Click **Chat Settings** above to switch models, save or clear this chat, or resume a past session.\n\nTry asking:\n• \"What's the current BTC price?\"\n• \"Set an alert when BTC goes above $70,000\"\n• \"Show my alerts\"\n• \"Analyse the current market conditions\"",
};

// ── Styles ─────────────────────────────────────────────────────────────────────

// Dynamic style functions extracted so the S record can be purely CSSProperties.
function msgGroupStyle(role: 'user' | 'assistant' | 'error'): React.CSSProperties {
  return { display: 'flex', flexDirection: 'column', alignItems: role === 'user' ? 'flex-end' : 'flex-start' };
}
function roleLabelStyle(role: 'user' | 'assistant'): React.CSSProperties {
  return { fontSize: '10px', color: '#555', marginBottom: '3px', paddingLeft: role === 'assistant' ? '2px' : '0', paddingRight: role === 'user' ? '2px' : '0' };
}
function bubbleStyle(role: 'user' | 'assistant'): React.CSSProperties {
  return {
    maxWidth: '92%', padding: role === 'user' ? '8px 12px' : '10px 13px',
    borderRadius: role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
    backgroundColor: role === 'user' ? '#1e3a5f' : '#1e1e28',
    color: '#d4d4d4', fontSize: '13px', lineHeight: '1.6',
    border: role === 'assistant' ? '1px solid #2a2a38' : 'none', wordBreak: 'break-word',
  };
}

const S: Record<string, React.CSSProperties> = {
  panel:       { height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1f', overflow: 'hidden' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2a2e', flexShrink: 0, backgroundColor: '#16161f' },
  headerTitle: { fontSize: '14px', fontWeight: 600, color: '#d0d0d0', margin: 0 },
  messageList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 14px', minHeight: 0 },
  errorBubble: { maxWidth: '92%', alignSelf: 'flex-start', backgroundColor: '#2a1a1a', border: '1px solid #5f2a2a', borderRadius: '8px', color: '#f44336', fontSize: '12px', padding: '7px 11px' },
  typing:      { color: '#555', fontSize: '12px', fontStyle: 'italic', alignSelf: 'flex-start', paddingLeft: '4px' },
  inputRow:    { display: 'flex', gap: '6px', padding: '10px 14px', borderTop: '1px solid #2a2a2e', flexShrink: 0, backgroundColor: '#16161f' },
  input:       { flex: 1, backgroundColor: '#111114', border: '1px solid #2a2a2e', borderRadius: '6px', color: '#d0d0d0', fontSize: '13px', padding: '8px 10px', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: '1.4', minHeight: '36px', overflowY: 'hidden' },
};

// Small helpers for button styles.
const settingsBtn = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? '#1e2a3a' : 'transparent',
  border: `1px solid ${active ? '#3a5a7a' : '#2a2a3e'}`,
  borderRadius: '5px',
  color: active ? '#90b8e0' : '#666',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600,
  padding: '4px 10px',
  transition: 'all 0.15s',
});

const actionBtn = (variant: 'send' | 'strategy' | 'save' | 'clear', disabled = false): React.CSSProperties => {
  const base: React.CSSProperties = {
    border: '1px solid',
    borderRadius: '5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'all 0.15s',
    padding: '0 14px',
    flexShrink: 0,
    opacity: disabled ? 0.45 : 1,
  };
  const map = {
    send:     { backgroundColor: '#1e3a5f', borderColor: '#2a4a7f', color: '#90b8e0' },
    strategy: { backgroundColor: '#1e2a1e', borderColor: '#2a5f2a', color: '#66bb6a', fontSize: '11px', padding: '0 8px' },
    save:     { backgroundColor: '#1e2a1e', borderColor: '#2a5f2a', color: '#66bb6a', padding: '6px 12px', width: '100%' },
    clear:    { backgroundColor: '#2a1a1a', borderColor: '#5f2a2a', color: '#ef5350', padding: '6px 12px', width: '100%' },
  };
  return { ...base, ...map[variant] };
};

// ── Markdown renderer ──────────────────────────────────────────────────────────

function renderInline(text: string, key?: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g);
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} style={{ color: '#f0c040', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
          return <em key={i} style={{ color: '#b0c8e8' }}>{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return (
            <code key={i} style={{ backgroundColor: '#111114', color: '#90b8e0', fontSize: '12px', padding: '1px 5px', borderRadius: '3px', border: '1px solid #2a2a3e', fontFamily: 'monospace' }}>
              {part.slice(1, -1)}
            </code>
          );
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
    const line = lines[i].trimEnd();
    if (line.startsWith('## ')) {
      nodes.push(<div key={i} style={{ fontWeight: 700, fontSize: '13px', color: '#e8e8e8', marginTop: nodes.length > 0 ? '10px' : '0', marginBottom: '3px', borderBottom: '1px solid #2a2a38', paddingBottom: '2px' }}>{renderInline(line.slice(3))}</div>);
    } else if (line.startsWith('### ')) {
      nodes.push(<div key={i} style={{ fontWeight: 600, fontSize: '12px', color: '#c8c8e0', marginTop: '6px', marginBottom: '2px' }}>{renderInline(line.slice(4))}</div>);
    } else if (/^[-•*]\s/.test(line)) {
      nodes.push(<div key={i} style={{ display: 'flex', gap: '7px', paddingLeft: '2px' }}><span style={{ color: '#4a90d9', flexShrink: 0 }}>•</span><span style={{ flex: 1 }}>{renderInline(line.replace(/^[-•*]\s+/, ''))}</span></div>);
    } else if (/^(\d+)\.\s+(.+)/.test(line)) {
      const m = line.match(/^(\d+)\.\s+(.+)/)!;
      nodes.push(<div key={i} style={{ display: 'flex', gap: '7px', paddingLeft: '2px' }}><span style={{ color: '#4a90d9', flexShrink: 0, minWidth: '16px', textAlign: 'right' }}>{m[1]}.</span><span style={{ flex: 1 }}>{renderInline(m[2])}</span></div>);
    } else if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #2a2a38', margin: '6px 0' }} />);
    } else if (line.trim() === '') {
      if (nodes.length > 0) nodes.push(<div key={i} style={{ height: '5px' }} />);
    } else {
      nodes.push(<div key={i} style={{ lineHeight: '1.6' }}>{renderInline(line)}</div>);
    }
    i++;
  }
  return <>{nodes}</>;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  analysisMessage?: string | null;
  onAnalysisConsumed?: () => void;
}

function ChatPanel({ analysisMessage, onAnalysisConsumed }: ChatPanelProps) {
  const [model, setModel]       = useState('claude');
  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([GREETING]);
  const [loading, setLoading]   = useState(false);
  const [loadingType, setLoadingType] = useState<'chat' | 'strategy'>('chat');

  // Chat Settings panel state
  const [settingsOpen, setSettingsOpen]     = useState(false);
  const [sessions, setSessions]             = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [saveStatus, setSaveStatus]         = useState<string | null>(null);

  const sessionIdRef  = useRef<number | null>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Inject analysis result from PricePanel as an assistant message.
  useEffect(() => {
    if (!analysisMessage) return;
    setMessages((prev) => [...prev, { role: 'assistant', content: analysisMessage }]);
    onAnalysisConsumed?.();
  }, [analysisMessage, onAnalysisConsumed]);

  // Load recent sessions whenever the settings panel opens.
  useEffect(() => {
    if (!settingsOpen) return;
    setSessionsLoading(true);
    fetchChatSessions(15)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [settingsOpen]);

  // ── Textarea auto-resize ────────────────────────────────────────────────────

  const MAX_INPUT_HEIGHT = 130;
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + 'px';
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
  }
  function resetTextarea() {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }

  // ── History builder (excludes greeting + strategy/error messages) ───────────

  function buildHistory(): ChatMessage[] {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(1) // skip the hardcoded greeting
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  // ── Core send ───────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    setLoadingType('chat');
    try {
      const res = await sendChatMessage(text, buildHistory(), model, sessionIdRef.current ?? undefined);
      sessionIdRef.current = res.session_id;
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [...prev, { role: 'error', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    resetTextarea();
    await sendMessage(text);
  }

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
      setMessages((prev) => [...prev, { role: 'error', content: `Strategy error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleApproveStrategy(msgIndex: number, data: StrategyResult) {
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, strategyApproved: true } : m)));
    const approvalMsg =
      `I've approved this trading strategy: "${data.name}". ` +
      `Entry: ${data.entry_condition}. Exit: ${data.exit_condition}. ` +
      `Timeframe: ${data.timeframe}. ` +
      `Take profit: ${data.take_profit}. Stop loss: ${data.stop_loss}. ` +
      `Based on these parameters, please suggest and create appropriate price alerts.`;
    sendMessage(approvalMsg);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // ── Chat Settings actions ───────────────────────────────────────────────────

  async function handleSaveChat() {
    if (!sessionIdRef.current) {
      setSaveStatus('Send a message first to start a session.');
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }
    try {
      await saveChatSession(sessionIdRef.current);
      setSaveStatus('Saved to chat_history folder.');
    } catch {
      setSaveStatus('Save failed — try again.');
    }
    setTimeout(() => setSaveStatus(null), 3000);
  }

  function handleClearChat() {
    sessionIdRef.current = null;
    setMessages([GREETING]);
    setSessions([]);
    setSettingsOpen(false);
  }

  async function handleLoadSession(id: number) {
    try {
      const detail = await fetchChatSession(id);
      const loaded: DisplayMessage[] = detail.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setMessages(loaded.length > 0 ? loaded : [GREETING]);
      sessionIdRef.current = id;
      const matchedModel = MODELS.find((m) => m.value === detail.model);
      if (matchedModel) setModel(matchedModel.value);
      setSettingsOpen(false);
    } catch {
      setSaveStatus('Could not load session.');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const modelLabel = MODELS.find((m) => m.value === model)?.label ?? 'Assistant';

  return (
    <div style={S.panel}>

      {/* ── Header ── */}
      <div style={S.header}>
        <span style={S.headerTitle}>AI Chat</span>
        <button style={settingsBtn(settingsOpen)} onClick={() => setSettingsOpen((v) => !v)}>
          {settingsOpen ? '✕ Close Settings' : '⚙ Chat Settings'}
        </button>
      </div>

      {/* ── Chat Settings panel (collapsible) ── */}
      <div style={{
        maxHeight: settingsOpen ? '420px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.25s ease',
        borderBottom: settingsOpen ? '1px solid #2a2a2e' : 'none',
        backgroundColor: '#13131a',
        flexShrink: 0,
      }}>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Model selector */}
          <div>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Model</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setModel(m.value)}
                  style={{
                    backgroundColor: model === m.value ? '#1e3a5f' : '#111114',
                    border: `1px solid ${model === m.value ? '#3a6a9f' : '#2a2a2e'}`,
                    borderRadius: '4px',
                    color: model === m.value ? '#90b8e0' : '#666',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: model === m.value ? 600 : 400,
                    padding: '5px 14px',
                    transition: 'all 0.15s',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save / Clear buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button style={actionBtn('save')} onClick={handleSaveChat} disabled={loading}>
              Save this chat
            </button>
            <button style={actionBtn('clear')} onClick={handleClearChat} disabled={loading}>
              Clear this chat
            </button>
          </div>

          {/* Status message (save result) */}
          {saveStatus && (
            <div style={{ fontSize: '11px', color: saveStatus.includes('failed') || saveStatus.includes('first') ? '#ef5350' : '#66bb6a', textAlign: 'center' }}>
              {saveStatus}
            </div>
          )}

          {/* Recent sessions */}
          <div>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recent Sessions
            </div>
            {sessionsLoading ? (
              <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic' }}>Loading…</div>
            ) : sessions.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic' }}>No saved sessions yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleLoadSession(s.id)}
                    style={{
                      backgroundColor: '#111118',
                      border: '1px solid #2a2a38',
                      borderRadius: '5px',
                      color: '#b0b0c0',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '6px 10px',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '8px',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {s.title ?? 'Untitled session'}
                    </span>
                    <span style={{ color: '#444', flexShrink: 0 }}>
                      {new Date(s.last_active_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Scrollable message list ── */}
      <div style={S.messageList}>
        {messages.map((msg, i) => (
          <div key={i} style={msgGroupStyle(msg.role === 'strategy' ? 'assistant' : msg.role as 'user' | 'assistant' | 'error')}>
            {msg.role !== 'error' && msg.role !== 'strategy' && (
              <span style={roleLabelStyle(msg.role === 'user' ? 'user' : 'assistant')}>
                {msg.role === 'user' ? 'You' : modelLabel}
              </span>
            )}
            {msg.role === 'error' ? (
              <div style={S.errorBubble}>{msg.content}</div>
            ) : msg.role === 'strategy' ? (
              <StrategyCard
                result={msg.strategyData!}
                approved={msg.strategyApproved ?? false}
                onApprove={() => handleApproveStrategy(i, msg.strategyData!)}
              />
            ) : msg.role === 'user' ? (
              <div style={bubbleStyle('user')}>{msg.content}</div>
            ) : (
              <div style={bubbleStyle('assistant')}>{renderMarkdown(msg.content)}</div>
            )}
          </div>
        ))}

        {loading && (
          <span style={S.typing}>
            {loadingType === 'strategy' ? 'Validating strategy…' : `${modelLabel} is thinking…`}
          </span>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input row ── */}
      <div style={S.inputRow}>
        <textarea
          ref={textareaRef}
          style={S.input}
          placeholder="Ask about BTC… (Enter to send)"
          value={input}
          onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={1}
        />
        <button style={actionBtn('send', loading || !input.trim())} onClick={handleSend} disabled={loading || !input.trim()}>
          Send
        </button>
        <button
          style={actionBtn('strategy', loading || !input.trim())}
          onClick={handleValidateStrategy}
          disabled={loading || !input.trim()}
          title="Validate as trading strategy (OpenAI → Claude)"
        >
          Strategy
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
    maxWidth: '95%',
    fontSize: '12px',
  };
  if (!result.valid) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#f44336', fontWeight: 700, marginBottom: '5px', fontSize: '13px' }}>Invalid Strategy</div>
        <p style={{ color: '#aaa', margin: 0, lineHeight: '1.5' }}>{result.reason}</p>
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
        <span style={{ color: '#f5a623', fontWeight: 700, fontSize: '13px' }}>{result.name}</span>
        <span style={{ color: '#66bb6a', fontSize: '10px' }}>✓ OpenAI validated</span>
      </div>
      <p style={{ color: '#c8c8c8', margin: '0 0 9px', lineHeight: '1.5', fontSize: '12px' }}>{result.summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '3px 8px', backgroundColor: '#0e0e14', border: '1px solid #1e1e28', borderRadius: '5px', padding: '7px 9px', marginBottom: '9px', lineHeight: '1.6' }}>
        <Param label="Entry"       value={result.entry_condition ?? ''} />
        <Param label="Exit"        value={result.exit_condition  ?? ''} />
        <Param label="Timeframe"   value={result.timeframe       ?? ''} />
        <Param label="Stop Loss"   value={result.stop_loss       ?? ''} />
        <Param label="Take Profit" value={result.take_profit     ?? ''} />
      </div>
      {approved ? (
        <span style={{ color: '#66bb6a', fontSize: '11px' }}>Approved — Claude is setting your alerts…</span>
      ) : (
        <button onClick={onApprove} style={{ backgroundColor: '#1e2a1e', border: '1px solid #2a5f2a', borderRadius: '5px', color: '#66bb6a', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '5px 13px', transition: 'all 0.15s' }}>
          Approve &amp; Set Alert
        </button>
      )}
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: '#555', fontSize: '11px' }}>{label}</span>
      <span style={{ color: '#b8b8b8', fontSize: '11px' }}>{value}</span>
    </>
  );
}
