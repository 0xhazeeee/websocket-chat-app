import { useEffect, useRef, useState } from "react";

type MessageEntry =
  | { type: "chat"; messageId: string; username: string; message: string; isSelf: boolean; readBy: string[] }
  | { type: "system"; message: string };

type AppState = "auth" | "lobby" | "chat";
type AuthMode = "login" | "register";

const API = "http://localhost:3000";

function App() {
  const [appState, setAppState] = useState<AppState>("auth");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");

  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [inputValue, setInputValue] = useState("");

  // Who is currently typing (list of usernames)
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Timer ref to stop typing indicator after 2s of no input
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  // Send read receipt for a message
  function sendRead(messageId: string) {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "read", payload: { messageId } }));
  }

  // Called on every keystroke in the message input
  function handleTyping() {
    if (!wsRef.current) return;

    // Send "started typing" only once per burst
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      wsRef.current.send(JSON.stringify({ type: "typing", payload: { isTyping: true } }));
    }

    // Reset the 2s timer on every keystroke
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      wsRef.current?.send(JSON.stringify({ type: "typing", payload: { isTyping: false } }));
    }, 2000);
  }

  async function handleAuth() {
    setAuthError("");
    const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";

    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: authUsername, password: authPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      setAuthError(data.error);
      return;
    }

    if (authMode === "register") {
      setAuthMode("login");
      setAuthError("Registered! Please log in.");
      return;
    }

    setToken(data.token);
    setUsername(data.username);
    setAppState("lobby");
  }

  function joinRoom() {
    if (!roomId.trim() || !token) return;

    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", payload: { roomId: roomId.trim(), token } }));
      setAppState("chat");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "error") {
        setAppState("auth");
        setAuthError(data.payload.message);
        return;
      }

      if (data.type === "history") {
        const oldMessages: MessageEntry[] = data.payload.messages.map(
          (m: { _id: string; username: string; message: string; readBy: string[] }) => ({
            type: "chat",
            messageId: m._id,
            username: m.username,
            message: m.message,
            isSelf: m.username === data.username,
            readBy: m.readBy || [],
          })
        );
        if (oldMessages.length > 0) {
          setMessages([
            { type: "system", message: "-- Previous messages --" },
            ...oldMessages,
          ]);
        }
      }

      if (data.type === "chat") {
        const newMsg: MessageEntry = {
          type: "chat",
          messageId: data.payload.messageId,
          username: data.payload.username,
          message: data.payload.message,
          isSelf: data.payload.isSelf,
          readBy: [],
        };
        setMessages((prev) => [...prev, newMsg]);

        // Send read receipt immediately if it's not our own message
        if (!data.payload.isSelf) {
          sendRead(data.payload.messageId);
        }
      }

      if (data.type === "system") {
        setMessages((prev) => [...prev, { type: "system", message: data.payload.message }]);
      }

      // Update typing indicators
      if (data.type === "typing") {
        const { username: typingUser, isTyping } = data.payload;
        setTypingUsers((prev) =>
          isTyping
            ? prev.includes(typingUser) ? prev : [...prev, typingUser]
            : prev.filter((u) => u !== typingUser)
        );
      }

      // Update read receipts on existing messages
      if (data.type === "read") {
        const { messageId, readBy } = data.payload;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.type === "chat" && msg.messageId === messageId
              ? { ...msg, readBy }
              : msg
          )
        );
      }
    };

    ws.onclose = () => {
      setMessages((prev) => [...prev, { type: "system", message: "Disconnected from server." }]);
    };
  }

  function sendMessage() {
    if (!inputValue.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", payload: { message: inputValue.trim() } }));
    setInputValue("");

    // Stop typing indicator immediately on send
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      wsRef.current.send(JSON.stringify({ type: "typing", payload: { isTyping: false } }));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  // ── Auth screen ─────────────────────────────────────────────────────────────

  if (appState === "auth") {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 w-full max-w-sm flex flex-col gap-4">
          <h1 className="text-white text-2xl font-semibold text-center">
            {authMode === "login" ? "Log In" : "Register"}
          </h1>
          {authError && <p className="text-sm text-center text-red-400">{authError}</p>}
          <input
            className="bg-zinc-800 text-white placeholder-zinc-500 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Username"
            value={authUsername}
            onChange={(e) => setAuthUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
          />
          <input
            className="bg-zinc-800 text-white placeholder-zinc-500 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Password"
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
          />
          <button
            onClick={handleAuth}
            disabled={!authUsername.trim() || !authPassword.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg p-3 transition-colors"
          >
            {authMode === "login" ? "Log In" : "Register"}
          </button>
          <button
            onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
            className="text-zinc-400 text-sm hover:text-white transition-colors"
          >
            {authMode === "login" ? "No account? Register" : "Have an account? Log in"}
          </button>
        </div>
      </div>
    );
  }

  // ── Lobby screen ────────────────────────────────────────────────────────────

  if (appState === "lobby") {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 w-full max-w-sm flex flex-col gap-4">
          <h1 className="text-white text-2xl font-semibold text-center">Join a Room</h1>
          <p className="text-zinc-400 text-sm text-center">
            Logged in as <span className="text-white">{username}</span>
          </p>
          <input
            className="bg-zinc-800 text-white placeholder-zinc-500 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Room ID (e.g. red, blue)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
          />
          <button
            onClick={joinRoom}
            disabled={!roomId.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg p-3 transition-colors"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  // ── Chat screen ─────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-zinc-950 flex flex-col">

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-zinc-400 text-sm">Room: </span>
          <span className="text-white font-medium">{roomId}</span>
        </div>
        <span className="text-zinc-400 text-sm">{username}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map((msg, i) => {
          if (msg.type === "system") {
            return (
              <div key={i} className="text-center text-zinc-500 text-xs py-1">
                {msg.message}
              </div>
            );
          }

          const isRead = msg.readBy.some((u) => u !== msg.username);

          return (
            <div
              key={i}
              className={`flex flex-col gap-1 max-w-[70%] ${
                msg.isSelf ? "self-end items-end" : "self-start items-start"
              }`}
            >
              <span className="text-zinc-400 text-xs px-1">{msg.username}</span>
              <div
                className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                  msg.isSelf
                    ? "bg-purple-600 text-white rounded-tr-sm"
                    : "bg-zinc-800 text-zinc-100 rounded-tl-sm"
                }`}
              >
                {msg.message}
              </div>

              {/* Read receipt — only shown on your own messages */}
              {msg.isSelf && (
                <span className="text-xs px-1" title={isRead ? `Read by: ${msg.readBy.filter(u => u !== msg.username).join(", ")}` : "Delivered"}>
                  {isRead ? (
                    <span className="text-purple-400">✓✓ Read</span>
                  ) : (
                    <span className="text-zinc-500">✓ Delivered</span>
                  )}
                </span>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="self-start flex items-center gap-2 px-1">
            <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-2 flex items-center gap-1">
              <span className="text-zinc-400 text-xs mr-1">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing
              </span>
              {/* Animated dots */}
              <span className="flex gap-0.5 items-center">
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-3 flex gap-3 items-center">
        <input
          className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={sendMessage}
          disabled={!inputValue.trim()}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;