const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const welcomeEl = $("#welcome");
const promptEl = $("#prompt");
const sendBtn = $("#sendBtn");
const historyEl = $("#history");
const chatScroll = $("#chatScroll");
const STORAGE_KEY = "forge-code-chat-v1";
let chats = loadChats();
let currentId = null;
let busy = false;
let toastTimer;

function loadChats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveChats() { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function currentChat() { return chats.find(c => c.id === currentId); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function showToast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function createChat() {
  const chat = { id: makeId(), title: "New conversation", messages: [], updatedAt: Date.now() };
  chats.unshift(chat); currentId = chat.id; saveChats(); renderHistory(); renderChat(); promptEl.focus();
}
function renderHistory() {
  historyEl.innerHTML = "";
  chats.slice().sort((a,b) => b.updatedAt - a.updatedAt).forEach(chat => {
    const b = document.createElement("button");
    b.className = "history-item" + (chat.id === currentId ? " selected" : "");
    b.innerHTML = `<span class="history-symbol">◷</span><span>${escapeHtml(chat.title)}</span>`;
    b.title = chat.title;
    b.addEventListener("click", () => { currentId = chat.id; renderHistory(); renderChat(); closeSidebar(); });
    historyEl.appendChild(b);
  });
}
function renderChat() {
  const chat = currentChat();
  const hasMessages = Boolean(chat?.messages.length);
  welcomeEl.hidden = hasMessages;
  messagesEl.hidden = !hasMessages;
  messagesEl.innerHTML = "";
  $("#crumbTitle").textContent = chat?.title || "New conversation";
  if (chat) chat.messages.forEach((m, i) => messagesEl.appendChild(makeMessage(m, i)));
  chatScroll.scrollTop = chatScroll.scrollHeight;
}
function makeMessage(m, index) {
  const article = document.createElement("article");
  article.className = `message ${m.role}`;
  const isUser = m.role === "user";
  article.innerHTML = `<div class="message-avatar">${isUser ? "Y" : "F"}</div><div class="message-body"><div class="message-role">${isUser ? "You" : "Forge"}</div><div class="message-content">${isUser ? escapeHtml(m.content).replace(/\n/g,"<br>") : renderMarkdown(m.content)}</div>${!isUser && m.content ? `<div class="message-actions"><button data-copy-message="${index}">▢ Copy response</button></div>` : ""}</div>`;
  article.querySelector("[data-copy-message]")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(m.content); showToast("Response copied"); } catch { showToast("Couldn't access clipboard"); }
  });
  article.querySelectorAll("[data-copy-code]").forEach(btn => btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copyCode)); showToast("Code copied"); } catch { showToast("Couldn't access clipboard"); }
  }));
  return article;
}
function renderMarkdown(raw) {
  // Escape HTML first; then apply a deliberately small Markdown subset.
  let s = escapeHtml(raw || "");
  const codeBlocks = [];
  s = s.replace(/```([a-zA-Z0-9_+#.-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const trimmed = code.replace(/^\n|\n$/g, "");
    codeBlocks.push(`<div class="code-wrap"><div class="code-head"><span>${escapeHtml(lang || "code")}</span><button data-copy-code="${encodeURIComponent(trimmed)}">▢ Copy code</button></div><pre><code>${trimmed}</code></pre></div>`);
    return `%%CODEBLOCK${idx}%%`;
  });
  s = s.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>").replace(/^## (.+)$/gm, "<h2>$1</h2>").replace(/^# (.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
  s = s.replace(/(?:<li>.*?<\/li>\n?)+/gs, match => `<ul>${match}</ul>`);
  s = s.replace(/^\s*\d+\. (.+)$/gm, "<li>$1</li>");
  s = s.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  s = `<p>${s}</p>`.replace(/<p>\s*(<(?:h[1-3]|ul|blockquote|div class="code-wrap")[^>]*>)/g, "$1").replace(/(<\/(?:h[1-3]|ul|blockquote)>)(?:<\/p>)?/g, "$1");
  s = s.replace(/%%CODEBLOCK(\d+)%%/g, (_, i) => codeBlocks[Number(i)] || "");
  return s;
}
function addTyping() {
  const el = document.createElement("article");
  el.className = "message assistant"; el.id = "typing";
  el.innerHTML = `<div class="message-avatar">F</div><div class="message-body"><div class="message-role">Forge</div><div class="typing"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(el); chatScroll.scrollTop = chatScroll.scrollHeight;
}
function setBusy(value) {
  busy = value; sendBtn.disabled = value;
  sendBtn.innerHTML = value ? '<span>■</span>' : '<span>↑</span>';
  promptEl.disabled = value;
}
async function sendMessage(text) {
  const content = (text ?? promptEl.value).trim();
  if (!content || busy) return;
  if (!currentChat()) createChat();
  const chat = currentChat();
  chat.messages.push({ role: "user", content });
  if (chat.messages.length === 1) chat.title = content.replace(/\s+/g, " ").slice(0, 38) + (content.length > 38 ? "…" : "");
  chat.updatedAt = Date.now();
  promptEl.value = ""; resizeTextarea(); renderHistory(); renderChat();
  setBusy(true); addTyping();
  let assistantText = "";
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.messages.map(m => ({ role: m.role, content: m.content })) })
    });
    if (!response.ok) {
      let err = "Request failed.";
      try { err = (await response.json()).error || err; } catch {}
      throw new Error(err);
    }
    $("#typing")?.remove();
    const assistantMessage = { role: "assistant", content: "" };
    chat.messages.push(assistantMessage);
    messagesEl.appendChild(makeMessage(assistantMessage, chat.messages.length - 1));
    const contentEl = messagesEl.lastElementChild.querySelector(".message-content");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const packet = JSON.parse(data);
          const delta = packet.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            assistantText += delta;
            assistantMessage.content = assistantText;
            contentEl.innerHTML = renderMarkdown(assistantText);
            contentEl.closest(".message").querySelectorAll("[data-copy-code]").forEach(btn => btn.addEventListener("click", async () => {
              try { await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copyCode)); showToast("Code copied"); } catch {}
            }));
            chatScroll.scrollTop = chatScroll.scrollHeight;
          }
        } catch {}
      }
    }
    if (!assistantText) assistantMessage.content = "I didn't receive a text response. Try sending your message again.";
    chat.updatedAt = Date.now(); saveChats(); renderHistory(); renderChat();
  } catch (err) {
    $("#typing")?.remove();
    if (assistantText) {
      chat.messages.push({ role: "assistant", content: assistantText });
    } else {
      chat.messages.push({ role: "assistant", content: `**Couldn't get a response**\n\n${err.message}` });
    }
    saveChats(); renderChat();
  } finally {
    setBusy(false); promptEl.focus();
  }
}
function resizeTextarea() { promptEl.style.height = "auto"; promptEl.style.height = Math.min(promptEl.scrollHeight, 180) + "px"; }
function closeSidebar() { $("#sidebar").classList.remove("open"); }
$("#newChat").addEventListener("click", () => { createChat(); closeSidebar(); });
$("#sendBtn").addEventListener("click", () => sendMessage());
promptEl.addEventListener("input", resizeTextarea);
promptEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.querySelectorAll("[data-prompt]").forEach(btn => btn.addEventListener("click", () => {
  const p = btn.dataset.prompt;
  if (currentChat()?.messages.length) { promptEl.value = p; resizeTextarea(); promptEl.focus(); }
  else sendMessage(p);
}));
$("#clearChats").addEventListener("click", () => {
  if (!chats.length) return;
  if (confirm("Delete all saved conversations from this browser?")) {
    chats = []; currentId = null; saveChats(); renderHistory(); renderChat(); showToast("Saved conversations cleared");
  }
});
$("#themeBtn").addEventListener("click", () => { document.body.classList.toggle("light-mode"); });
$("#openSidebar").addEventListener("click", () => $("#sidebar").classList.add("open"));
$("#closeSidebar").addEventListener("click", closeSidebar);
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); createChat(); }
  if (e.key === "Escape") closeSidebar();
});
if (chats.length) { currentId = chats.sort((a,b) => b.updatedAt - a.updatedAt)[0].id; }
renderHistory(); renderChat();
fetch("/api/health").then(r => r.json()).then(data => {
  if (!data.configured) showToast("Add your OpenRouter key in .env to start chatting");
}).catch(() => {});
