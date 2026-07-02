import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import {
  chatWithAssistant,
  listThreads,
  createThread,
  deleteThread,
  getThreadMessages,
} from "@/lib/chat.functions";

type Msg = { role: "user" | "assistant"; content: string };

function renderMarkdown(text: string) {
  // Split by **bold** first
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*([^*]+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderItalic(text.slice(lastIndex, match.index)));
    }
    parts.push(
      <strong key={`b-${match.index}`} className="font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = boldRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(...renderItalic(text.slice(lastIndex)));
  }
  return parts.length ? parts : text;
}

function renderItalic(fragment: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const italicRegex = /\*([^*]+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = italicRegex.exec(fragment)) !== null) {
    if (match.index > lastIndex) {
      parts.push(fragment.slice(lastIndex, match.index));
    }
    parts.push(
      <em key={`i-${match.index}`} className="italic">
        {match[1]}
      </em>
    );
    lastIndex = italicRegex.lastIndex;
  }
  if (lastIndex < fragment.length) {
    parts.push(fragment.slice(lastIndex));
  }
  return parts.length ? parts : [fragment];
}


const SUGGESTIONS = [
  "Ringkas progress minggu ini",
  "Siapa kontributor terbesar?",
  "Project mana yang under-target?",
];

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [input, setInput] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Msg[]>([]);
  const [followups, setFollowups] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();
  const askFn = useServerFn(chatWithAssistant);
  const listFn = useServerFn(listThreads);
  const createFn = useServerFn(createThread);
  const deleteFn = useServerFn(deleteThread);
  const messagesFn = useServerFn(getThreadMessages);

  const threadsQuery = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const messagesQuery = useQuery({
    queryKey: ["chat-messages", activeThreadId],
    queryFn: () => (activeThreadId ? messagesFn({ data: { threadId: activeThreadId } }) : Promise.resolve([])),
    enabled: !!activeThreadId && open,
  });

  const WELCOME: Msg = {
    role: "assistant",
    content:
      "Hai! Aku NowTrack Assistant. Tanya aku tentang project, task, jam kerja, atau weekly recap tim Inowtech kamu.",
  };

  const persistedMessages: Msg[] = activeThreadId
    ? (messagesQuery.data ?? []).map((m) => ({ role: m.role, content: m.content }))
    : [];
  const combined: Msg[] = [...persistedMessages, ...pendingMessages];
  const isEmpty = combined.length === 0;
  const messages: Msg[] = isEmpty ? [WELCOME] : combined;

  const mutation = useMutation({
    mutationFn: (history: Msg[]) =>
      askFn({ data: { threadId: activeThreadId ?? undefined, messages: history } }),
    onSuccess: (res) => {
      setPendingMessages([]);
      setFollowups(res.followups ?? []);
      if (!activeThreadId && res.threadId) {
        setActiveThreadId(res.threadId);
      }
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      if (res.threadId) {
        qc.invalidateQueries({ queryKey: ["chat-messages", res.threadId] });
      }
    },
    onError: (err: Error) => {
      setFollowups([]);
      setPendingMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${err.message}` },
      ]);
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      setActiveThreadId(t.id);
      setPendingMessages([]);
      setFollowups([]);
      setShowThreadList(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      if (activeThreadId === id) {
        setActiveThreadId(null);
        setPendingMessages([]);
        setFollowups([]);
      }
    },
  });

  useEffect(() => {
    if (open) {
      setPanelVisible(true);
    } else {
      const timer = setTimeout(() => setPanelVisible(false), 260);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length, mutation.isPending, activeThreadId]);

  useEffect(() => {
    if (open && !showThreadList) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, showThreadList, activeThreadId]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    setFollowups([]);
    const history: Msg[] = [
      ...persistedMessages,
      ...pendingMessages,
      { role: "user", content: trimmed },
    ];
    setPendingMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    mutation.mutate(history.slice(-12));
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open AI assistant"
        className="fixed bottom-28 right-4 md:bottom-6 md:right-6 z-50 size-14 rounded-full glass-strong flex items-center justify-center text-foreground shadow-[0_10px_40px_-10px_var(--glass-inset)] hover:scale-110 active:scale-95 transition-all duration-300 ease-out"
      >
        <div className="relative size-5">
          <div className={cn("absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out", open ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </div>
          <div className={cn("absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out", open ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
        </div>
      </button>

      {/* Backdrop */}
      {panelVisible && (
        <div
          className={cn(
            "fixed inset-0 z-40 bg-background/20 backdrop-blur-[2px] transition-opacity duration-300 ease-out",
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      {panelVisible && (
        <div
          className={cn(
            "fixed bottom-44 right-4 md:bottom-24 md:right-6 z-50 w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-13rem))] md:h-[min(560px,calc(100vh-8rem))] glass-strong rounded-[1.75rem] flex flex-col overflow-hidden border border-foreground/10 shadow-[0_24px_60px_-20px_oklch(0_0_0/0.35)] transition-all duration-300 ease-out",
            open
              ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
              : "opacity-0 translate-y-5 scale-95 pointer-events-none"
          )}
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-foreground/10 animate-fade-in">
            <button
              onClick={() => setShowThreadList((v) => !v)}
              className="size-8 rounded-lg glass-tile flex items-center justify-center hover:scale-105 transition-transform"
              aria-label="Threads"
              title="Threads"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div className="size-8 rounded-full bg-foreground flex items-center justify-center">
              <div className="size-2 bg-background rounded-full animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold tracking-tight">NowTrack Assistant</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40">
                {showThreadList ? "Threads" : "Workspace-scoped"}
              </div>
            </div>
            <button
              onClick={() => {
                setActiveThreadId(null);
                setPendingMessages([]);
                setFollowups([]);
                setShowThreadList(false);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="size-8 rounded-lg glass-tile flex items-center justify-center hover:scale-105 transition-transform"
              aria-label="New chat"
              title="New chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>

          <div className={cn("flex-1 flex flex-col overflow-hidden transition-opacity duration-200", showThreadList ? "opacity-0 pointer-events-none" : "opacity-100")}>
            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "animate-message",
                    m.role === "user" ? "flex justify-end" : "flex justify-start"
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div
                    className={cn(
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-tr-md bg-foreground text-background px-3.5 py-2.5 text-sm whitespace-pre-wrap"
                        : "max-w-[90%] rounded-2xl rounded-tl-md glass-tile px-3.5 py-2.5 text-sm text-foreground/90 whitespace-pre-wrap"
                    )}
                  >
                    {renderMarkdown(m.content)}
                  </div>
                </div>
              ))}
              {mutation.isPending && (
                <div className="flex justify-start animate-fade-in">
                  <div className="glass-tile rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm text-foreground/60">
                    <span className="inline-flex gap-1">
                      <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "240ms" }} />
                    </span>
                  </div>
                </div>
              )}

              {isEmpty && !mutation.isPending && (
                <div className="pt-2 flex flex-wrap gap-2 animate-fade-in">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-1.5 rounded-full glass-tile text-foreground/70 hover:text-foreground transition-colors animate-message"
                      style={{ animationDelay: `${200 + i * 80}ms` }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {!isEmpty && !mutation.isPending && followups.length > 0 && messages[messages.length - 1]?.role === "assistant" && (
                <div className="pt-1 flex flex-wrap gap-2 animate-fade-in">
                  <div className="w-full text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40">
                    Followup
                  </div>
                  {followups.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-1.5 rounded-full glass-tile text-foreground/70 hover:text-foreground transition-colors text-left animate-message"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="p-3 border-t border-foreground/10 flex items-end gap-2 animate-fade-in"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Tanya tentang workspace…"
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-foreground/35 px-3 py-2 rounded-xl glass-tile focus:outline-none focus:ring-1 focus:ring-foreground/20 max-h-32"
              />
              <button
                type="submit"
                disabled={!input.trim() || mutation.isPending}
                className="size-9 rounded-xl bg-foreground text-background flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-transform"
                aria-label="Send"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>
              </button>
            </form>
          </div>

          <div className={cn("absolute inset-0 top-[57px] flex flex-col overflow-hidden transition-opacity duration-200", showThreadList ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full text-left px-3 py-2.5 rounded-xl glass-tile text-sm font-medium hover:scale-[1.01] transition-transform flex items-center gap-2 disabled:opacity-50 animate-message"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                New thread
              </button>
              {threadsQuery.isLoading && (
                <div className="text-xs text-foreground/40 px-3 py-2 animate-fade-in">Loading…</div>
              )}
              {!threadsQuery.isLoading && (threadsQuery.data?.length ?? 0) === 0 && (
                <div className="text-xs text-foreground/40 px-3 py-2 animate-fade-in">
                  Belum ada thread. Mulai chat baru untuk membuat thread.
                </div>
              )}
              {(threadsQuery.data ?? []).map((t, i) => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-xl pr-1 animate-message",
                    activeThreadId === t.id ? "glass-tile" : "hover:bg-foreground/5"
                  )}
                  style={{ animationDelay: `${80 + i * 50}ms` }}
                >
                  <button
                    onClick={() => {
                      setActiveThreadId(t.id);
                      setPendingMessages([]);
                      setFollowups([]);
                      setShowThreadList(false);
                    }}
                    className="flex-1 min-w-0 text-left px-3 py-2.5"
                  >
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-[10px] text-foreground/40 font-mono">
                      {new Date(t.updated_at).toLocaleString()}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: t.id, title: t.title });
                    }}
                    className="size-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-foreground/10 opacity-0 group-hover:opacity-100 transition"
                    aria-label="Delete thread"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Delete confirmation modal */}
          {deleteTarget && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4 animate-chat-backdrop">
              <div className="glass-strong rounded-2xl border border-foreground/10 p-5 w-full max-w-xs space-y-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)] animate-scale-in">
                <div className="text-sm text-foreground/80 leading-relaxed">
                  Hapus thread <span className="font-semibold text-foreground">{deleteTarget.title}</span>?
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-foreground/70 hover:bg-foreground/10 transition"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      deleteMutation.mutate(deleteTarget.id);
                      setDeleteTarget(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}