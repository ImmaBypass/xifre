(() => {
'use strict';

const CHAT_MEDIA_BUCKET = 'xifre-chat-media';
const CHAT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_MESSAGE_MAX_CHARS = 2000;
const CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT = 1800;
const CHAT_IMAGE_MARKER_PREFIX = '[[XIFRE_IMAGE:';
const CONFIG = {
url: 'https://doppekualeyvrlbtumze.supabase.co',
key: 'sb_publishable_96LHpw9bFMWX6tAl6p_6qA__ZANADwE'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let supabase = null;
let currentUser = null;
let currentProfile = null;
let currentConversation = null;
let currentConversationData = null;
let currentMembers = [];
let messageChannel = null;
let typingChannel = null;
let messagePoll = null;
let typingStopTimer = null;
let peopleSearchTimer = null;
let confirmResolver = null;
let menuMessage = null;
let replyTarget = null;
let pendingProfileAvatarFile = null;
let pendingGroupAvatarFile = null;
let pendingProfileAvatarURL = null;
let pendingGroupAvatarURL = null;
let authActionInFlight = false;
let startPromise = null;
let appStarted = false;
let domainSessionSignOut = false;
let conversationCache = [];
let friendCache = [];
let memberCache = new Map();
let currentMentionIds = new Set();
let mentionEverywhere = false;
let mentionPickerIndex = 0;
let selectedMember = null;
let selectedConversationForMenu = null;
let conversationSearchTimer = null;
let conversationListPoll = null;
let friendRequestsPoll = null;
let memberFriendStatus = 'none';
let lastFriendRequestsSignature = null;
let lastFriendCacheRenderSignature = null;
let conversationFilter = '';
let emojiPickerMode = 'compose';
let emojiPickerMessageId = null;
let sendInFlight = false;
let logoutInFlight = false;
let conversationLoadSequence = 0;
let conversationOpenSequence = 0;
const messageLoadSequences = new Map();
const reactionLoadSequences = new Map();
let friendRequestLoadPromise = null;
let friendRequestRefreshQueued = false;
let friendRequestsLoadedOnce = false;
let friendRequestKnownIds = new Set();
let memberStatusRequestToken = 0;
let removeProfileAvatarRequested = false;
let removeGroupAvatarRequested = false;
let editingMessageId = null;
let presenceChannel = null;
let presenceSetupPromise = null;
let presenceTrackTimer = null;
let presenceRenderTimer = null;
let presencePayloads = new Map();
let presenceActivityAt = Date.now();
let presenceLastTrackAt = 0;
let presenceOwnerId = null;
const presenceTabId = (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const PRESENCE_IDLE_MS = 60 * 1000; // visible tab + recent interaction => online
const PRESENCE_STALE_MS = 80 * 1000;
let pendingExternalUrl = '';
let pendingChatAttachment = null;
let pendingChatAttachmentObjectUrl = null;
let pendingChatAttachmentGeneration = 0;
let keyboardOpen = false;
let keyboardShift = false;
let keyboardSymbols = false;
let remoteTypingUsers = new Map();
let remoteTypingTimers = new Map();
const signedChatMediaCache = new Map();
let keyboardWordUsageCache = null;
let keyboardWordUsageOwner = null;

const screens = ['landing', 'login', 'register', 'email'];

function normalizeUsername(value) {
return String(value || '').trim().toLowerCase();
}

const ALLOWED_EMAIL_DOMAIN = 'vedrunaimmaculada.cat';
function isAllowedEmailDomain(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^@\s]+@vedrunaimmaculada\.cat$/.test(email);
}
function emailHandle(value) {
  const email = String(value || '').trim().toLowerCase();
  return isAllowedEmailDomain(email) ? email.split('@')[0] : '';
}
function profileHandle(profile = {}) {
  return String(profile.email_handle || emailHandle(profile.email) || emailHandle(currentUser?.email) || 'usuario').replace(/^@/, '');
}

function esc(value) {
const div = document.createElement('div');
div.textContent = value ?? '';
return div.innerHTML;
}

function escapeRegExp(value) {
return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidUuid(value) {
return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getMemberId(member) {
return String(member?.user_id || member?.id || '');
}

function avatarHTML(name, url, kind = 'private', className = '', color = '') {
  const fallbackName = kind === 'group' ? 'Grupo' : 'Usuario';
  const safeName = String(name || fallbackName).trim() || fallbackName;
  const initial = kind === 'group' ? '#' : (safeName.charAt(0).toUpperCase() || 'X');
  const safeUrl = String(url || '').trim();
  const palette = ['avatar-blue', 'avatar-yellow', 'avatar-red', 'avatar-green', 'avatar-orange'];
  let hash = 0;
  for (const ch of safeName) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  const colorClass = kind === 'group'
    ? 'avatar-group'
    : (palette.includes(color) ? color : palette[Math.abs(hash) % palette.length]);
  const extraClass = String(className || '').trim();
  const wrapperClass = ['avatar-media', extraClass, colorClass].filter(Boolean).map(esc).join(' ');
  const fallbackExtra = kind === 'group' ? ' group-fallback' : '';
  const image = safeUrl
    ? `<img class="avatar-img" src="${esc(safeUrl)}" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
    : '';
  const hidden = safeUrl ? ' hidden' : '';
  return `<span class="${wrapperClass}" aria-label="${esc(safeName)}">${image}<span class="avatar-fallback${fallbackExtra} ${esc(colorClass)}"${hidden}>${esc(initial)}</span></span>`;
}

function avatarInto(element, name, url, kind = 'private', color = '') {
if (!element) return;
element.innerHTML = avatarHTML(name, url, kind, '', color);
}


function presenceDotHTML(userId, extraClass = '') {
  const id = String(userId || '');
  if (!isValidUuid(id)) return '';
  return `<span class="presence-dot presence-offline ${esc(extraClass)}" data-presence-user="${esc(id)}" title="Desconectado" aria-label="Desconectado"></span>`;
}

function presenceAvatarHTML(name, url, kind = 'private', avatarClass = '', color = '', userId = '', wrapClass = '') {
  return `<span class="presence-avatar-wrap ${esc(wrapClass)}">${avatarHTML(name, url, kind, avatarClass, color)}${presenceDotHTML(userId)}</span>`;
}

function ensurePresenceDot(elementOrSelector, userId, extraClass = '') {
  const element = typeof elementOrSelector === 'string' ? $(elementOrSelector) : elementOrSelector;
  if (!element) return;
  element.querySelectorAll(':scope > .presence-dot').forEach(dot => dot.remove());
  element.classList.remove('presence-anchor');
  const id = String(userId || '');
  if (!isValidUuid(id)) return;
  element.classList.add('presence-anchor');
  element.insertAdjacentHTML('beforeend', presenceDotHTML(id, extraClass));
  updatePresenceDot(element.querySelector(':scope > .presence-dot'));
}

function parsePresenceTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 100000000000 ? value * 1000 : value;
  }
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPresenceStatus(userId) {
  const records = presencePayloads.get(String(userId || '')) || [];
  const now = Date.now();
  const live = records.filter(record => {
    const observed = parsePresenceTimestamp(record.reported_at || record.last_seen_at || record.last_active_at);
    return observed > 0 && observed <= now + 30000 && now - observed < PRESENCE_STALE_MS;
  });
  if (!live.length) return 'offline';
  if (live.some(record => record.visible === true && record.status === 'online' && now - parsePresenceTimestamp(record.last_active_at) < PRESENCE_IDLE_MS)) return 'online';
  return 'away';
}

function updatePresenceDot(dot) {
  if (!dot) return;
  const status = getPresenceStatus(dot.dataset.presenceUser);
  dot.classList.remove('presence-online', 'presence-away', 'presence-offline');
  dot.classList.add(`presence-${status}`);
  const labels = { online: 'En línea', away: 'Ausente', offline: 'Desconectado' };
  dot.title = labels[status] || labels.offline;
  dot.setAttribute('aria-label', labels[status] || labels.offline);
}

function renderPresenceIndicators() {
  $$('[data-presence-user]').forEach(updatePresenceDot);
}

function rebuildPresencePayloads() {
  const next = new Map();
  const addPresence = (rawKey, rawMeta) => {
    const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
    // Supabase normally returns the tracked payload directly. These fallbacks
    // also tolerate wrappers used by different Realtime client/server builds.
    const nested = [meta.payload, meta.data, meta.presence].find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
    const record = { ...meta, ...nested };
    const keyParts = String(rawKey || '').split(':');
    const candidates = [
      record.user_id, record.userId, record.user?.id,
      meta.user_id, meta.userId, meta.user?.id,
      keyParts[0]
    ];
    const id = candidates.map(value => String(value || '').trim()).find(value => isValidUuid(value)) || '';
    if (!id) return;
    if (!next.has(id)) next.set(id, []);
    const rows = next.get(id);
    const tabId = String(record.tab_id || record.tabId || '');
    const duplicate = rows.some(existing => tabId
      ? String(existing.tab_id || existing.tabId || '') === tabId
      : existing === record);
    if (!duplicate) rows.push(record);
  };

  if (presenceChannel) {
    try {
      const state = presenceChannel.presenceState() || {};
      if (Array.isArray(state)) {
        state.forEach((meta, index) => addPresence(meta?.presence_ref || meta?.user_id || String(index), meta));
      } else {
        for (const [presenceKey, rawMetas] of Object.entries(state)) {
          const metas = Array.isArray(rawMetas) ? rawMetas : (rawMetas ? [rawMetas] : []);
          metas.forEach(meta => addPresence(presenceKey, meta));
        }
      }
    } catch (error) {
      console.warn('PRESENCE STATE READ', error);
    }
  }

  // Only optimistic while local Realtime is subscribed and the record is fresh.
  if (presenceChannel && presenceOwnerId) {
    const local = (presencePayloads.get(presenceOwnerId) || []).find(item => item.tab_id === presenceTabId);
    if (local && Date.now() - parsePresenceTimestamp(local.reported_at) < 35000) {
      if (!next.has(presenceOwnerId)) next.set(presenceOwnerId, []);
      if (!next.get(presenceOwnerId).some(item => item.tab_id === presenceTabId)) next.get(presenceOwnerId).push(local);
    }
  }
  presencePayloads = next;
  renderPresenceIndicators();
}

async function trackPresence(force = false) {
  if (!currentUser || !presenceChannel) return;
  const now = Date.now();
  if (!force && now - presenceLastTrackAt < 12000) return;
  const visible = document.visibilityState === 'visible' && document.hasFocus();
  const recent = now - presenceActivityAt < PRESENCE_IDLE_MS;
  const payload = {
    user_id: String(currentUser.id),
    tab_id: presenceTabId,
    visible,
    status: visible && recent ? 'online' : 'away',
    last_active_at: presenceActivityAt,
    reported_at: now
  };
  presenceLastTrackAt = now;
  const ownId = String(currentUser.id);
  const rows = (presencePayloads.get(ownId) || []).filter(item => item.tab_id !== presenceTabId);
  rows.push(payload);
  presencePayloads.set(ownId, rows);
  renderPresenceIndicators();
  try {
    const channel = presenceChannel;
    const response = await channel.track(payload);
    if (channel !== presenceChannel) return;
    if (response?.status && response.status !== 'ok') {
      console.warn('PRESENCE TRACK STATUS', response.status, response.error || '');
    }
  } catch (error) {
    console.warn('PRESENCE TRACK', error);
  }
}

function notePresenceActivity() {
  if (!currentUser || document.visibilityState !== 'visible') return;
  presenceActivityAt = Date.now();
  void trackPresence(false);
  renderPresenceIndicators();
}

async function setupPresenceTracking() {
  if (!currentUser || !supabase) return;
  const requestedOwner = String(currentUser.id);
  if (presenceChannel && presenceOwnerId === requestedOwner) return;
  if (presenceSetupPromise) {
    try { await presenceSetupPromise; } catch (_) { /* handled by the creator */ }
    if (presenceChannel && presenceOwnerId === requestedOwner) return;
  }

  presenceSetupPromise = (async () => {
    stopPresenceTracking();
    if (!currentUser || String(currentUser.id) !== requestedOwner) return;
    presenceOwnerId = requestedOwner;
    presenceActivityAt = Date.now();
    presenceLastTrackAt = 0;

    // Private Realtime channels need the current Auth JWT when subscribing.
    try {
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!currentUser || String(currentUser.id) !== requestedOwner) return;
      const accessToken = sessionResult.data?.session?.access_token;
      if (!accessToken) throw new Error('No hay access token para autorizar Presence.');
      await supabase.realtime.setAuth(accessToken);
    } catch (error) {
      console.warn('PRESENCE AUTH', error);
      return;
    }
    if (!currentUser || String(currentUser.id) !== requestedOwner) return;

    const topic = 'xifre:presence:global';
    const channel = supabase.channel(topic, {
      config: {
        private: true,
        presence: { key: `${requestedOwner}:${presenceTabId}` }
      }
    });
    presenceChannel = channel;
    channel
      .on('presence', { event: 'sync' }, rebuildPresencePayloads)
      .on('presence', { event: 'join' }, rebuildPresencePayloads)
      .on('presence', { event: 'leave' }, rebuildPresencePayloads)
      .subscribe((status, error) => {
        if (channel !== presenceChannel) return;
        if (status === 'SUBSCRIBED') {
          console.info('PRESENCE CHANNEL SUBSCRIBED', topic);
          presenceLastTrackAt = 0;
          void trackPresence(true);
          rebuildPresencePayloads();
          // Reconcile again after the initial server sync has settled.
          setTimeout(() => { if (channel === presenceChannel) rebuildPresencePayloads(); }, 500);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('PRESENCE CHANNEL', status, error || '');
        }
      });

    if (presenceTrackTimer) clearInterval(presenceTrackTimer);
    if (presenceRenderTimer) clearInterval(presenceRenderTimer);
    // Heartbeats keep the connected session visible; user activity determines online vs away.
    presenceTrackTimer = setInterval(() => {
      if (currentUser && String(currentUser.id) === requestedOwner) void trackPresence(true);
    }, 20000);
    presenceRenderTimer = setInterval(renderPresenceIndicators, 15000);
  })();

  try {
    await presenceSetupPromise;
  } catch (error) {
    console.warn('PRESENCE SETUP', error);
  } finally {
    presenceSetupPromise = null;
  }
}

function stopPresenceTracking() {
  if (presenceTrackTimer) clearInterval(presenceTrackTimer);
  if (presenceRenderTimer) clearInterval(presenceRenderTimer);
  presenceTrackTimer = null;
  presenceRenderTimer = null;
  const channel = presenceChannel;
  presenceChannel = null;
  presenceOwnerId = null;
  presenceLastTrackAt = 0;
  presencePayloads = new Map();
  if (channel && supabase) void supabase.removeChannel(channel).catch(error => console.warn('PRESENCE CLEANUP', error));
  renderPresenceIndicators();
}

function presenceDotForFriendOrMember(item) {
  return String(item?.user_id || item?.id || '');
}

function conversationPeerId(conversation) {
  if (!conversation || conversation.type === 'group') return '';
  const possible = conversation.other_user_id || conversation.peer_user_id || conversation.user_id || conversation.recipient_id;
  if (isValidUuid(possible)) return String(possible);
  const username = normalizeUsername(conversation.username || conversation.displayName || conversation.display_name);
  const match = friendCache.find(friend => normalizeUsername(friend.username) === username);
  return String(match?.id || '');
}

function openExternalLinkWarning(rawUrl) {
  try {
    let value = String(rawUrl || '').trim();
    if (/^www\./i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten enlaces HTTP o HTTPS.');
    pendingExternalUrl = url.href;
    setText('external-link-host', url.hostname);
    setText('external-link-url', url.href);
    closeEmojiPicker();
    openModal('external-link-modal');
    $('#external-link-cancel')?.focus({ preventScroll: true });
  } catch (error) {
    toast('Este enlace no es válido o no es compatible.', 'error');
  }
}

function closeExternalLinkWarning() {
  pendingExternalUrl = '';
  closeModal('external-link-modal');
}

function confirmExternalLink() {
  const value = pendingExternalUrl;
  if (!value) return closeExternalLinkWarning();
  let safeUrl;
  try {
    safeUrl = new URL(value);
    if (!['http:', 'https:'].includes(safeUrl.protocol)) throw new Error('Protocolo no permitido');
  } catch {
    closeExternalLinkWarning();
    return toast('Este enlace no es válido.', 'error');
  }
  closeExternalLinkWarning();
  // Open only after an explicit click in the warning dialog; never let message HTML navigate directly.
  window.open(safeUrl.href, '_blank', 'noopener,noreferrer');
}

function setText(id, value) {
const el = typeof id === 'string' ? $(`#${id}`) : id;
if (el) el.textContent = value ?? '';
}

function setMessage(id, value = '', type = '') {
const el = $(`#${id}`);
if (!el) return;
el.textContent = value;
el.className = type ? `inline-message ${type}` : 'inline-message';
}

function setModalMessage(id, value = '', type = '') {
const el = $(`#${id}`);
if (!el) return;
el.textContent = value;
el.className = type ? `modal-message ${type}` : 'modal-message';
}

function setLoading(button, loading) {
if (!button) return;
button.disabled = !!loading;
button.classList.toggle('loading', !!loading);
button.setAttribute('aria-busy', loading ? 'true' : 'false');
}

function toast(text, type = 'info') {
const container = $('#toast-container');
if (!container) return;
const node = document.createElement('div');
node.className = `toast toast-${type}`;
node.textContent = text;
container.appendChild(node);
requestAnimationFrame(() => node.classList.add('show'));
setTimeout(() => node.remove(), 3400);
}

function friendlyError(error) {
const message = String(error?.message || '');
const lower = message.toLowerCase();
if (lower.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos.';
if (lower.includes('email not confirmed')) return 'Primero confirma tu correo electrónico.';
if (lower.includes('user already registered')) return 'Ese correo ya está registrado.';
if (lower.includes('solo se permiten cuentas del dominio vedruna') || lower.includes('vedrunaimmaculada.cat')) return 'Solo se permiten cuentas del dominio vedruna';
if (lower.includes('rate limit') || lower.includes('too many requests') || Number(error?.status) === 429) return 'Se ha alcanzado temporalmente el límite de peticiones de Supabase. Espera un poco antes de volver a intentarlo.';
return message || 'No se pudo completar la operación.';
}

function formatTime(timestamp) {
if (!timestamp) return '';
return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDay = yesterday.getTime();
  if (dateDay === todayDay) return time;
  if (dateDay === yesterdayDay) return `Ayer a las ${time}`;
  return `${date.getDate()}/${date.getMonth() + 1} a las ${time}`;
}

function formatExactMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatListTime(timestamp) {
if (!timestamp) return '';
const date = new Date(timestamp);
const now = new Date();
return date.toDateString() === now.toDateString()
? formatTime(timestamp)
: date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function showScreen(name) {
if (!screens.includes(name)) name = 'landing';
// The application shell is not part of `screens`; always deactivate it when
// returning to landing/login/register/email, otherwise it remains above the landing.
$('#main-screen')?.classList.remove('active');
screens.forEach(key => document.getElementById(`${key}-screen`)?.classList.toggle('active', key === name));
}

function showMain() {
screens.forEach(key => document.getElementById(`${key}-screen`)?.classList.remove('active'));
$('#main-screen')?.classList.add('active');
}

function getRedirectURL() {
return window.location.origin + window.location.pathname;
}

/* ------------------------------------------------------------------------ */
/* Theme */
/* ------------------------------------------------------------------------ */
function currentTheme() {
return localStorage.getItem('xifre-theme') || 'dark';
}

function applyTheme(theme) {
const value = theme === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = value;
localStorage.setItem('xifre-theme', value);
$$('.theme-card').forEach(card => card.classList.toggle('active', card.dataset.themeChoice === value));
}

/* ------------------------------------------------------------------------ */
/* Auth */
/* ------------------------------------------------------------------------ */
async function checkUsernameAvailable(username) {
const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1);
if (error) throw error;
return !(data || []).length;
}

async function register() {
if (authActionInFlight || !supabase) return;
const button = $('#register-button');
const username = normalizeUsername($('#register-username')?.value);
const email = String($('#register-email')?.value || '').trim();
const password = String($('#register-password')?.value || '');
setMessage('register-message', '');

if (!/^[a-z0-9_]{3,20}$/.test(username)) return setMessage('register-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
if (!isAllowedEmailDomain(email)) return setMessage('register-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
if (password.length < 6) return setMessage('register-message', 'La contraseña debe tener al menos 6 caracteres.', 'error');

authActionInFlight = true;
setLoading(button, true);
try {
if (!(await checkUsernameAvailable(username))) {
setMessage('register-message', 'Ese username ya está ocupado.', 'error');
return;
}
const { data, error } = await supabase.auth.signUp({
email,
password,
options: { data: { username }, emailRedirectTo: getRedirectURL() }
});
if (error) throw error;
if (data?.session) {
await startApplication(data.session);
} else {
sessionStorage.setItem('xifre_pending_email', email);
setText('confirmation-email', email);
showScreen('email');
}
} catch (error) {
console.error('REGISTER', error);
setMessage('register-message', friendlyError(error), 'error');
} finally {
setLoading(button, false);
authActionInFlight = false;
}
}

async function login() {
if (authActionInFlight || !supabase) return;

const button = $('#login-button');
const email = String($('#login-email')?.value || '').trim();
const password = String($('#login-password')?.value || '');
setMessage('login-message', '');

if (!email || !password) {
setMessage('login-message', 'Introduce el correo y la contraseña.', 'error');
return;
}
if (!isAllowedEmailDomain(email)) {
setMessage('login-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
return;
}

authActionInFlight = true;
setLoading(button, true);

try {
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;
const session = data?.session;
if (!session?.user) throw new Error('No se recibió una sesión válida.');

currentUser = session.user;
appStarted = true;
sessionStorage.removeItem('xifre_pending_email');
showMain();

// La sesión ya está abierta. El resto se carga en segundo plano.
void startApplication(session);
} catch (error) {
console.error('LOGIN', error);
setMessage('login-message', friendlyError(error), 'error');
if (String(error?.message || '').toLowerCase().includes('email not confirmed')) {
sessionStorage.setItem('xifre_pending_email', email);
setText('confirmation-email', email);
showScreen('email');
}
} finally {
setLoading(button, false);
authActionInFlight = false;
}
}

async function resendConfirmation() {
const email = sessionStorage.getItem('xifre_pending_email') || '';
if (!email) return showScreen('register');
if (!isAllowedEmailDomain(email)) return toast('Solo se permiten cuentas del dominio vedruna', 'error');
const button = $('#resend-confirmation');
setLoading(button, true);
try {
const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: getRedirectURL() } });
if (error) throw error;
toast('Correo de confirmación reenviado.', 'success');
} catch (error) {
toast(friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
}

async function loadProfile() {
if (!currentUser) return;
const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,email_handle').eq('id', currentUser.id).maybeSingle();
if (error) console.warn('PROFILE LOAD', error);
currentProfile = data || {
id: currentUser.id,
username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
display_name: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
avatar_url: null,
avatar_color: 'avatar-blue',
email_handle: emailHandle(currentUser.email)
};
currentProfile.display_name = currentProfile.username;
syncProfileUI();
}

function syncProfileUI() {
const username = currentProfile?.username || 'usuario';
const handle = profileHandle({ ...(currentProfile || {}), email: currentUser?.email });
setText('profile-name', username);
setText('profile-username', `@${handle}`);
setText('bottom-profile-name', username);
setText('bottom-profile-username', `@${handle}`);
setText('settings-nav-name', username);
setText('settings-nav-username', `@${handle}`);
setText('settings-preview-username', `@${handle}`);
avatarInto($('#profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
ensurePresenceDot($('#profile-avatar'), currentUser?.id);
avatarInto($('#bottom-profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
ensurePresenceDot($('#bottom-profile-avatar'), currentUser?.id, 'presence-dot-small');
avatarInto($('#settings-nav-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
ensurePresenceDot($('#settings-nav-avatar'), currentUser?.id, 'presence-dot-small');
if (!pendingProfileAvatarFile) avatarInto($('#settings-avatar-preview'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
const settingsUsername = $('#settings-username');
if (settingsUsername && document.activeElement !== settingsUsername) settingsUsername.value = username;
}

async function startApplication(session = null) {
if (!supabase) return false;
if (startPromise) return startPromise;

startPromise = (async () => {
let sessionUser = session?.user || null;
if (!sessionUser) {
const result = await supabase.auth.getSession();
sessionUser = result.data?.session?.user || null;
}
if (!sessionUser) throw new Error('No hay una sesión autenticada.');
if (!isAllowedEmailDomain(sessionUser.email)) {
  // Marcar el sign-out para que el listener de Auth no nos mande a la landing.
  domainSessionSignOut = true;
  currentUser = null;
  currentProfile = null;
  appStarted = false;
  try { await supabase.auth.signOut({ scope: 'local' }); } catch (signOutError) { console.warn('DOMAIN SESSION SIGNOUT', signOutError); }
  showScreen('login');
  setMessage('login-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
  return false;
}

currentUser = sessionUser;
appStarted = true;
void setupPresenceTracking();
applyTheme(currentTheme());
showMain();

const results = await Promise.allSettled([
loadProfile(),
loadFriends(),
loadConversations()
]);
results.forEach(result => {
if (result.status === 'rejected') console.warn('STARTUP LOAD', result.reason);
});

try { await platformInitialize(); } catch (platformError) { console.warn('XIFRE PLATFORM STARTUP', platformError); }

if (conversationListPoll) clearInterval(conversationListPoll);
conversationListPoll = setInterval(() => { if (document.visibilityState === 'visible' && currentUser) loadConversations().catch(() => {}); }, 4000);
// Load requests as soon as the app starts, not only after opening the modal.
void loadFriendRequests().catch(error => console.warn('INITIAL REQUEST LOAD', error));
if (friendRequestsPoll) clearInterval(friendRequestsPoll);
friendRequestsPoll = setInterval(() => {
  if (document.visibilityState !== 'visible' || !currentUser) return;
  void loadFriendRequests().catch(error => console.warn('REQUEST POLL', error));
  if (!$('#people-modal')?.classList.contains('hidden')) {
    void loadFriends().catch(error => console.warn('FRIEND POLL', error));
  }
}, 6500);

try {
await restoreConversation();
} catch (restoreError) {
console.warn('RESTORE CONVERSATION', restoreError);
}
return true;
})().catch(async error => {
console.error('START APPLICATION', error);
try {
const { data } = await supabase.auth.getSession();
if (data?.session?.user) {
currentUser = data.session.user;
appStarted = true;
showMain();
return true;
}
} catch (sessionError) {
console.warn('SESSION CHECK', sessionError);
}
appStarted = false;
currentUser = null;
return false;
}).finally(() => {
startPromise = null;
});
return startPromise;
}

async function logout() {
  if (!currentUser || logoutInFlight) return;
  const confirmed = await askConfirm('Cerrar sesión', '¿Quieres cerrar tu sesión de XIFRE? Volverás a la página principal.', 'Cerrar sesión');
  if (!confirmed) return;
  logoutInFlight = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('LOGOUT', error);
    toast(`No se pudo cerrar la sesión: ${friendlyError(error)}`, 'error');
    logoutInFlight = false;
    return;
  }
  stopPresenceTracking();
  platformStop();
  stopChatRealtime();
  if (conversationListPoll) clearInterval(conversationListPoll);
  if (friendRequestsPoll) clearInterval(friendRequestsPoll);
  conversationListPoll = null;
  friendRequestsPoll = null;
  currentUser = null;
  currentProfile = null;
  currentConversation = null;
  currentConversationData = null;
  currentMembers = [];
  signedChatMediaCache.clear();
  keyboardWordUsageCache = null;
  keyboardWordUsageOwner = null;
  clearPendingChatAttachment(false);
  closeAttachmentMenu();
  closeCatalanKeyboard();
  conversationCache = [];
  friendCache = [];
  memberCache.clear();
  friendRequestLoadPromise = null;
  friendRequestRefreshQueued = false;
  friendRequestsLoadedOnce = false;
  friendRequestKnownIds.clear();
  lastFriendRequestsSignature = null;
  appStarted = false;
  logoutInFlight = false;
  sessionStorage.removeItem('xifre_current_conversation');
  closeAllModals();
  $('#settings-modal')?.classList.add('hidden');
  showScreen('landing');
  // Explicitly force the landing state after Supabase's SIGNED_OUT event has settled.
  setTimeout(() => {
    if (!currentUser && !appStarted) {
      $('#main-screen')?.classList.remove('active');
      showScreen('landing');
    }
  }, 0);
}

function closeAllModals() {
$$('.modal').forEach(m => m.classList.add('hidden'));
$('#message-menu')?.classList.add('hidden');
}

/* ------------------------------------------------------------------------ */
/* Friends */
/* ------------------------------------------------------------------------ */
async function loadFriends() {
if (!currentUser) return;
const rpc = await supabase.rpc('xifre_get_my_friends');
if (!rpc.error) {
  friendCache = (rpc.data || []).map(friend => ({ ...friend, display_name: friend.display_name || friend.username }));
} else {
  console.warn('FRIENDS RPC', rpc.error);
  // Safe fallback for installations where the migration has not yet been applied.
  const base = await supabase.from('friendships').select('user1_id,user2_id').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
  if (base.error) {
    console.error('FRIENDS FALLBACK', base.error);
    return; // Keep the last known friends instead of replacing it with an empty list.
  }
  const ids = [...new Set((base.data || []).map(row => String(row.user1_id) === String(currentUser.id) ? row.user2_id : row.user1_id).filter(Boolean))];
  if (!ids.length) friendCache = [];
  else {
    const result = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,email_handle').in('id', ids);
    if (result.error) {
      console.error('FRIEND PROFILES FALLBACK', result.error);
      return;
    }
    friendCache = result.data || [];
  }
}
renderFriendsModal();
renderGroupSelection();
renderGroupAddSelection();
renderConversations();
renderPresenceIndicators();
}
async function searchPeople(query) {
const list = $('#friend-search-results');
if (!list) return;
if (peopleSearchTimer) clearTimeout(peopleSearchTimer);
const clean = normalizeUsername(query);
if (!clean) {
renderPeople(friendCache.map(f => ({ ...f, relationship: 'friend' })));
return;
}
if (clean.replace(/^@+|@+$/g, '').length < 1) {
list.innerHTML = '<div class="empty-sidebar">Escribe un username o @.</div>';
return;
}
list.innerHTML = '<div class="empty-sidebar">Buscando...</div>';
peopleSearchTimer = setTimeout(async () => {
const { data, error } = await supabase.rpc('xifre_search_people', { p_query: clean });
if (error) {
list.innerHTML = `<div class="empty-sidebar">${esc(error.message)}</div>`;
return;
}
renderPeople(data || []);
}, 180);
}

function renderPeople(results) {
const list = $('#friend-search-results');
if (!list) return;
list.innerHTML = '';
if (!results.length) {
  list.innerHTML = '<div class="empty-sidebar">No se ha encontrado a nadie.</div>';
  return;
}
results.forEach(person => {
  const targetId = String(person.id || '');
  const relationship = person.relationship || 'none';
  const row = document.createElement('div');
  row.className = 'search-result';
  const handle = String(person.email_handle || '').trim();
  const status = relationship === 'friend' ? 'Amigo' : relationship === 'outgoing_pending' ? 'Solicitud enviada' : relationship === 'incoming_pending' ? 'Te ha enviado una solicitud' : 'No conectado';
  row.innerHTML = `
    <span class="search-avatar presence-host">${avatarHTML(person.username, person.avatar_url, 'private', '', person.avatar_color)}${presenceDotHTML(targetId)}</span>
    <div class="result-copy"><strong>${esc(person.username || person.display_name || 'Usuario')}</strong><small>@${esc(handle || person.username || 'usuario')}</small><small class="relationship-status">${esc(status)}</small></div>`;
  const action = document.createElement('button');
  action.type = 'button';
  action.className = `result-action ${relationship === 'friend' ? '' : 'secondary'}`;
  const refreshSearch = () => searchPeople($('#friend-search')?.value || '');
  if (relationship === 'friend') {
    action.textContent = 'Abrir';
    action.addEventListener('click', async () => { closeModal('people-modal'); await openPrivateChat(targetId); });
  } else if (relationship === 'outgoing_pending') {
    action.textContent = 'Cancelar';
    action.addEventListener('click', async () => {
      if (!isValidUuid(targetId)) return toast('No se ha podido identificar a esta persona. Vuelve a buscarla.', 'error');
      action.disabled = true;
      try {
        const { error } = await supabase.rpc('xifre_cancel_friend_request', { p_target_user: targetId });
        if (error) throw error;
        toast('Solicitud cancelada. Ya puedes volver a añadir a esta persona.', 'success');
        await refreshSearch();
      } catch (error) {
        action.disabled = false;
        toast(friendlyError(error), 'error');
      }
    });
  } else if (relationship === 'incoming_pending') {
    action.textContent = 'Aceptar';
    action.addEventListener('click', async () => {
      if (!isValidUuid(targetId)) return toast('No se ha podido identificar a esta persona. Vuelve a buscarla.', 'error');
      action.disabled = true;
      try {
        const { error } = await supabase.rpc('xifre_accept_friend_request_from', { p_sender_user: targetId });
        if (error) throw error;
        await Promise.all([loadFriends(), loadFriendRequests()]);
        toast('Solicitud aceptada. Ahora sois amigos.', 'success');
        await refreshSearch();
      } catch (error) {
        action.disabled = false;
        toast(friendlyError(error), 'error');
      }
    });
  } else {
    action.textContent = 'Añadir';
    action.addEventListener('click', async () => {
      if (!isValidUuid(targetId)) return toast('No se ha podido identificar a esta persona. Vuelve a buscarla.', 'error');
      action.disabled = true;
      try {
        const { error } = await supabase.rpc('xifre_send_friend_request', { p_target_user: targetId });
        if (error) throw error;
        toast('Solicitud enviada.', 'success');
        await refreshSearch();
      } catch (error) {
        action.disabled = false;
        toast(friendlyError(error), 'error');
      }
    });
  }
  row.appendChild(action);
  list.appendChild(row);
});
}
function renderFriendsModal() {
const list = $('#friends-modal-list');
if (!list) return;
list.innerHTML = '';
if (!friendCache.length) {
list.innerHTML = '<div class="empty-sidebar">Todavía no tienes amigos.</div>';
return;
}
friendCache.forEach(friend => {
const row = document.createElement('div');
row.className = 'friend-item';
row.innerHTML = `<span class="friend-avatar presence-host">${avatarHTML(friend.username, friend.avatar_url, 'private', 'friend-avatar', friend.avatar_color)}${presenceDotHTML(friend.id)}</span><div class="friend-copy"><strong>${esc(friend.username)}</strong><small>@${esc(friend.email_handle || friend.username)}</small></div><button class="open-chat" type="button">Abrir</button>`;
row.querySelector('button').addEventListener('click', async () => { closeModal('people-modal'); await openPrivateChat(friend.id); });
list.appendChild(row);
});
}

async function loadFriendRequests() {
  if (!currentUser) return;
  if (friendRequestLoadPromise) {
    // If an accept/reject happens during a poll, force one fresh query after this one finishes.
    friendRequestRefreshQueued = true;
    return friendRequestLoadPromise;
  }
  const userId = String(currentUser.id);
  const list = $('#friend-requests-list');
  if (list && !list.children.length) list.innerHTML = '<div class="empty-sidebar">Cargando solicitudes…</div>';
  friendRequestLoadPromise = (async () => {
    const { data, error } = await supabase.rpc('xifre_get_friend_requests');
    if (String(currentUser?.id || '') !== userId) return;
    if (error) {
      console.error('FRIEND REQUESTS RPC', error);
      setModalMessage('requests-message', `No se pudieron cargar las solicitudes: ${friendlyError(error)}`, 'error');
      // Preserve the last good UI and badge on network/RLS/RPC failure.
      return;
    }
    setModalMessage('requests-message', '');
    const requests = (data || []).map(req => ({
      id: req.request_id || req.id,
      sender_id: req.sender_id,
      receiver_id: userId,
      created_at: req.created_at,
      sender: {
        id: req.sender_id,
        username: req.username,
        display_name: req.display_name,
        avatar_url: req.avatar_url,
        avatar_color: req.avatar_color,
        email_handle: req.email_handle
      }
    })).filter(req => isValidUuid(req.id) && isValidUuid(req.sender_id));
    const signature = JSON.stringify(requests.map(req => [req.id, req.sender_id, req.created_at, req.sender.username, req.sender.avatar_url]));
    const ids = new Set(requests.map(req => String(req.id)));
    if (friendRequestsLoadedOnce) {
      const fresh = requests.filter(req => !friendRequestKnownIds.has(String(req.id)));
      if (fresh.length && document.visibilityState === 'visible') {
        toast(fresh.length === 1 ? `Nueva solicitud de amistad de @${fresh[0].sender.username || 'usuario'}.` : `Tienes ${fresh.length} nuevas solicitudes de amistad.`, 'info');
      }
    }
    friendRequestsLoadedOnce = true;
    friendRequestKnownIds = ids;
    setFriendRequestBadge(requests.length);
    if (signature !== lastFriendRequestsSignature || list?.dataset.requestSignature !== signature) {
      lastFriendRequestsSignature = signature;
      renderRequests(requests);
      renderPresenceIndicators();
      if (list) list.dataset.requestSignature = signature;
    }
  })().finally(() => {
    friendRequestLoadPromise = null;
    if (friendRequestRefreshQueued && currentUser) {
      friendRequestRefreshQueued = false;
      queueMicrotask(() => { void loadFriendRequests().catch(error => console.warn('QUEUED REQUEST REFRESH', error)); });
    }
  });
  return friendRequestLoadPromise;
}

function setFriendRequestBadge(count) {
  const value = Math.max(0, Number(count) || 0);
  for (const selector of ['#friend-request-badge', '#friend-request-tab-badge']) {
    const badge = $(selector);
    if (!badge) continue;
    badge.textContent = value > 99 ? '99+' : String(value);
    badge.classList.toggle('hidden', value === 0);
    badge.setAttribute('aria-label', `${value} solicitudes pendientes`);
  }
}

function renderRequests(requests) {
const list = $('#friend-requests-list');
if (!list) return;
list.innerHTML = '';
if (!requests.length) { list.dataset.requestSignature = '[]'; list.innerHTML = '<div class="empty-sidebar">No hay solicitudes.</div>'; return; }
requests.forEach(req => {
const row = document.createElement('div');
row.className = 'request-item';
row.innerHTML = `<span class="request-avatar presence-host">${avatarHTML(req.sender.username || 'Usuario', req.sender.avatar_url, 'private', 'request-avatar', req.sender.avatar_color)}${presenceDotHTML(req.sender_id)}</span><div class="request-copy"><strong>${esc(req.sender.username || 'Usuario')}</strong><small>@${esc(req.sender.email_handle || req.sender.username || 'usuario')}</small><small>Quiere añadirte como amigo</small></div><div class="request-actions"><button class="request-accept" type="button">Aceptar</button><button class="request-reject" type="button">Rechazar</button></div>`;
const [accept, reject] = $$('.request-actions button', row);
accept.addEventListener('click', () => acceptRequest(req, row));
reject.addEventListener('click', () => rejectRequest(req, row));
list.appendChild(row);
});
}

async function acceptRequest(req, row) {
  const buttons = $$('.request-actions button', row);
  buttons.forEach(button => button.disabled = true);
  try {
    const { error } = await supabase.rpc('xifre_accept_friend_request', { p_request_id: req.id });
    if (error) throw error;
    row?.remove();
    setFriendRequestBadge(Math.max(0, Number($('#friend-request-badge')?.textContent || 0) - 1));
    toast('Ahora sois amigos.', 'success');
    const refreshes = await Promise.allSettled([loadFriends(), loadFriendRequests(), loadConversations()]);
    for (const result of refreshes) if (result.status === 'rejected') console.warn('POST-ACCEPT REFRESH', result.reason);
  } catch (error) {
    buttons.forEach(button => button.disabled = false);
    toast(friendlyError(error), 'error');
  }
}
async function rejectRequest(req, row) {
  const buttons = $$('.request-actions button', row);
  buttons.forEach(button => button.disabled = true);
  try {
    const { error } = await supabase.rpc('xifre_reject_friend_request', { p_request_id: req.id });
    if (error) throw error;
    row?.remove();
    setFriendRequestBadge(Math.max(0, Number($('#friend-request-badge')?.textContent || 0) - 1));
    toast('Solicitud rechazada.', 'success');
    await loadFriendRequests().catch(error => console.warn('POST-REJECT REFRESH', error));
  } catch (error) {
    buttons.forEach(button => button.disabled = false);
    toast(friendlyError(error), 'error');
  }
}
/* ------------------------------------------------------------------------ */
/* Conversations */
/* ------------------------------------------------------------------------ */
async function loadConversations() {
  if (!currentUser) return [];
  const requestSequence = ++conversationLoadSequence;
  const ownerAtStart = String(currentUser.id);
  const { data, error } = await supabase.rpc('xifre_get_my_conversations');
  if (error) { console.warn('CONVERSATIONS', error); return conversationCache; }
  if (!currentUser || String(currentUser.id) !== ownerAtStart || requestSequence !== conversationLoadSequence) return conversationCache;
  const unique = new Map();
  for (const row of data || []) {
    if (!row?.id) continue;
    unique.set(String(row.id), { ...row, displayName: row.display_name || row.name || (row.type === 'group' ? 'Grupo' : 'Chat privado') });
  }
  conversationCache = [...unique.values()];
  conversationCache.sort((a, b) => new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0));
  renderConversations();
  platformUpdateChatBadges();
  return conversationCache;
}

function renderConversations(filter = conversationFilter) {
const list = $('#conversation-list'); if (!list) return;
list.innerHTML = '';
setText('chat-count', conversationCache.length);
const q = normalizeUsername(filter);
const visible = conversationCache.filter(c => !q || normalizeUsername(c.displayName || c.name).includes(q) || normalizeUsername(c.username).includes(q));
if (!visible.length) { list.innerHTML = `<div class="empty-sidebar">${q ? 'No se encontraron conversaciones.' : 'No tienes conversaciones todavía.'}</div>`; return; }
visible.forEach(conversation => {
const isGroup = conversation.type === 'group';
const label = conversation.displayName || conversation.name || (isGroup ? 'Grupo' : 'Chat privado');
const row = document.createElement('button'); row.type='button';
const unread = Number(conversation.unread_count || 0);
const mentioned = !!conversation.has_mention;
row.className = `conversation${String(currentConversation)===String(conversation.id)?' active':''}${unread?' unread':''}${isGroup?' group-conversation':''}`;
const peerId = isGroup ? '' : conversationPeerId(conversation);
const previewText = conversation.last_message ? messagePreviewText(conversation.last_message) : (isGroup ? `${conversation.member_count||0} miembros` : 'Conversación');
row.innerHTML = `${presenceAvatarHTML(label, conversation.avatar_url, isGroup?'group':'private','conversation-avatar-image',conversation.avatar_color,peerId,'conversation-avatar-wrap')}<span class="conversation-copy"><span class="conversation-name">${esc(label)}</span><span class="conversation-preview ${conversation.message_type==='system'?'conversation-system':''}">${esc(previewText)}</span></span><span class="conversation-tail">${mentioned?'<span class="conversation-mention-badge">@</span>':''}${unread?`<span class="conversation-unread-badge">${unread>99?'99+':unread}</span>`:''}<span class="conversation-meta">${esc(formatListTime(conversation.last_message_at))}</span></span>`;
row.addEventListener('click',()=>openConversation(conversation.id,conversation));
row.addEventListener('contextmenu',e=>{e.preventDefault(); openConversationMenu(conversation,e.clientX,e.clientY);});
list.appendChild(row);
});
renderPresenceIndicators();
}

function openConversationSearch() {
openModal('conversation-search-modal');
const input=$('#conversation-search-input'); input.value=''; renderConversationSearch(''); setTimeout(()=>input.focus(),0);
}
function renderConversationSearch(query) {
const list=$('#conversation-search-results'); if(!list)return;
const q=normalizeUsername(query); const matches=conversationCache.filter(c=>!q||normalizeUsername(c.displayName||c.name).includes(q)||normalizeUsername(c.username).includes(q));
list.innerHTML='';
if(!matches.length){list.innerHTML='<div class="empty-sidebar">No se encontraron conversaciones.</div>';return;}
matches.forEach(c=>{const row=document.createElement('button');row.type='button';row.className='friend-item';const group=c.type==='group';const peerId = group ? '' : conversationPeerId(c); row.innerHTML=`<span class="friend-avatar presence-host">${avatarHTML(c.displayName,c.avatar_url,group?'group':'private','friend-avatar',c.avatar_color)}${presenceDotHTML(peerId)}</span><div class="friend-copy"><strong>${esc(c.displayName)}</strong><small>${group?'Grupo':'@'+esc(c.username||'')}</small></div><span class="open-chat">Abrir</span>`;row.addEventListener('click',()=>{closeModal('conversation-search-modal');openConversation(c.id,c);});list.appendChild(row);});
}

function openConversationMenu(conversation,x,y){
selectedConversationForMenu=conversation; const menu=$('#conversation-menu'); if(!menu)return; menu.classList.remove('hidden'); menu.style.left=`${Math.min(x,window.innerWidth-210)}px`; menu.style.top=`${Math.min(y,window.innerHeight-70)}px`;
}
function closeConversationMenu(){ $('#conversation-menu')?.classList.add('hidden'); selectedConversationForMenu=null; }
async function markConversationRead(id){ if(!id||!currentUser)return; const {error}=await supabase.rpc('xifre_mark_read',{p_conversation_id:id}); if(!error){const c=conversationCache.find(x=>String(x.id)===String(id));if(c){c.unread_count=0;c.has_mention=false;}renderConversations();} closeConversationMenu(); }

async function openPrivateChat(friendId) {
try {
const { data, error } = await supabase.rpc('create_private_chat', { other_user: friendId });
if (error) throw error;
const id = String(data || '');
await loadConversations();
await openConversation(id);
} catch (error) {
toast(friendlyError(error), 'error');
}
}

async function hydrateMemberProfiles(members) {
  const list = Array.isArray(members) ? members : [];
  const ids = [...new Set(list.map(getMemberId).filter(isValidUuid))];
  if (!ids.length) return list;
  try {
    const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,email_handle').in('id', ids);
    if (error) throw error;
    const profiles = new Map((data || []).map(profile => [String(profile.id), profile]));
    return list.map(member => {
      const p = profiles.get(getMemberId(member)) || {};
      return { ...member, username: member.username || p.username, display_name: member.display_name || p.display_name, avatar_url: member.avatar_url || p.avatar_url, avatar_color: member.avatar_color || p.avatar_color, email_handle: member.email_handle || p.email_handle || '' };
    });
  } catch (error) {
    console.warn('MEMBER PROFILE DETAILS', error);
    return list;
  }
}

async function openConversation(id, cached = null) {
  if (!id || !currentUser) return false;
  const conversationId = String(id);
  const openSequence = ++conversationOpenSequence;
  const isCurrentOpen = () => openSequence === conversationOpenSequence && String(currentConversation || '') === conversationId;
  const isAlreadyOpen = String(currentConversation || '') === conversationId;
  let conversation = cached || conversationCache.find(c => String(c.id) === conversationId);
  if (!conversation) {
    await loadConversations();
    // A slower click must not take over after the user has selected another chat.
    if (openSequence !== conversationOpenSequence) return false;
    conversation = conversationCache.find(c => String(c.id) === conversationId);
  }
  if (!conversation || openSequence !== conversationOpenSequence) return false;

  // Never carry a pending image into another DM/group by accident.
  if (String(currentConversation || '') !== conversationId && pendingChatAttachment) {
    clearPendingChatAttachment(false);
    toast('El adjunto se ha quitado porque has cambiado de conversación.', 'info');
  }

  try {
    currentConversation = conversationId;
    currentConversationData = conversation;
    sessionStorage.setItem('xifre_current_conversation', conversationId);

    const memberResponse = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: conversationId });
    if (!isCurrentOpen()) return false;
    if (memberResponse.error) throw memberResponse.error;

    const hydrated = await hydrateMemberProfiles(memberResponse.data || []);
    if (!isCurrentOpen()) return false;
    currentMembers = hydrated;
    memberCache.set(conversationId, currentMembers);

    updateChatHeader();
    renderRightPane();
    renderConversations();
    await loadMessages(conversationId, !isAlreadyOpen);
    if (!isCurrentOpen()) return false;

    const readResult = await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId });
    if (!isCurrentOpen()) return false;
    if (readResult.error) console.warn('MARK READ', readResult.error);
    const readRow = conversationCache.find(c => String(c.id) === conversationId);
    if (readRow) { readRow.unread_count = 0; readRow.has_mention = false; }
    renderConversations();
    platformUpdateChatBadges();
    setupTypingChannel(conversationId);
    setupMessageChannel(conversationId);
    $('#message-input').disabled = false;
    updateSendState();
    resizeMessageInput();
    updateMessageCharacterCount();
    $('#message-input').focus();
    xifreChatOpenRetries.delete(conversationId);
    return true;
  } catch (error) {
    // Errors from an obsolete open attempt must not overwrite the active chat.
    if (!isCurrentOpen()) return false;
    console.error('OPEN CONVERSATION', error);
    currentConversation = conversationId;
    currentConversationData = conversation;
    showChatError(error?.message || 'No se pudo abrir esta conversación.');
    const tries=(xifreChatOpenRetries.get(conversationId)||0)+1;
    xifreChatOpenRetries.set(conversationId,tries);
    if(tries<=2)setTimeout(()=>{
      if(currentUser && currentConversation===conversationId && conversationOpenSequence===openSequence){
        void openConversation(conversationId,conversationCache.find(c=>String(c.id)===conversationId)||conversation).catch(console.warn);
      }
    },2300);
    return false;
  }
}
async function restoreConversation() {
if (!currentUser) return;
const saved = sessionStorage.getItem('xifre_current_conversation');
if (!saved) return;
const conversation = conversationCache.find(c => String(c.id) === String(saved));
if (conversation) await openConversation(saved, conversation);
}

function updateChatHeader() {
const isGroup = currentConversationData?.type === 'group';
let name = currentConversationData?.displayName || currentConversationData?.name || (isGroup ? 'Grupo' : 'Conversación');
let url = currentConversationData?.avatar_url || null;
let subtitle = '';
if (!isGroup) {
const other = currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
name = other?.username || name;
url = other?.avatar_url || null;
subtitle = 'Mensaje directo';
} else {
subtitle = `${currentMembers.length} miembro${currentMembers.length === 1 ? '' : 's'}`;
}
avatarInto($('#chat-avatar'), name, url, isGroup ? 'group' : 'private', isGroup ? '' : (currentMembers.find(m=>String(m.user_id)!==String(currentUser.id))?.avatar_color || ''));
const chatPeer = isGroup ? null : currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
ensurePresenceDot($('#chat-avatar'), getMemberId(chatPeer));
setText('chat-title', name);
setText('chat-subtitle', subtitle);
$('#chat-info-button')?.classList.remove('hidden');
}

/* ------------------------------------------------------------------------ */
/* Messages */
/* ------------------------------------------------------------------------ */
function messageObject(row) {
return { ...row };
}

function isSafeChatMediaPath(path) {
  return typeof path === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9_-]{8,100}\.(?:png|jpe?g|webp|gif)$/i.test(path);
}

function parseImageAttachmentContent(content) {
  const source = String(content || '');
  const match = source.match(/^\[\[XIFRE_IMAGE:([^\]\r\n]+)\]\](?:\r?\n([\s\S]*))?$/i);
  if (!match || !isSafeChatMediaPath(match[1])) return null;
  return { path: match[1], caption: match[2] || '' };
}

function makeImageAttachmentContent(path, caption = '') {
  const cleanCaption = String(caption || '').trim();
  return `${CHAT_IMAGE_MARKER_PREFIX}${path}]]${cleanCaption ? `\n${cleanCaption}` : ''}`;
}

function messagePreviewText(content) {
  const attachment = parseImageAttachmentContent(content);
  if (!attachment) return String(content || '');
  const caption = attachment.caption.trim();
  return caption ? `🖼️ ${caption}` : '🖼️ Imagen adjunta';
}

async function getSignedChatMediaUrl(path) {
  if (!isSafeChatMediaPath(path)) throw new Error('Ruta de imagen no válida.');
  const cached = signedChatMediaCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 90_000) return cached.url;
  const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  const url = data?.signedUrl || data?.signedURL;
  if (!url) throw new Error('Supabase no devolvió el enlace temporal de la imagen.');
  signedChatMediaCache.set(path, { url, expiresAt: Date.now() + 55 * 60 * 1000 });
  return url;
}

async function resolveMessageAttachmentUrls(messages) {
  // Limit simultaneous signed-URL requests when opening long chats with many images.
  const queue = (messages || []).filter(message => parseImageAttachmentContent(message?.content));
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const message = queue[cursor++];
      const attachment = parseImageAttachmentContent(message?.content);
      if (!attachment) continue;
      try {
        message.attachment_signed_url = await getSignedChatMediaUrl(attachment.path);
        message.attachment_load_error = false;
      } catch (error) {
        message.attachment_signed_url = '';
        message.attachment_load_error = true;
        // Do not fail message history because one attachment is missing or cannot be signed.
        console.warn('CHAT IMAGE URL', error?.message || error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, () => worker()));
  return messages;
}

function chatAttachmentExtension(file) {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[String(file?.type || '').toLowerCase()] || '';
}

function validateChatAttachment(file) {
  if (!file) throw new Error('Selecciona una imagen o GIF.');
  if (!chatAttachmentExtension(file)) throw new Error('Formato no admitido. Usa PNG, JPG, WEBP o GIF.');
  if (file.size > CHAT_MEDIA_MAX_BYTES) throw new Error('La imagen supera el límite de 8 MB.');
  if (file.size <= 0) throw new Error('El archivo está vacío.');
  return true;
}

function createChatFileId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function syncAttachmentMessageLimit() {
  const input = $('#message-input');
  if (!input) return;
  input.maxLength = pendingChatAttachment ? CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT : CHAT_MESSAGE_MAX_CHARS;
  updateMessageCharacterCount();
}

function setPendingChatAttachment(file) {
  if (!currentConversation) { toast('Selecciona una conversación antes de adjuntar una imagen.', 'info'); return false; }
  try { validateChatAttachment(file); }
  catch (error) { toast(error.message, 'error'); return false; }
  clearPendingChatAttachment(false);
  pendingChatAttachment = file;
  pendingChatAttachmentGeneration++;
  pendingChatAttachmentObjectUrl = URL.createObjectURL(file);
  const preview = $('#chat-attachment-preview');
  const image = $('#chat-attachment-preview-image');
  if (image) {
    image.src = pendingChatAttachmentObjectUrl;
    image.alt = `Vista previa de ${file.name || 'imagen adjunta'}`;
  }
  setText('chat-attachment-preview-name', file.name || (file.type === 'image/gif' ? 'imagen.gif' : 'imagen adjunta'));
  preview?.classList.remove('hidden');
  $('#attachment-menu')?.classList.add('hidden');
  $('#composer-plus-button')?.setAttribute('aria-expanded', 'false');
  syncAttachmentMessageLimit();
  updateSendState();
  $('#message-input')?.focus({ preventScroll: true });
  return true;
}

function clearPendingChatAttachment(restoreInput = true) {
  pendingChatAttachment = null;
  pendingChatAttachmentGeneration++;
  if (pendingChatAttachmentObjectUrl) {
    try { URL.revokeObjectURL(pendingChatAttachmentObjectUrl); } catch {}
  }
  pendingChatAttachmentObjectUrl = null;
  const image = $('#chat-attachment-preview-image');
  if (image) image.removeAttribute('src');
  $('#chat-attachment-preview')?.classList.add('hidden');
  const fileInput = $('#chat-attachment-input');
  if (fileInput) fileInput.value = '';
  syncAttachmentMessageLimit();
  updateSendState();
  if (restoreInput) $('#message-input')?.focus({ preventScroll: true });
}

function toggleAttachmentMenu() {
  const menu = $('#attachment-menu');
  const button = $('#composer-plus-button');
  if (!menu || !button || button.disabled) return;
  if (!currentConversation) { toast('Selecciona una conversación antes de adjuntar una imagen.', 'info'); return; }
  const opening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (opening) {
    const rect = button.getBoundingClientRect();
    const width = 245;
    menu.style.width = `${Math.min(width, window.innerWidth - 20)}px`;
    menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - Math.min(width, window.innerWidth - 20) - 10))}px`;
    menu.style.top = `${Math.max(10, rect.top - 76)}px`;
  }
}

function closeAttachmentMenu() {
  $('#attachment-menu')?.classList.add('hidden');
  $('#composer-plus-button')?.setAttribute('aria-expanded', 'false');
}

async function uploadChatAttachment(file, conversationId) {
  validateChatAttachment(file);
  const extension = chatAttachmentExtension(file);
  const path = `${currentUser.id}/${conversationId}/${createChatFileId()}.${extension}`;
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type,
    metadata: { originalName: String(file.name || `imagen.${extension}`).slice(0, 180) }
  });
  if (error) throw error;
  return path;
}


const xifreMessageLoads=new Map();
const xifreChatOpenRetries=new Map();
const xifreRecentlySent=new Map();
const xifreSendTimes=[];
async function loadMessages(conversationId, scrollToBottom = false) {
  const key=String(conversationId||'');
  const existing=xifreMessageLoads.get(key);
  if(existing) return existing;
  const job=loadMessagesInternal(conversationId,scrollToBottom);
  xifreMessageLoads.set(key,job);
  try{return await job;} finally{if(xifreMessageLoads.get(key)===job)xifreMessageLoads.delete(key);}
}
async function loadMessagesInternal(conversationId, scrollToBottom = false) {
  const requestedId = String(conversationId || '');
  if (!requestedId || !currentUser) return;
  const ownerAtStart = String(currentUser.id);
  const sequence = (messageLoadSequences.get(requestedId) || 0) + 1;
  messageLoadSequences.set(requestedId, sequence);
  let response = await supabase.rpc('xifre_get_messages_v17', {
    p_conversation_id: requestedId,
    p_limit: 500
  });
  // Allow a temporarily un-migrated deployment to keep reading messages while SQL is updated.
  if (response.error && (response.error.code === 'PGRST202' || /xifre_get_messages_v17/i.test(String(response.error.message || '')))) {
    response = await supabase.rpc('xifre_get_messages', { p_conversation_id: requestedId, p_limit: 500 });
  }
  if (response.error) throw response.error;
  if (String(currentUser?.id || '') !== ownerAtStart || String(currentConversation || '') !== requestedId) return;
  if (messageLoadSequences.get(requestedId) !== sequence) return;
  const messages = (response.data || []).map(messageObject);
  await resolveMessageAttachmentUrls(messages);
  if (String(currentUser?.id || '') !== ownerAtStart || String(currentConversation || '') !== requestedId) return;
  if (messageLoadSequences.get(requestedId) !== sequence) return; // Ignore out-of-order poll/realtime responses.
  renderMessages(messages, scrollToBottom);
  void loadMessageReactions(requestedId).catch(error => console.debug('REACTIONS LOAD', error));
}

function messageRenderSignature(message) {
  return JSON.stringify([
    message?.content, message?.created_at, message?.edited_at || null, message?.sender_id,
    message?.sender_username, message?.sender_avatar_url, message?.sender_avatar_color,
    message?.reply_to, message?.reply_sender_id, message?.reply_sender_username,
    message?.reply_sender_avatar_url, message?.reply_content, message?.mentions || [],
    !!message?.mention_everyone, message?.message_type || 'user',
    message?.attachment_signed_url || '', !!message?.attachment_load_error
  ]);
}

function renderMessageContent(content, message) {
  const source = String(content || '');
  const gift=source.match(PLATFORM_GIFT_RE);
  if(gift)return platformGiftCardMarkup(gift[1]);
  const mentionedIds = new Set((message?.mentions || []).map(id => String(id)));
  const hasMentionData = Array.isArray(message?.mentions);
  const membersByName = new Map();
  for (const member of [...(currentMembers || [])].sort((a, b) => String(b.username || '').length - String(a.username || '').length)) {
    const username = String(member.username || '').trim();
    if (username) membersByName.set(username.toLowerCase(), member);
  }

  // URLs are links only when they use HTTP(S) or www.; clicking is intercepted by the warning modal.
  // Mention token parsing and escaping remain independent to prevent HTML injection.
  const tokenRegex = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)|(^|[^a-z0-9_])@([a-z0-9_]+)/gi;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(source)) !== null) {
    const linkToken = match[1];
    if (linkToken) {
      const tokenStart = match.index;
      let cleanLink = linkToken;
      const trailing = cleanLink.match(/[.,!?;:)\]}]+$/)?.[0] || '';
      if (trailing) cleanLink = cleanLink.slice(0, -trailing.length);
      if (!cleanLink) continue;
      const candidate = /^www\./i.test(cleanLink) ? `https://${cleanLink}` : cleanLink;
      let safe = false;
      try { const parsed = new URL(candidate); safe = parsed.protocol === 'http:' || parsed.protocol === 'https:'; } catch {}
      html += esc(source.slice(lastIndex, tokenStart));
      if (safe) {
        html += `<a class="chat-link" href="${esc(candidate)}" target="_blank" rel="noopener noreferrer nofollow" data-external-url="${esc(candidate)}">${esc(cleanLink)}</a>`;
      } else {
        html += esc(cleanLink);
      }
      lastIndex = tokenStart + cleanLink.length;
      continue;
    }

    const prefix = match[2] || '';
    const name = match[3] || '';
    const tokenStart = match.index + prefix.length;
    const tokenEnd = tokenStart + name.length + 1;
    html += esc(source.slice(lastIndex, tokenStart));
    if (name.toLowerCase() === 'everyone' && currentConversationData?.type === 'group' && message?.mention_everyone) {
      html += '<span class="mention-token everyone">@everyone</span>';
    } else {
      const member = membersByName.get(name.toLowerCase());
      const memberId = getMemberId(member);
      const explicitlyMentioned = memberId && mentionedIds.has(String(memberId));
      const canStyleLegacyMention = !hasMentionData && !!member;
      if (member && (explicitlyMentioned || canStyleLegacyMention)) {
        const isSelf = String(memberId) === String(currentUser?.id);
        html += `<span class="mention-token${isSelf ? ' self' : ''}">@${esc(member.username)}</span>`;
      } else {
        html += esc(`@${name}`);
      }
    }
    lastIndex = tokenEnd;
  }
  html += esc(source.slice(lastIndex));
  return platformItemEmojiHtml(html);
}

function messageMentionsMe(message) {
  if (!message || String(message.sender_id) === String(currentUser?.id)) return false;
  const mine = String(currentUser?.id || '');
  const explicit = Array.isArray(message.mentions) && message.mentions.some(id => String(id) === mine);
  return explicit || (currentConversationData?.type === 'group' && !!message.mention_everyone);
}

function renderMessages(messages, forceBottom = false) {
  const box = $('#messages');
  if (!box) return;
  const ordered = [...(messages || [])].sort((a, b) => {
    const delta = new Date(a.created_at || 0) - new Date(b.created_at || 0);
    return delta || String(a.id || '').localeCompare(String(b.id || ''));
  });
  for(const [id,at] of xifreRecentlySent){if(Date.now()-at>60000)xifreRecentlySent.delete(id);}
  const incomingIds = new Set(ordered.map(item => String(item.id || '')).filter(Boolean));
  const existingNodes = new Map([...box.querySelectorAll('[data-message-id]')].map(node => [String(node.dataset.messageId), node]));
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const originalScrollTop = box.scrollTop;
  const boxTop = box.getBoundingClientRect().top;
  const anchor = [...existingNodes.values()].find(node => node.getBoundingClientRect().bottom > boxTop + 1);
  const anchorId = anchor?.dataset.messageId || '';
  const anchorTop = anchor?.getBoundingClientRect().top || 0;
  let changed = false;
  let addedAny = false;

  if (!ordered.length && existingNodes.size && !forceBottom) {
    // A transient empty result during a flood cannot erase an existing conversation.
    console.debug('XIFRE: ignored unexpected empty message refresh');
    return;
  }
  if (!ordered.length) {
    if (existingNodes.size || !box.querySelector('.chat-welcome')) {
      box.innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
      if (forceBottom) box.scrollTop = box.scrollHeight;
    }
    return;
  }

  for (const [id, node] of existingNodes) {
    if (!incomingIds.has(id) && !(xifreRecentlySent.has(id) && Date.now()-xifreRecentlySent.get(id)<55000)) { node.remove(); existingNodes.delete(id); changed = true; }
  }
  const welcome = box.querySelector('.chat-welcome');
  if (welcome) { welcome.remove(); changed = true; }
  const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
  for (let i = 0; i < ordered.length; i++) {
    const message = ordered[i];
    const id = String(message.id || '');
    if (!id) continue;
    const existing = existingNodes.get(id);
    if (existing) {
      // A background poll must never destroy an editor or steal focus from the user.
      if (String(editingMessageId || '') === id) continue;
      if (existing.dataset.messageSignature !== messageRenderSignature(message)) {
        const updated = renderOneMessage(message, profiles, existing);
        if (updated) existingNodes.set(id, updated);
        changed = true;
      }
      continue;
    }
    const node = renderOneMessage(message, profiles);
    if (!node) continue;
    existingNodes.set(id, node);
    const nextExisting = ordered.slice(i + 1).map(next => existingNodes.get(String(next.id || ''))).find(Boolean);
    if (nextExisting && nextExisting !== node) box.insertBefore(node, nextExisting);
    changed = true;
    addedAny = true;
  }

  if (changed) applyMessageGrouping();
  if(ordered.some(item=>PLATFORM_GIFT_RE.test(String(item.content||''))))void platformLoadChatGifts(false);
  if (forceBottom || (wasNearBottom && addedAny)) {
    box.scrollTop = box.scrollHeight;
  } else if (changed && anchorId) {
    const anchorAfter = box.querySelector(`[data-message-id="${CSS.escape(anchorId)}"]`);
    if (anchorAfter) {
      const delta = anchorAfter.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > 0.5) box.scrollTop = Math.max(0, originalScrollTop + delta);
    } else box.scrollTop = originalScrollTop;
  } else if (!changed) {
    // Stable DOM is important: polls must not blink or move text selection.
    return;
  }
}

function applyMessageGrouping() {
  const box = $('#messages');
  if (!box) return;
  const rows = [...box.children].filter(node => node.dataset?.messageId);
  let previous = null;
  for (const row of rows) {
    row.classList.remove('grouped-message');
    if (!row.classList.contains('message-row') || !row.dataset.senderId) {
      previous = null;
      continue;
    }
    const senderId = String(row.dataset.senderId || '');
    const time = Date.parse(row.dataset.createdAt || '');
    if (previous && senderId === previous.senderId && Number.isFinite(time) && Number.isFinite(previous.time)) {
      const delta = time - previous.time;
      if (delta >= 0 && delta < 60_000) row.classList.add('grouped-message');
    }
    previous = { senderId, time };
  }
}

function renderOneMessage(message, profiles = new Map(), existingNode = null) {
  const box = $('#messages');
  if (!box || !message?.id) return null;
  const id = String(message.id);
  const existing = existingNode || box.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  const signature = messageRenderSignature(message);
  if (existing && existing.dataset.messageSignature === signature) return existing;
  $('.chat-welcome', box)?.remove();
  if (message.message_type === 'system') {
    const row = document.createElement('div');
    row.className = 'system-message-row';
    row.dataset.messageId = id;
    row.dataset.senderId = String(message.sender_id || '');
    row.dataset.createdAt = String(message.created_at || '');
    row.dataset.messageSignature = signature;
    row.dataset.messageType = 'system';
    row.innerHTML = `<span>${esc(message.content || '')}</span>`;
    if (existing) existing.replaceWith(row); else box.appendChild(row);
    return row;
  }
  const mine = String(message.sender_id) === String(currentUser?.id);
  const cached = profiles.get(String(message.sender_id)) || currentMembers.find(member => getMemberId(member) === String(message.sender_id)) || {};
  const sender = {
    username: message.sender_username || cached.username || 'Usuario',
    avatar_url: message.sender_avatar_url || cached.avatar_url || null,
    avatar_color: message.sender_avatar_color || cached.avatar_color || ''
  };
  const mentioned = !mine && messageMentionsMe(message);
  const attachment = parseImageAttachmentContent(message.content);
  const bodyText = attachment ? attachment.caption : String(message.content || '');
  const imageMarkup = attachment
    ? (message.attachment_signed_url
      ? `<div class="message-image-attachment"><img src="${esc(message.attachment_signed_url)}" alt="Imagen adjunta" loading="lazy" decoding="async"></div>`
      : `<div class="message-image-attachment message-image-unavailable"><span>${message.attachment_load_error ? 'No se pudo cargar esta imagen' : 'Cargando imagen…'}</span></div>`)
    : '';
  const stamp = formatMessageTime(message.created_at);
  const exactStamp = formatExactMessageTime(message.created_at);
  const row = document.createElement('article');
  row.className = `message-row${mine ? ' mine' : ''}${mentioned ? ' mentioned' : ''}`;
  row.dataset.messageId = id;
  row.dataset.senderId = String(message.sender_id || '');
  row.dataset.createdAt = String(message.created_at || '');
  row.dataset.messageSignature = signature;
  row.innerHTML = `
    <span class="message-grouped-time" aria-hidden="true">${esc(formatTime(message.created_at))}</span>
    <span class="message-avatar">${avatarHTML(sender.username, sender.avatar_url, 'private', '', sender.avatar_color)}${presenceDotHTML(message.sender_id, 'presence-dot-message')}</span>
    <div class="message-body">
      ${message.reply_to ? `<div class="message-reply-preview" data-reply-target="${esc(message.reply_to)}"><span class="reply-line"></span><span class="reply-avatar">${avatarHTML(message.reply_sender_username || 'Usuario', message.reply_sender_avatar_url, 'private', '', message.reply_sender_avatar_color || '')}</span><div class="message-reply-copy"><strong>${esc(message.reply_sender_username || 'Usuario')}</strong><span>${esc(messagePreviewText(message.reply_content || ''))}</span></div></div>` : ''}
      <div class="message-meta"><span class="message-author">${esc(sender.username)}</span><span class="message-time" title="${esc(exactStamp)}">${esc(stamp)}</span>${message.edited_at ? '<span class="message-edited" title="Este mensaje ha sido editado">(editado)</span>' : ''}</div>
      <div class="message-content">${imageMarkup}${bodyText.trim() ? `<div class="message-caption" ${PLATFORM_GIFT_RE.test(bodyText)?`data-gift-id="${esc(bodyText.match(PLATFORM_GIFT_RE)[1])}"`:''}>${renderMessageContent(bodyText, message)}</div>` : ''}${message.edited_at ? '<span class="message-edited-inline"> (editado)</span>' : ''}</div>
      <div class="message-reactions" data-reactions-for="${esc(id)}"></div>
    </div>
    <div class="message-actions">
      <button class="message-action" type="button" data-message-action="reply" title="Responder" aria-label="Responder">↩</button>
      <button class="message-action" type="button" data-message-action="react" title="Añadir reacción" aria-label="Añadir reacción">☺</button>
      ${mine ? '<button class="message-action" type="button" data-message-action="edit" title="Editar mensaje" aria-label="Editar mensaje">✎</button>' : ''}
      <button class="message-action more" type="button" data-message-action="more" title="Más" aria-label="Más opciones">•••</button>
    </div>`;
  row.querySelector('[data-message-action="reply"]')?.addEventListener('click', event => { event.stopPropagation(); setReplyTo(message); highlightMessage(message.id); });
  row.querySelector('[data-message-action="react"]')?.addEventListener('click', event => { event.stopPropagation(); openEmojiPicker(event.currentTarget, 'reaction', id); });
  row.querySelector('[data-message-action="edit"]')?.addEventListener('click', event => { event.stopPropagation(); startEditMessage(message, row); });
  row.querySelector('[data-message-action="more"]')?.addEventListener('click', event => { event.stopPropagation(); openMessageMenu(message, event.currentTarget); });
  row.querySelector('.message-reply-preview')?.addEventListener('click', () => highlightMessage(message.reply_to));
  row.addEventListener('contextmenu', event => { event.preventDefault(); openMessageMenu(message, row); });
  if (existing) existing.replaceWith(row); else box.appendChild(row);
  return row;
}

function startEditMessage(message, row) {
  if (!message || !row || String(message.sender_id) !== String(currentUser?.id) || message.message_type === 'system') return;
  if (editingMessageId) return;
  const contentNode = $('.message-content', row);
  if (!contentNode) return;
  editingMessageId = String(message.id);
  const originalAttachment = parseImageAttachmentContent(message.content);
  const initial = originalAttachment ? originalAttachment.caption : String(message.content || '');
  const wrap = document.createElement('div');
  wrap.className = 'message-edit-wrap';
  const editor = document.createElement('textarea');
  editor.className = 'message-edit-input';
  editor.maxLength = 2000;
  editor.value = initial;
  editor.setAttribute('aria-label', 'Editar mensaje');
  const actions = document.createElement('div');
  actions.className = 'message-edit-actions';
  const hint = document.createElement('span'); hint.textContent = 'Esc para cancelar · Enter para guardar · Shift+Enter para nueva línea';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'message-edit-cancel'; cancel.textContent = 'Cancelar';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'message-edit-save'; save.textContent = 'Guardar';
  actions.append(hint, cancel, save); wrap.append(editor, actions);
  contentNode.replaceWith(wrap);
  const finishLocal = () => {
    if (String(editingMessageId) === String(message.id)) editingMessageId = null;
    // Restore the untouched original content node, including any image preview and reactions.
    if (wrap.isConnected) wrap.replaceWith(contentNode);
  };
  cancel.addEventListener('click', finishLocal);
  save.addEventListener('click', async () => {
    save.disabled = cancel.disabled = true;
    try { await saveMessageEdit(message, editor.value, row); }
    catch (error) { toast(friendlyError(error), 'error'); save.disabled = cancel.disabled = false; }
  });
  editor.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); finishLocal(); }
    else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); save.click(); }
  });
  editor.style.height = 'auto'; editor.style.height = `${Math.min(Math.max(editor.scrollHeight, 54), 180)}px`;
  editor.addEventListener('input', () => { editor.style.height = 'auto'; editor.style.height = `${Math.min(Math.max(editor.scrollHeight, 54), 180)}px`; });
  editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length);
}

async function saveMessageEdit(message, updatedContent, row) {
  const originalAttachment = parseImageAttachmentContent(message.content);
  const editedText = String(updatedContent || '').trim();
  if (!editedText && !originalAttachment) throw new Error('El mensaje no puede estar vacío.');
  const content = originalAttachment ? makeImageAttachmentContent(originalAttachment.path, editedText) : editedText;
  if (content.length > 2000) throw new Error('El mensaje editado es demasiado largo.');
  const conversationId = String(message.conversation_id || currentConversation || '');
  const derived = deriveMentions(editedText);
  const mentionedIds = new Set(derived.ids.filter(isValidUuid));
  // Responder también notifica/resalta al autor original de la respuesta.
  const replySenderId = String(message.reply_sender_id || '');
  if (isValidUuid(replySenderId) && replySenderId !== String(currentUser?.id)) mentionedIds.add(replySenderId);

  const { data, error } = await supabase.rpc('xifre_edit_message_v17', {
    p_message_id: message.id,
    p_content: content,
    p_mentions: [...mentionedIds],
    p_mention_everyone: !!derived.everyone
  });
  if (error) throw error;
  messageLoadSequences.set(conversationId, (messageLoadSequences.get(conversationId) || 0) + 1);
  editingMessageId = null;

  const updated = (Array.isArray(data) ? data[0] : data) || {};
  const patched = {
    ...message,
    ...updated,
    content,
    attachment_signed_url: message.attachment_signed_url || '',
    attachment_load_error: !!message.attachment_load_error,
    edited_at: updated.edited_at || new Date().toISOString(),
    mentions: Array.isArray(updated.mentions) ? updated.mentions : [...mentionedIds],
    mention_everyone: Object.prototype.hasOwnProperty.call(updated, 'mention_everyone') ? !!updated.mention_everyone : !!derived.everyone
  };
  if (String(currentConversation || '') === conversationId) {
    const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
    const currentRow = $(`[data-message-id="${CSS.escape(String(message.id))}"]`, $('#messages'));
    if (currentRow) renderOneMessage(patched, profiles, currentRow);
    applyMessageGrouping();
  }
  toast('Mensaje editado.', 'success');

  // The edit is already saved. A transient list/message refresh failure must not
  // leave the editor open or make the user think they need to submit it again.
  const refreshes = await Promise.allSettled([
    loadMessages(conversationId, false),
    loadConversations()
  ]);
  for (const result of refreshes) if (result.status === 'rejected') console.warn('POST-EDIT REFRESH', result.reason);
}
function highlightMessage(id){
$$('.message-row', $('#messages')).forEach(r=>r.classList.remove('reply-target'));
const row=$(`[data-message-id="${CSS.escape(String(id))}"]`,$('#messages')); if(!row)return; row.classList.add('reply-target'); row.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>row.classList.remove('reply-target'),1600);
}

function setReplyTo(message) {
replyTarget = message;
setText('replying-name', `@${message.sender_username || 'usuario'}`);
setText('replying-content', messagePreviewText(message.content || ''));
$('#reply-bar')?.classList.remove('hidden');
$('#message-input')?.focus();
}

function clearReply() {
replyTarget = null;
$('#reply-bar')?.classList.add('hidden');
setText('replying-name', '');
setText('replying-content', '');
}

function openMessageMenu(message, anchor) {
const menu = $('#message-menu');
if (!menu) return;
menuMessage = message;
$('#delete-message-menu')?.classList.toggle('hidden', String(message.sender_id) !== String(currentUser.id));
$('#edit-message-menu')?.classList.toggle('hidden', String(message.sender_id) !== String(currentUser.id) || message.message_type === 'system');
menu.classList.remove('hidden');
const rect = anchor.getBoundingClientRect();
const width = 180;
let left = rect.right - width;
let top = rect.bottom + 5;
if (left < 8) left = 8;
if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
if (top + 80 > window.innerHeight) top = rect.top - 90;
menu.style.left = `${left}px`;
menu.style.top = `${top}px`;
}

function closeMessageMenu() {
$('#message-menu')?.classList.add('hidden');
menuMessage = null;
}

async function deleteMessage(message) {
const ok = await askConfirm('Eliminar mensaje', 'Este mensaje se eliminará de la conversación.', 'Eliminar');
if (!ok) return;
const { error } = await supabase.rpc('xifre_delete_message', { p_message_id: message.id });
if (error) return toast(friendlyError(error), 'error');
closeMessageMenu();
const row = $(`[data-message-id="${CSS.escape(String(message.id))}"]`);
row?.remove();
if (!$$('.message-row', $('#messages')).length) $('#messages').innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
if (replyTarget?.id === message.id) clearReply();
await loadConversations();
toast('Mensaje eliminado.', 'success');
}

function updateMentionPicker() {
  const input = $('#message-input');
  const picker = $('#mention-picker');
  if (!input || !picker) return;
  const value = input.value;
  const position = input.selectionStart ?? value.length;
  const before = value.slice(0, position);
  const match = before.match(/(^|[^a-z0-9_])@([a-z0-9_]*)$/i);
  if (!currentConversation || !match) { picker.classList.add('hidden'); return; }
  const query = match[2].toLowerCase();
  const people = (currentMembers || []).filter(member => {
    const id = getMemberId(member);
    return id && id !== String(currentUser?.id) && isValidUuid(id) && String(member.username || '').toLowerCase().startsWith(query);
  }).slice(0, 8);
  const choices = [...people];
  if (currentConversationData?.type === 'group' && 'everyone'.startsWith(query)) {
    choices.unshift({ id: null, username: 'everyone', display_name: 'everyone', everyone: true });
  }
  picker.innerHTML = '';
  mentionPickerIndex = 0;
  if (!choices.length) { picker.classList.add('hidden'); return; }
  choices.forEach((person, index) => {
    const row = document.createElement('div');
    row.className = `mention-item${index === 0 ? ' active' : ''}${person.everyone ? ' mention-item-everyone' : ''}`;
    if (person.everyone) {
      row.innerHTML = '<span class="mention-avatar mention-everyone-avatar">@</span><span class="mention-item-copy"><strong>@everyone</strong><small>Mencionar a todos los miembros</small></span>';
    } else {
      row.innerHTML = `${avatarHTML(person.username, person.avatar_url, 'private', 'mention-avatar', person.avatar_color)}<span class="mention-item-copy"><strong>${esc(person.username)}</strong><small>@${esc(person.username)}</small></span>`;
    }
    row.addEventListener('mousedown', event => { event.preventDefault(); selectMention(person); });
    picker.appendChild(row);
  });
  picker.classList.remove('hidden');
}

function selectMention(person) {
  const input = $('#message-input');
  const value = input?.value || '';
  if (!input || !person) return;
  const everyone = person.everyone === true;
  const id = everyone ? '' : getMemberId(person);
  const username = everyone ? 'everyone' : String(person.username || '').trim();
  if (!username || (!everyone && !isValidUuid(id))) {
    $('#mention-picker')?.classList.add('hidden');
    toast('No se pudo identificar correctamente a ese miembro. Actualiza el chat e inténtalo otra vez.', 'error');
    return;
  }
  const position = input.selectionStart ?? value.length;
  const before = value.slice(0, position);
  const match = before.match(/(^|[^a-z0-9_])@([a-z0-9_]*)$/i);
  if (!match) return;
  const start = position - match[2].length - 1;
  const token = `@${username} `;
  input.value = value.slice(0, start) + token + value.slice(position);
  const cursor = start + token.length;
  input.focus(); input.setSelectionRange(cursor, cursor);
  if (everyone) mentionEverywhere = true; else currentMentionIds.add(id);
  $('#mention-picker')?.classList.add('hidden');
  resizeMessageInput(); updateSendState(); scheduleTyping();
}

function updateMessageCharacterCount() {
  const input = $('#message-input');
  const counter = $('#message-character-count');
  if (!input || !counter) return;
  const max = Number(input.maxLength) > 0 ? Number(input.maxLength) : 2000;
  const remaining = Math.max(0, max - String(input.value || '').length);
  counter.textContent = String(remaining);
  counter.classList.toggle('hidden', remaining > 20);
  counter.classList.toggle('at-zero', remaining === 0);
  counter.classList.toggle('near-limit', remaining > 0 && remaining <= 20);
  counter.setAttribute('aria-label', `Quedan ${remaining} caracteres`);
}

function updateSendState() {
  const input = $('#message-input');
  const button = $('#send-button');
  if (button) button.disabled = !currentConversation || sendInFlight || (!String(input?.value || '').trim() && !pendingChatAttachment);
  updateMessageCharacterCount();
  updateKeyboardSuggestions();
}

function deriveMentions(content) {
  const ids = new Set();
  const text = String(content || '');
  for (const member of currentMembers || []) {
    const id = getMemberId(member);
    const username = String(member.username || '').trim();
    if (!username || !id || !isValidUuid(id) || id === String(currentUser?.id)) continue;
    const expression = new RegExp(`(^|[^a-z0-9_])@${escapeRegExp(username)}(?![a-z0-9_])`, 'i');
    if (expression.test(text)) ids.add(id);
  }
  const everyone = currentConversationData?.type === 'group' && /(^|[^a-z0-9_])@everyone(?![a-z0-9_])/i.test(text);
  return { ids: [...ids], everyone };
}

async function sendMessage() {
  if (sendInFlight || !currentUser || !currentConversation) return;
  const input = $('#message-input');
  const rawDraft = String(input?.value || '');
  const textContent = rawDraft.trim();
  const sendingAttachment = pendingChatAttachment;
  const attachmentGeneration = pendingChatAttachmentGeneration;
  if (!textContent && !sendingAttachment) return;
  const sendNow=Date.now();
  while(xifreSendTimes.length && sendNow-xifreSendTimes[0]>10000)xifreSendTimes.shift();
  if((xifreSendTimes.length && sendNow-xifreSendTimes.at(-1)<850) || xifreSendTimes.length>=6){
    toast('Estás enviando mensajes demasiado rápido. Espera un momento, vas a romper el teclado.','info');
    return;
  }
  if (sendingAttachment && textContent.length > CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT) {
    toast(`El texto con imagen no puede superar ${CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT} caracteres.`, 'error');
    return;
  }
  if (!sendingAttachment && textContent.length > CHAT_MESSAGE_MAX_CHARS) {
    toast(`El mensaje no puede superar ${CHAT_MESSAGE_MAX_CHARS} caracteres.`, 'error');
    return;
  }
  const conversationId = String(currentConversation);
  const sendingReply = replyTarget;
  const button = $('#send-button');
  let persisted = false;
  let uploadedPath = '';
  // Capture the current chat's mentions before awaiting Storage; the user may click another chat meanwhile.
  const derived = deriveMentions(textContent);
  const safeMentions = new Set(derived.ids.filter(isValidUuid));
  const replySenderId = String(sendingReply?.sender_id || '');
  if (isValidUuid(replySenderId) && replySenderId !== String(currentUser.id)) safeMentions.add(replySenderId);
  sendInFlight = true;
  if (button) button.disabled = true;
  $('#composer-plus-button')?.setAttribute('disabled', 'disabled');
  try {
    let contentToPersist = textContent;
    // Upload privately first; only the object path (never a public URL) is stored in messages.
    if (sendingAttachment) {
      const path = `${currentUser.id}/${conversationId}/${createChatFileId()}.${chatAttachmentExtension(sendingAttachment)}`;
      const imageMarkerLength = makeImageAttachmentContent(path, '').length;
      if (textContent.length + imageMarkerLength + (textContent ? 1 : 0) > CHAT_MESSAGE_MAX_CHARS) {
        throw new Error('El texto es demasiado largo para adjuntarlo a esta imagen.');
      }
      uploadedPath = path;
      const { error: uploadError } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, sendingAttachment, {
        upsert: false,
        cacheControl: '3600',
        contentType: sendingAttachment.type,
        metadata: { originalName: String(sendingAttachment.name || `imagen.${chatAttachmentExtension(sendingAttachment)}`).slice(0, 180) }
      });
      if (uploadError) throw uploadError;
      contentToPersist = makeImageAttachmentContent(path, textContent);
    }
    const { data, error } = await supabase.rpc('xifre_send_message', {
      p_conversation_id: conversationId,
      p_content: contentToPersist,
      p_reply_to: sendingReply?.id || null,
      p_mentions: [...safeMentions],
      p_mention_everyone: !!derived.everyone
    });
    if (error) throw error;
    persisted = true;
    xifreSendTimes.push(Date.now());
    messageLoadSequences.set(conversationId, (messageLoadSequences.get(conversationId) || 0) + 1);
    const sent = Array.isArray(data) ? data[0] : data;
    if (uploadedPath && sent) {
      try { sent.attachment_signed_url = await getSignedChatMediaUrl(uploadedPath); sent.attachment_load_error = false; }
      catch (error) { sent.attachment_signed_url = ''; sent.attachment_load_error = true; console.warn('NEW IMAGE SIGN URL', error); }
    }
    if (String(currentConversation) !== conversationId) {
      if (pendingChatAttachment === sendingAttachment && sendingAttachment) clearPendingChatAttachment(false);
      toast('El mensaje se ha enviado en la conversación anterior.', 'success');
      return;
    }

    if (input && input.value === rawDraft) {
      input.value = '';
      resizeMessageInput();
      if (replyTarget === sendingReply) clearReply();
      currentMentionIds.clear(); mentionEverywhere = false;
      $('#mention-picker')?.classList.add('hidden');
      stopTypingBroadcast();
    }
    if (sendingAttachment && pendingChatAttachment === sendingAttachment && pendingChatAttachmentGeneration === attachmentGeneration) {
      clearPendingChatAttachment(false);
    }
    if (sent?.id) {
      xifreRecentlySent.set(String(sent.id),Date.now());
      if (sendingReply) {
        sent.reply_sender_id = sent.reply_sender_id || sendingReply.sender_id;
        sent.reply_sender_username = sent.reply_sender_username || sendingReply.sender_username;
        sent.reply_sender_avatar_url = sent.reply_sender_avatar_url || sendingReply.sender_avatar_url;
        sent.reply_content = sent.reply_content || sendingReply.content;
      }
      const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
      renderOneMessage(sent, profiles);
      applyMessageGrouping();
    }
    const box = $('#messages');
    if (box) box.scrollTop = box.scrollHeight;
    if (textContent) recordComposerWordUsage(textContent);

    // A list/read-state refresh must never make an already-sent message appear unsent.
    const refreshes = await Promise.allSettled([
      loadConversations(),
      supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId })
    ]);
    for (const result of refreshes) if (result.status === 'rejected' || result.value?.error) console.warn('POST-SEND REFRESH', result.reason || result.value?.error);
  } catch (error) {
    if (uploadedPath && !persisted) {
      try { await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([uploadedPath]); }
      catch (cleanupError) { console.warn('ORPHAN IMAGE CLEANUP', cleanupError); }
    }
    if (persisted) {
      console.warn('MESSAGE SENT; UI RECOVERY', error);
      toast('El mensaje se ha enviado, pero no se ha actualizado la vista. No hace falta reenviarlo.', 'info');
      if (String(currentConversation) === conversationId) void loadMessages(conversationId, false).catch(refreshError => console.warn('MESSAGE RECOVERY', refreshError));
    } else {
      toast(friendlyError(error), 'error');
    }
  } finally {
    sendInFlight = false;
    $('#composer-plus-button')?.removeAttribute('disabled');
    updateSendState();
    if (input?.isConnected && currentConversation) input.focus({ preventScroll: true });
  }
}
/* ------------------------------------------------------------------------ */
/* Emoji picker and message reactions */
/* ------------------------------------------------------------------------ */
function closeEmojiPicker() {
  $('#emoji-picker-popover')?.classList.add('hidden');
  $('#composer-emoji-button')?.setAttribute('aria-expanded', 'false');
  emojiPickerMessageId = null;
}

function openEmojiPicker(anchor, mode = 'compose', messageId = null) {
  const popover = $('#emoji-picker-popover');
  const grid = $('#emoji-grid');
  if (!popover || !grid || !anchor) return;
  emojiPickerMode = mode;
  if(mode==='reaction' && activeEmojiCategory==='xifre-items')activeEmojiCategory='smileys';
  emojiPickerMessageId = messageId ? String(messageId) : null;
  const search = $('#emoji-search');
  if (search) search.value = '';
  popover.classList.remove('hidden');
  $('#composer-emoji-button')?.setAttribute('aria-expanded', mode === 'compose' ? 'true' : 'false');
  renderEmojiCategories();
  renderEmojiGrid('');
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  const height = Math.min(460, window.innerHeight - 24);
  let left = rect.right - width;
  let top = rect.top - height - 8;
  if (left < 12) left = 12;
  if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
  if (top < 12) top = rect.bottom + 8;
  if (top + height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - height - 12);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.width = `${width}px`;
  popover.style.height = `${height}px`;
  if (search) search.focus({ preventScroll: true });
}

function resizeMessageInput() {
  const input = $('#message-input');
  if (!input || input.tagName !== 'TEXTAREA') return;
  input.style.height = 'auto';
  const maxHeight = 128;
  const nextHeight = Math.min(Math.max(input.scrollHeight, 28), maxHeight);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function insertEmojiAtCursor(emoji) {
  const input = $('#message-input');
  if (!input || input.disabled || !emoji) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  const cursor = start + emoji.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  resizeMessageInput();
  updateMentionPicker();
  updateSendState();
  scheduleTyping();
}

function makeEmojiItems(source) {
  return source.split(',').map(item => {
    const [emoji, name = 'emoji'] = item.trim().split('|');
    return { emoji, name };
  }).filter(item => item.emoji);
}

// Built-in catalog: no external JSON, CDN fetch or IndexedDB dependency.
const EMOJI_CATEGORIES = [
  { id:'smileys', label:'Caras', icon:'😀', items: makeEmojiItems('😀|cara feliz,😃|sonrisa grande,😄|sonrisa ojos cerrados,😁|sonrisa dientes,😆|reír,😅|risa nerviosa,😂|llorar de risa,🤣|rodar de risa,🥲|sonrisa emocionada,😊|sonrisa tímida,😇|inocente,🙂|sonrisa,🙃|cara al revés,😉|guiño,😌|aliviado,😍|enamorado,🥰|sonrisas con corazones,😘|beso,😗|beso,😋|delicioso,😛|lengua,😜|guiño lengua,🤪|loco,😝|lengua ojos cerrados,🤑|dinero,🤗|abrazo,🤭|mano en la boca,🫢|sorpresa mano,🫣|mirar entre dedos,🤫|silencio,🤔|pensando,🫡|saludo,🤐|boca cerrada,🤨|ceja levantada,😐|neutral,😑|sin expresión,😶|sin boca,🫥|línea de puntos,😏|sonrisa pícara,😒|molesto,🙄|ojos en blanco,😬|mueca,🤥|mentiroso,😔|triste,😪|somnoliento,🤤|babear,😴|dormido,😷|mascarilla,🤒|enfermo,🤕|herido,🤢|asco,🤮|vomitar,🥵|calor,🥶|frío,🥴|mareado,😵|mareado,🤯|cabeza explotando,🥳|fiesta,🥸|disfraz,😎|gafas de sol,🤓|empollón,🧐|investigar,😕|confundido,🫤|escéptico,😟|preocupado,🙁|triste,☹️|cara triste,😮|boca abierta,😯|sorprendido,😲|asombrado,😳|avergonzado,🥺|suplicar,🥹|emocionado,😦|angustiado,😧|angustia,😨|asustado,😰|sudor frío,😥|aliviado triste,😢|llorar,😭|llorar mucho,😱|gritar,😖|frustrado,😣|sufrir,😞|decepcionado,😓|sudando,😩|cansado,😫|agotado,🥱|bostezo,😤|resoplar,😡|enfadado,😠|enojado,🤬|insulto,😈|diablillo,👿|diablo,💀|calavera,☠️|calavera huesos,💩|caca,🤡|payaso,👻|fantasma,👽|alien,🤖|robot,🎃|calabaza,😺|gato feliz,😸|gato sonrisa,😹|gato risa,😻|gato enamorado,🙀|gato asustado,😿|gato llorando,😾|gato enfadado,💯|cien puntos,💥|explosión,💫|mareo,💦|gotas,💨|viento,💤|dormir') },
  { id:'people', label:'Personas', icon:'👋', items: makeEmojiItems('👋|saludar,🤚|mano levantada,🖐️|mano abierta,✋|alto,🖖|vulcano,🫱|mano derecha,🫲|mano izquierda,🫳|palma abajo,🫴|palma arriba,👌|ok,🤌|dedos juntos,🤏|pequeño,✌️|victoria,🤞|suerte,🫰|corazón dedos,🤟|te quiero,🤘|rock,🤙|llámame,👈|izquierda,👉|derecha,👆|arriba,👇|abajo,☝️|índice arriba,👍|pulgar arriba,👎|pulgar abajo,✊|puño,👊|puñetazo,🤛|puño izquierda,🤜|puño derecha,👏|aplaudir,🙌|manos arriba,🫶|corazón manos,🤝|apretón manos,🙏|rezar gracias,✍️|escribir,💅|pintar uñas,💪|fuerza,🦾|brazo mecánico,🦿|pierna mecánica,🦵|pierna,🦶|pie,👂|oreja,🦻|audífono,👃|nariz,🧠|cerebro,🫀|corazón anatómico,🫁|pulmones,🦷|diente,🦴|hueso,👀|ojos,👁️|ojo,👅|lengua,👄|boca,💋|beso marca,🩸|sangre,👶|bebé,🧒|niño,👦|chico,👧|chica,🧑|persona,👨|hombre,👩|mujer,🧔|barba,👴|anciano,👵|anciana,🙍|persona enfadada,🙋|levantar mano,🙆|ok persona,🙅|no persona,💁|información,🙇|reverencia,🤦|facepalm,🤷|encogerse de hombros,🧏|persona sorda,🧑‍💻|tecnólogo,👨‍🎓|estudiante,👩‍🎓|estudiante mujer,🧑‍🚀|astronauta,🧑‍🎨|artista') },
  { id:'animals', label:'Animales', icon:'🐻', items: makeEmojiItems('🐶|perro,🐱|gato,🐭|ratón,🐹|hámster,🐰|conejo,🦊|zorro,🐻|oso,🐼|panda,🐨|koala,🐯|tigre,🦁|león,🐮|vaca,🐷|cerdo,🐸|rana,🐵|mono,🙈|mono no ver,🙉|mono no oír,🙊|mono no hablar,🐒|mono,🐔|gallina,🐧|pingüino,🐦|pájaro,🐤|pollito,🦆|pato,🦅|águila,🦉|búho,🦇|murciélago,🐺|lobo,🐗|jabalí,🐴|caballo,🦄|unicornio,🐝|abeja,🪱|gusano,🦋|mariposa,🐌|caracol,🐞|mariquita,🐜|hormiga,🪰|mosca,🦟|mosquito,🪳|cucaracha,🕷️|araña,🦂|escorpión,🐢|tortuga,🐍|serpiente,🦎|lagarto,🦖|tirano saurio,🦕|dinosaurio,🐙|pulpo,🦑|calamar,🦐|gamba,🦞|langosta,🦀|cangrejo,🐡|pez globo,🐠|pez tropical,🐟|pez,🐬|delfín,🐳|ballena,🦈|tiburón,🐊|cocodrilo,🐅|tigre,🐆|leopardo,🦓|cebra,🦍|gorila,🦧|orangután,🦣|mamut,🐘|elefante,🦛|hipopótamo,🦏|rinoceronte,🐪|camello,🦒|jirafa,🦘|canguro,🦬|bisonte,🐃|búfalo,🐂|buey,🐄|vaca,🐎|caballo carreras,🐖|cerdo,🐏|carnero,🐑|oveja,🦙|llama,🐐|cabra,🦌|ciervo,🐕|perro,🐩|caniche,🦮|perro guía,🐈|gato,🪶|pluma,🦚|pavo real,🦜|loro,🦢|cisne,🦩|flamenco,🕊️|paloma,🐇|liebre,🦝|mapache,🦨|mofeta,🦡|tejón,🦦|nutria,🦥|perezoso,🐁|ratón,🐿️|ardilla,🦔|erizo,🌵|cactus,🌲|árbol,🌳|árbol frondoso,🌴|palmera,🌱|brote,🌿|hierba,☘️|trébol,🍀|trébol suerte,🍁|hoja otoño,🍂|hojas caídas,🍃|hoja al viento,🌷|tulipán,🌹|rosa,🌺|hibisco,🌸|flor cerezo,🌼|flor,🌻|girasol,🌞|sol cara,🌝|luna cara,🌚|luna oscura,🌈|arcoíris,☀️|sol,⛅|nubes y sol,🌧️|lluvia,⛈️|tormenta,❄️|nieve,🔥|fuego,💧|gota agua,🌊|ola') },
  { id:'food', label:'Comida', icon:'🍕', items: makeEmojiItems('🍏|manzana verde,🍎|manzana,🍐|pera,🍊|mandarina,🍋|limón,🍌|plátano,🍉|sandía,🍇|uvas,🍓|fresa,🫐|arándanos,🍈|melón,🍒|cerezas,🍑|melocotón,🥭|mango,🍍|piña,🥥|coco,🥝|kiwi,🍅|tomate,🍆|berenjena,🥑|aguacate,🥦|brócoli,🥬|lechuga,🥒|pepino,🌶️|chile,🫑|pimiento,🌽|maíz,🥕|zanahoria,🫒|aceituna,🧄|ajo,🧅|cebolla,🥔|patata,🍠|boniato,🥐|croissant,🥯|bagel,🍞|pan,🥖|barra pan,🥨|pretzel,🧀|queso,🥚|huevo,🍳|huevo frito,🧈|mantequilla,🥞|tortitas,🧇|gofre,🥓|bacon,🥩|carne,🍗|pollo,🍖|carne hueso,🌭|perrito caliente,🍔|hamburguesa,🍟|patatas fritas,🍕|pizza,🫓|pan plano,🥪|bocadillo,🥙|falafel,🧆|falafel,🌮|taco,🌯|burrito,🫔|tamal,🥗|ensalada,🥘|paella,🫕|fondue,🥫|conserva,🍝|espaguetis,🍜|ramen,🍲|sopa,🍛|curry,🍣|sushi,🍱|bento,🥟|dumplings,🦪|ostra,🍤|gamba frita,🍙|onigiri,🍚|arroz,🍘|galleta arroz,🍥|pastel pescado,🥠|galleta fortuna,🥮|pastel luna,🍢|brocheta,🍡|dango,🍧|hielo raspado,🍨|helado,🍦|helado cono,🥧|tarta,🧁|cupcake,🍰|pastel,🎂|cumpleaños,🍮|flan,🍭|piruleta,🍬|caramelo,🍫|chocolate,🍿|palomitas,🍩|donut,🍪|galleta,🌰|castaña,🥜|cacahuetes,🍯|miel,🥛|leche,🍼|biberón,☕|café,🫖|tetera,🍵|té,🧃|zumo,🥤|refresco,🧋|bubble tea,🍶|sake,🍺|cerveza,🍻|brindis cervezas,🥂|brindis copas,🍷|vino,🥃|whisky,🍸|cóctel,🍹|bebida tropical,🧉|mate,🍾|champán,🧊|hielo') },
  { id:'activity', label:'Actividades', icon:'⚽', items: makeEmojiItems('⚽|fútbol,🏀|baloncesto,🏈|fútbol americano,⚾|béisbol,🥎|softbol,🎾|tenis,🏐|voleibol,🏉|rugby,🥏|disco,🎱|bola ocho,🪀|yoyó,🏓|ping pong,🏸|bádminton,🏒|hockey,🏑|hockey hierba,🥍|lacrosse,🏏|críquet,🪃|bumerán,🥅|portería,⛳|golf,🪁|cometa,🏹|arco,🎣|pesca,🤿|buceo,🥊|boxeo,🥋|artes marciales,🎽|camiseta deportiva,🛹|monopatín,🛼|patines,🛷|trineo,⛸️|patinaje,🥌|curling,🎿|esquí,⛷️|esquiador,🏂|snowboard,🪂|paracaídas,🏋️|pesas,🤼|lucha,🤸|gimnasia,⛹️|baloncesto persona,🤺|esgrima,🤾|balonmano,🏌️|golfista,🏇|carreras caballos,🧘|meditación,🏄|surf,🏊|natación,🤽|waterpolo,🚣|remo,🧗|escalada,🚵|bicicleta montaña,🚴|ciclismo,🏆|trofeo,🥇|medalla oro,🥈|medalla plata,🥉|medalla bronce,🏅|medalla,🎖️|condecoración,🏵️|roseta,🎗️|lazo,🎫|entrada,🎟️|ticket,🎪|circo,🤹|malabares,🎭|teatro,🩰|ballet,🎨|arte,🎬|cine,🎤|micrófono,🎧|auriculares,🎼|partitura,🎹|piano,🥁|tambor,🪘|percusión,🎷|saxofón,🎺|trompeta,🪗|acordeón,🎸|guitarra,🪕|banjo,🎻|violín,🪈|flauta,🎲|dado,♟️|ajedrez,🎯|diana,🎳|bolos,🎮|videojuegos,🕹️|joystick,🧩|puzzle,🪅|piñata,🪩|bola disco,🎰|tragaperras') },
  { id:'travel', label:'Lugares', icon:'🚀', items: makeEmojiItems('🚗|coche,🚕|taxi,🚙|todoterreno,🚌|autobús,🚎|trolebús,🏎️|coche carreras,🚓|policía,🚑|ambulancia,🚒|bomberos,🚐|furgoneta,🛻|pickup,🚚|camión,🚛|tráiler,🚜|tractor,🛵|scooter,🏍️|moto,🛺|rickshaw,🚲|bicicleta,🛴|patinete,🛹|monopatín,🛼|patines,🚨|sirena,🚔|coche policía,🚍|bus acercándose,🚘|coche frontal,🚖|taxi frontal,🚡|teleférico,🚠|funicular,🚟|tren suspendido,🚃|vagón,🚋|tranvía,🚞|tren montaña,🚝|monorraíl,🚄|tren rápido,🚅|tren bala,🚈|metro ligero,🚇|metro,🚊|tranvía,🚉|estación,✈️|avión,🛫|despegue,🛬|aterrizaje,🛩️|avioneta,💺|asiento,🚁|helicóptero,🛸|ovni,🚀|cohete,🛰️|satélite,🛶|canoa,⛵|velero,🚤|lancha,🛥️|barco,🛳️|crucero,⛴️|ferry,🚢|barco,⚓|ancla,🛟|salvavidas,🗺️|mapa,🗿|moái,🗽|estatua libertad,🗼|torre Tokio,🏰|castillo,🏯|castillo japonés,🏟️|estadio,🎡|noria,🎢|montaña rusa,🎠|carrusel,⛲|fuente,⛱️|sombrilla,🏖️|playa,🏝️|isla,🏜️|desierto,🌋|volcán,⛰️|montaña,🏔️|montaña nevada,🗻|monte Fuji,🏕️|camping,⛺|tienda campaña,🛖|cabaña,🏠|casa,🏡|casa jardín,🏢|oficina,🏬|centro comercial,🏣|oficina postal,🏥|hospital,🏦|banco,🏨|hotel,🏪|tienda,🏫|escuela,🏛️|edificio clásico,⛪|iglesia,🕌|mezquita,🛕|templo,🕍|sinagoga,🕋|kaaba,⛩️|santuario,🌃|noche ciudad,🌆|atardecer ciudad,🌇|puesta de sol,🌉|puente noche,🎑|luna cosecha,🌌|vía láctea,🌠|estrella fugaz') },
  { id:'objects', label:'Objetos', icon:'💡', items: makeEmojiItems('⌚|reloj,📱|móvil,📲|móvil flecha,💻|portátil,🖥️|ordenador,🖨️|impresora,⌨️|teclado,🖱️|ratón ordenador,🖲️|trackball,💽|disco,💾|disquete,💿|cd,📀|dvd,📼|videocinta,📷|cámara,📸|flash cámara,📹|videocámara,🎥|cine cámara,📽️|proyector,📺|televisión,📻|radio,🎙️|micrófono estudio,🎚️|controles audio,🎛️|perillas,🧭|brújula,⏱️|cronómetro,⏰|despertador,⌛|reloj arena,⏳|arena corriendo,🔋|batería,🪫|batería baja,🔌|enchufe,💡|bombilla,🔦|linterna,🕯️|vela,🪔|lámpara,🧯|extintor,🛢️|barril,💸|dinero volando,💵|billetes,💴|yen,💶|euro,💷|libra,💰|saco dinero,💳|tarjeta,🪙|moneda,💎|diamante,⚖️|balanza,🪜|escalera,🧰|caja herramientas,🪛|destornillador,🔧|llave inglesa,🔨|martillo,⚒️|herramientas,🛠️|martillo llave,⛏️|pico,🪚|sierra,🔩|tornillo tuerca,⚙️|engranaje,🪤|trampa,🧱|ladrillo,🪨|piedra,🪵|madera,🧲|imán,🪝|gancho,🧪|tubo ensayo,🧫|placa Petri,🧬|ADN,🔬|microscopio,🔭|telescopio,📡|antena,💊|pastilla,🩹|tirita,🩺|estetoscopio,🚪|puerta,🪞|espejo,🪟|ventana,🛏️|cama,🛋️|sofá,🪑|silla,🚽|inodoro,🚿|ducha,🛁|bañera,🧴|loción,🧷|imperdible,🧹|escoba,🧺|cesta ropa,🧻|papel,🪣|cubo,🧼|jabón,🪥|cepillo dientes,🧽|esponja,🧯|extintor,🧸|oso peluche,🪆|muñecas,🖼️|cuadro,🎁|regalo,🎈|globo,🎀|lazo,🪄|varita mágica,🪅|piñata,🪩|bola disco,🧿|ojo turco,🪬|hamsa,🗝️|llave antigua,🔑|llave,🔒|candado,🔓|candado abierto,🔏|candado con pluma,🧳|maleta,🎒|mochila,👓|gafas,🕶️|gafas sol,🥽|gafas protección,🥼|bata,🦺|chaleco,👔|corbata,👕|camiseta,👖|vaqueros,🧣|bufanda,🧤|guantes,🧥|abrigo,🧦|calcetines,👗|vestido,👘|kimono,🥻|sari,🩱|bañador,🩳|pantalón corto,👙|bikini,👚|blusa,👛|monedero,👜|bolso,👝|bolsito,🛍️|bolsas compras,👞|zapato,👟|zapatilla,🥾|bota senderismo,🥿|bailarina,👠|tacón,👡|sandalia,🩴|chancla,👢|bota,👑|corona,👒|sombrero mujer,🎩|sombrero copa,🧢|gorra,🪖|casco,⛑️|casco rescate') },
  { id:'symbols', label:'Símbolos', icon:'❤️', items: makeEmojiItems('❤️|corazón rojo,🩷|corazón rosa,🧡|corazón naranja,💛|corazón amarillo,💚|corazón verde,💙|corazón azul,🩵|corazón celeste,💜|corazón morado,🤎|corazón marrón,🖤|corazón negro,🩶|corazón gris,🤍|corazón blanco,💔|corazón roto,❤️‍🔥|corazón en llamas,❤️‍🩹|corazón curando,💕|dos corazones,💞|corazones girando,💓|latido,💗|creciendo,💖|brillante,💘|flecha corazón,💝|corazón regalo,💟|decoración corazón,❣️|exclamación corazón,💌|carta amor,💋|beso,💐|ramo,💍|anillo,💎|diamante,✨|destellos,⭐|estrella,🌟|estrella brillante,💫|mareo,🔥|fuego,💥|explosión,⚡|rayo,☄️|cometa,🌈|arcoíris,☀️|sol,🌙|luna,☁️|nube,❄️|copo nieve,☃️|muñeco nieve,💧|gota,🌊|ola,🎉|confeti,🎊|bola confeti,🎇|chispa,🎆|fuegos artificiales,🧨|petardo,🎀|lazo,🎁|regalo,✅|correcto,☑️|casilla marcada,✔️|marca,❌|cruz,❎|cruz verde,➕|más,➖|menos,➗|dividir,✖️|multiplicar,⚠️|advertencia,🚫|prohibido,⛔|entrada prohibida,🛑|stop,❗|exclamación,❓|pregunta,‼️|doble exclamación,⁉️|exclamación pregunta,💤|dormir,💬|bocadillo,🗨️|burbuja,🗯️|enfadado burbuja,💭|pensar,🔔|campana,🔕|campana silenciada,🎵|nota musical,🎶|notas musicales,🔒|candado,🔑|llave,🔗|enlace,🧡|naranja corazón,♻️|reciclaje,⚜️|flor de lis,🔱|tridente,📛|identificación,🔰|principiante,⭕|círculo,🔴|círculo rojo,🟠|círculo naranja,🟡|círculo amarillo,🟢|círculo verde,🔵|círculo azul,🟣|círculo morado,⚫|círculo negro,⚪|círculo blanco,🟤|círculo marrón,🟥|cuadrado rojo,🟧|cuadrado naranja,🟨|cuadrado amarillo,🟩|cuadrado verde,🟦|cuadrado azul,🟪|cuadrado morado,⬛|cuadrado negro,⬜|cuadrado blanco,🔶|rombo naranja,🔷|rombo azul,🔸|rombo pequeño naranja,🔹|rombo pequeño azul,🔺|triángulo rojo,🔻|triángulo hacia abajo,💠|rombo con punto,♠️|picas,♥️|corazones naipe,♦️|diamantes naipe,♣️|tréboles naipe,🃏|comodín,🔣|símbolos,🔤|letras,🔠|mayúsculas,🔡|minúsculas,🔢|números,♈|aries,♉|tauro,♊|géminis,♋|cáncer,♌|leo,♍|virgo,♎|libra,♏|escorpio,♐|sagitario,♑|capricornio,♒|acuario,♓|piscis,⛎|ofiuco') },
  { id:'flags', label:'Banderas', icon:'🏳️', items: makeEmojiItems('🏳️|bandera blanca,🏴|bandera negra,🏁|bandera a cuadros,🚩|bandera roja,🏳️‍🌈|bandera arcoíris,🏳️‍⚧️|bandera trans,🇪🇸|España,🇦🇩|Andorra,🇫🇷|Francia,🇵🇹|Portugal,🇮🇹|Italia,🇩🇪|Alemania,🇬🇧|Reino Unido,🇺🇸|Estados Unidos,🇨🇦|Canadá,🇲🇽|México,🇧🇷|Brasil,🇦🇷|Argentina,🇨🇱|Chile,🇨🇴|Colombia,🇵🇪|Perú,🇺🇾|Uruguay,🇯🇵|Japón,🇨🇳|China,🇰🇷|Corea del Sur,🇮🇳|India,🇦🇺|Australia,🇳🇿|Nueva Zelanda,🇳🇱|Países Bajos,🇧🇪|Bélgica,🇨🇭|Suiza,🇦🇹|Austria,🇸🇪|Suecia,🇳🇴|Noruega,🇩🇰|Dinamarca,🇫🇮|Finlandia,🇮🇪|Irlanda,🇵🇱|Polonia,🇺🇦|Ucrania,🇬🇷|Grecia,🇹🇷|Turquía,🇷🇺|Rusia,🇮🇱|Israel,🇸🇦|Arabia Saudí,🇿🇦|Sudáfrica,🇪🇬|Egipto,🇲🇦|Marruecos,🇳🇬|Nigeria,🇰🇪|Kenia,🇹🇭|Tailandia,🇻🇳|Vietnam,🇮🇩|Indonesia,🇵🇭|Filipinas,🇸🇬|Singapur,🇲🇾|Malasia,🇵🇰|Pakistán,🇧🇩|Bangladesh') }
];

let activeEmojiCategory = 'smileys';
function getRecentEmojis() {
  try { const value = JSON.parse(localStorage.getItem('xifre_recent_emojis') || '[]'); return Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 24) : []; }
  catch (_) { return []; }
}
function rememberEmoji(emoji) {
  try { localStorage.setItem('xifre_recent_emojis', JSON.stringify([emoji, ...getRecentEmojis().filter(item => item !== emoji)].slice(0, 24))); }
  catch (_) {}
}
function renderEmojiCategories() {
  const bar = $('#emoji-categories');
  if (!bar) return;
  bar.innerHTML = '';
  const categories = [{ id:'recent', label:'Recientes', icon:'🕘' }, ...EMOJI_CATEGORIES.map(({id,label,icon})=>({id,label,icon})),...(emojiPickerMode==='compose'?[{id:'xifre-items',label:'Objetos XIFRE',icon:'🎴'}]:[])];
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `emoji-category${activeEmojiCategory === category.id ? ' active' : ''}`;
    button.dataset.emojiCategory = category.id; button.textContent = category.icon; button.title = category.label;
    button.setAttribute('aria-label', category.label); button.setAttribute('aria-pressed', activeEmojiCategory === category.id ? 'true' : 'false');
    bar.appendChild(button);
  }
}
function renderEmojiGrid(query = '') {
  const grid = $('#emoji-grid');
  if (!grid) return;
  const normalizeSearch = value => String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const term = normalizeSearch(String(query || '').trim());
  let entries = [];
  if(activeEmojiCategory==='xifre-items' && emojiPickerMode==='compose') {
    const items=[...platformEmojiCodes.values()].filter(item=>platformOwnedItemTypes.has(String(item.id)));
    const filtered=term?items.filter(item=>normalizeSearch(item.name).includes(term)||normalizeSearch(item.emoji_shortcode).includes(term)):items;
    grid.innerHTML=filtered.map(item=>`<button type="button" class="emoji-choice xifre-item-emoji-choice" data-xifre-item-emoji="${esc(item.emoji_shortcode)}" title="${esc(item.name)}"><img src="${esc(item.image_url)}" alt="${esc(item.name)}"><small>${esc(item.name)}</small></button>`).join('') || '<div class="emoji-grid-empty">No tienes objetos configurados como emojis.</div>';
    return;
  }
  if (term) {
    entries = EMOJI_CATEGORIES.flatMap(category => category.items.map(item => ({...item, category:category.label})))
      .filter(item => item.emoji.includes(term) || normalizeSearch(item.name).includes(term));
  } else if (activeEmojiCategory === 'recent') {
    const names = new Map(EMOJI_CATEGORIES.flatMap(category => category.items.map(item => [item.emoji, item.name])));
    entries = getRecentEmojis().map(emoji => ({ emoji, name:names.get(emoji) || 'reciente' }));
  } else {
    entries = (EMOJI_CATEGORIES.find(category => category.id === activeEmojiCategory) || EMOJI_CATEGORIES[0]).items;
  }
  grid.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'emoji-grid-empty';
    empty.textContent = term ? 'No se han encontrado emojis.' : 'Todavía no hay emojis recientes.'; grid.appendChild(empty); return;
  }
  for (const item of entries) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'emoji-choice'; button.dataset.emoji = item.emoji;
    button.textContent = item.emoji; button.title = item.name || 'Emoji'; button.setAttribute('role','option'); button.setAttribute('aria-label',`${item.emoji} ${item.name || 'emoji'}`);
    grid.appendChild(button);
  }
}
function chooseEmoji(emoji) {
  const cleanEmoji = String(emoji || '');
  if (!cleanEmoji) return;
  rememberEmoji(cleanEmoji);
  const mode = emojiPickerMode;
  const messageId = emojiPickerMessageId;
  closeEmojiPicker();
  if (mode === 'reaction') {
    if (messageId) void toggleMessageReaction(messageId, cleanEmoji);
  } else {
    insertEmojiAtCursor(cleanEmoji);
  }
}
function setupEmojiPicker() {
  const popover = $('#emoji-picker-popover');
  const grid = $('#emoji-grid');
  const bar = $('#emoji-categories');
  const search = $('#emoji-search');
  if (!popover || !grid || !bar || popover.dataset.xifreBound === 'true') return;
  popover.dataset.xifreBound = 'true';
  renderEmojiCategories();
  renderEmojiGrid('');
  search?.addEventListener('input', () => renderEmojiGrid(search.value));
  bar.addEventListener('click', event => {
    const button = event.target.closest('[data-emoji-category]');
    if (!button) return;
    activeEmojiCategory = button.dataset.emojiCategory || 'smileys';
    if (search) search.value = '';
    renderEmojiCategories(); renderEmojiGrid('');
  });
  grid.addEventListener('click', event => {
    const custom=event.target.closest('[data-xifre-item-emoji]');
    if(custom){insertEmojiAtCursor(`:xi_${custom.dataset.xifreItemEmoji}:`);closeEmojiPicker();return;}
    const button = event.target.closest('[data-emoji]');
    if (button) chooseEmoji(button.dataset.emoji);
  });
}

function renderMessageReactions(messageRow, reactionRows) {
  const container = $('.message-reactions', messageRow);
  if (!container) return false;
  const emojiMap = new Map();
  for (const reaction of reactionRows || []) {
    const emoji = String(reaction.emoji || '');
    const uid = String(reaction.user_id || '');
    if (!emoji) continue;
    if (!emojiMap.has(emoji)) emojiMap.set(emoji, { emoji, users: new Set() });
    if (uid) emojiMap.get(emoji).users.add(uid);
  }
  const groups = [...emojiMap.values()].sort((a,b) => a.emoji.localeCompare(b.emoji));
  const signature = groups.map(group => `${group.emoji}:${group.users.size}:${group.users.has(String(currentUser?.id)) ? 1 : 0}`).join('|');
  if (container.dataset.reactionSignature === signature) return false;
  if (container.dataset.reactionSignature === undefined && groups.length === 0) {
    container.dataset.reactionSignature = '';
    return false;
  }
  container.dataset.reactionSignature = signature;
  container.innerHTML = '';
  groups.forEach(group => {
    const button = document.createElement('button');
    const mine = group.users.has(String(currentUser?.id));
    button.type = 'button';
    button.className = `message-reaction${mine ? ' active' : ''}`;
    button.dataset.emoji = group.emoji;
    button.title = `${group.users.size} reacción${group.users.size === 1 ? '' : 'es'} · ${mine ? 'Quitar tu reacción' : 'Reaccionar'}`;
    button.setAttribute('aria-label', button.title);
    const face = document.createElement('span'); face.textContent = group.emoji;
    const count = document.createElement('span'); count.className = 'message-reaction-count'; count.textContent = String(group.users.size);
    button.append(face, count);
    button.addEventListener('click', () => void toggleMessageReaction(messageRow.dataset.messageId, group.emoji));
    container.appendChild(button);
  });
  if (groups.length) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'message-reaction-add'; add.textContent = '+';
    add.title = 'Añadir reacción'; add.setAttribute('aria-label', 'Añadir reacción');
    add.addEventListener('click', () => openEmojiPicker(add, 'reaction', messageRow.dataset.messageId));
    container.appendChild(add);
  }
  return true;
}

async function loadMessageReactions(conversationId = currentConversation) {
  const id = String(conversationId || '');
  if (!id || !currentUser || String(currentConversation) !== id) return;
  const sequence = (reactionLoadSequences.get(id) || 0) + 1;
  reactionLoadSequences.set(id, sequence);
  const { data, error } = await supabase.rpc('xifre_get_message_reactions', { p_conversation_id: id });
  if (error) throw error;
  if (String(currentConversation) !== id || reactionLoadSequences.get(id) !== sequence) return;
  const rows = data || [];
  const byMessage = new Map();
  rows.forEach(reaction => {
    const messageId = String(reaction.message_id || '');
    if (!byMessage.has(messageId)) byMessage.set(messageId, []);
    byMessage.get(messageId).push(reaction);
  });
  const box = $('#messages');
  if (!box) return;
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  const originalScrollTop = box.scrollTop;
  const boxTop = box.getBoundingClientRect().top;
  const anchor = [...box.querySelectorAll('[data-message-id]')].find(node => node.getBoundingClientRect().bottom > boxTop + 1);
  const anchorTop = anchor?.getBoundingClientRect().top || 0;
  let changed = false;
  $$('.message-row[data-message-id]', box).forEach(row => {
    if (renderMessageReactions(row, byMessage.get(String(row.dataset.messageId)) || [])) changed = true;
  });
  if (!changed) return;
  if (wasNearBottom) box.scrollTop = box.scrollHeight;
  else if (anchor) box.scrollTop = Math.max(0, originalScrollTop + anchor.getBoundingClientRect().top - anchorTop);
  else box.scrollTop = originalScrollTop;
}

async function toggleMessageReaction(messageId, emoji) {
  const cleanId = String(messageId || '');
  const cleanEmoji = String(emoji || '');
  if (!isValidUuid(cleanId) || !cleanEmoji || !currentConversation) return;
  try {
    const { error } = await supabase.rpc('xifre_toggle_message_reaction', { p_message_id: cleanId, p_emoji: cleanEmoji });
    if (error) throw error;
    await loadMessageReactions(currentConversation);
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

/* ------------------------------------------------------------------------ */
/* Realtime typing + messages */
/* ------------------------------------------------------------------------ */
function stopChatRealtime() {
if (messageChannel) supabase?.removeChannel(messageChannel);
if (typingChannel) supabase?.removeChannel(typingChannel);
messageChannel = null;
typingChannel = null;
if (messagePoll) clearInterval(messagePoll);
messagePoll = null;
if (typingStopTimer) clearTimeout(typingStopTimer);
typingStopTimer = null;
clearRemoteTypingUsers();
}

function setupMessageChannel(conversationId) {
  if (messageChannel) supabase.removeChannel(messageChannel);
  messageChannel = supabase.channel(`xifre:messages:${conversationId}:${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
      if (String(currentConversation) !== String(conversationId)) return;
      // The sender already renders its RPC response; the poll/realtime ID de-duplicates it.
      if (String(payload.new?.sender_id) !== String(currentUser?.id)) {
        await loadMessages(conversationId, false).catch(() => {});
        await loadConversations().catch(() => {});
      }
      const box = $('#messages');
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 80) {
        await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId }).catch(() => {});
        const c = conversationCache.find(item => String(item.id) === String(conversationId));
        if (c) { c.unread_count = 0; c.has_mention = false; }
        renderConversations();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async () => {
      if (String(currentConversation) !== String(conversationId)) return;
      await loadMessages(conversationId, false).catch(() => {});
      await loadConversations().catch(() => {});
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async () => {
      if (String(currentConversation) !== String(conversationId)) return;
      await loadMessages(conversationId, false).catch(() => {});
      await loadConversations().catch(() => {});
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async () => {
      if (String(currentConversation) !== String(conversationId)) return;
      await loadMessageReactions(conversationId).catch(() => {});
    })
    .subscribe();
  if (messagePoll) clearInterval(messagePoll);
  messagePoll = setInterval(() => {
    if (document.visibilityState === 'visible' && String(currentConversation) === String(conversationId)) {
      loadMessages(conversationId, false).catch(() => {});
    }
  }, 3000);
}

function clearRemoteTypingUsers() {
  for (const timer of remoteTypingTimers.values()) clearTimeout(timer);
  remoteTypingTimers.clear();
  remoteTypingUsers.clear();
  setTypingVisible(false);
}

function refreshTypingIndicator() {
  const names = [...remoteTypingUsers.values()].map(item => item.username).filter(Boolean);
  const count = names.length;
  const el = $('#typing-indicator');
  if (!el) return;
  el.classList.toggle('hidden', count === 0);
  if (!count) return;
  let label;
  if (count > 3) label = 'Muchas personas están escribiendo...';
  else if (count === 3) label = `${names[0]}, ${names[1]} y ${names[2]} están escribiendo...`;
  else if (count === 2) label = `${names[0]} y ${names[1]} están escribiendo...`;
  else label = `${names[0]} está escribiendo...`;
  setText('typing-text', label);
  el.setAttribute('aria-label', label);
}

function setupTypingChannel(conversationId) {
  if (typingChannel) supabase.removeChannel(typingChannel);
  clearRemoteTypingUsers();
  const channelConversationId = String(conversationId);
  typingChannel = supabase.channel(`xifre:typing:${channelConversationId}`, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, event => {
      if (String(currentConversation || '') !== channelConversationId) return;
      const payload = event?.payload || {};
      const senderId = String(payload.user_id || '');
      if (!senderId || senderId === String(currentUser?.id || '')) return; // never count our own typing
      if (!payload.typing) {
        remoteTypingUsers.delete(senderId);
        const oldTimer = remoteTypingTimers.get(senderId);
        if (oldTimer) clearTimeout(oldTimer);
        remoteTypingTimers.delete(senderId);
        refreshTypingIndicator();
        return;
      }
      const member = currentMembers.find(item => getMemberId(item) === senderId);
      const username = String(member?.username || payload.username || 'Alguien');
      remoteTypingUsers.set(senderId, { username, lastSeen: Date.now() });
      const oldTimer = remoteTypingTimers.get(senderId);
      if (oldTimer) clearTimeout(oldTimer);
      remoteTypingTimers.set(senderId, setTimeout(() => {
        remoteTypingUsers.delete(senderId);
        remoteTypingTimers.delete(senderId);
        refreshTypingIndicator();
      }, 4200));
      refreshTypingIndicator();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') stopTypingBroadcast();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') clearRemoteTypingUsers();
    });
}

async function broadcastTyping(isTyping) {
if (!typingChannel || !currentUser || !currentConversation) return;
try {
await typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: currentUser.id, username: currentProfile?.username || 'Usuario', typing: !!isTyping } });
} catch (error) {
console.debug('TYPING', error);
}
}

let xifreLastTypingEvent = 0;
function scheduleTyping() {
if (!currentConversation) return;
if (Date.now()-xifreLastTypingEvent>1100) { xifreLastTypingEvent=Date.now();void broadcastTyping(true); }
if (typingStopTimer) clearTimeout(typingStopTimer);
typingStopTimer = setTimeout(() => void broadcastTyping(false), 1600);
}

function stopTypingBroadcast() {
if (typingStopTimer) clearTimeout(typingStopTimer);
typingStopTimer = null;
void broadcastTyping(false);
}

function setTypingVisible(visible, username = '') {
  const el = $('#typing-indicator');
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  if (visible && username) setText('typing-text', `${username} está escribiendo...`);
}

/* ------------------------------------------------------------------------ */
/* Right panel */
/* ------------------------------------------------------------------------ */
function renderRightPane() {
const empty = $('.right-pane-empty');
const dm = $('#right-dm-content');
const group = $('#right-group-content');
const isGroup = currentConversationData?.type === 'group';
empty?.classList.add('hidden');
dm?.classList.toggle('hidden', isGroup);
group?.classList.toggle('hidden', !isGroup);
if (!isGroup) {
const other = currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
const name = other?.username || 'Usuario';
avatarInto($('#right-profile-avatar'), name, other?.avatar_url, 'private', other?.avatar_color);
ensurePresenceDot($('#right-profile-avatar'), getMemberId(other));
setText('right-profile-name', name);
setText('right-profile-handle', `@${other?.email_handle || other?.username || 'usuario'}`);
renderPresenceIndicators();
} else {
const name = currentConversationData?.name || 'Grupo';
ensurePresenceDot($('#right-profile-avatar'), '');
avatarInto($('#right-group-avatar'), name, currentConversationData?.avatar_url, 'group');
setText('right-group-name', name);
setText('right-group-count', `${currentMembers.length} miembro${currentMembers.length === 1 ? '' : 's'}`);
const list = $('#right-group-members');
list.innerHTML = '';
currentMembers.forEach(member => {
const row = document.createElement('div');
row.className = 'right-member';
row.innerHTML = `<span class="right-member-avatar-wrap presence-host">${avatarHTML(member.username, member.avatar_url, 'private', 'member-avatar', member.avatar_color)}${presenceDotHTML(getMemberId(member))}</span><span class="right-member-name">${esc(member.username || 'Usuario')}</span>${member.is_owner?'<span class="member-role-crown crown-owner" title="Creador">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin" title="Administrador">♛</span>':''}`;
row.addEventListener('click',e=>{if(e.defaultPrevented)return;showMemberProfile(member,row);});
row.addEventListener('contextmenu',e=>{e.preventDefault();openMemberMenu(member,e.clientX,e.clientY);});
list.appendChild(row);
});
renderPresenceIndicators();
}
}

function showMemberProfile(member, anchor) {
  const popover = $('#member-profile-popover');
  if (!popover || !member) return;
  selectedMember = member;
  avatarInto($('#member-profile-avatar'), member.username, member.avatar_url, 'private', member.avatar_color || '');
  ensurePresenceDot($('#member-profile-avatar'), getMemberId(member));
  setText('member-profile-name', member.username || 'Usuario');
  setText('member-profile-username', `@${member.email_handle || member.username || 'usuario'}`);
  const role = $('#member-profile-role');
  const roleName = member.is_owner ? 'Creador del grupo' : member.is_admin ? 'Administrador del grupo' : 'Miembro del grupo';
  setText('member-profile-role', roleName);
  role?.classList.remove('role-owner', 'role-admin', 'role-member');
  role?.classList.add(member.is_owner ? 'role-owner' : member.is_admin ? 'role-admin' : 'role-member');
  popover.classList.remove('hidden');
  const anchorRect = anchor?.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 12;
  let left = anchorRect ? anchorRect.left : (window.innerWidth - popRect.width) / 2;
  let top = anchorRect ? anchorRect.bottom + 8 : margin;
  if (left + popRect.width > window.innerWidth - margin) left = window.innerWidth - popRect.width - margin;
  if (left < margin) left = margin;
  if (top + popRect.height > window.innerHeight - margin) top = anchorRect ? anchorRect.top - popRect.height - 8 : window.innerHeight - popRect.height - margin;
  if (top < margin) top = margin;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  updateMemberProfileFriendAction(member);
  renderPresenceIndicators();
}

async function updateMemberProfileFriendAction(member) {
  const button = $('#member-profile-add-friend');
  if (!button || !member) return;
  const id = getMemberId(member);
  const token = ++memberStatusRequestToken;
  memberFriendStatus = 'none';
  if (!isValidUuid(id) || id === String(currentUser?.id)) { button.classList.add('hidden'); return; }

  // Friends cache is authoritative for this common case: no spinner / permanent "Comprobando".
  if (friendCache.some(friend => String(friend.id) === id)) {
    memberFriendStatus = 'friend';
    button.classList.add('hidden');
    return;
  }
  button.classList.remove('hidden');
  button.disabled = false;
  button.textContent = 'Añadir amigo';

  let timeoutId;
  try {
    const statusPromise = supabase.rpc('xifre_get_friend_request_status', { p_target_user: id });
    const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('La comprobación está tardando demasiado')), 2800); });
    const response = await Promise.race([statusPromise, timeoutPromise]);
    if (response.error) throw response.error;
    if (token !== memberStatusRequestToken || String(getMemberId(selectedMember)) !== id) return;
    const raw = response.data;
    const statusValue = Array.isArray(raw) ? raw[0] : raw;
    memberFriendStatus = String(statusValue?.status || statusValue?.relationship || statusValue || 'none');
    if (memberFriendStatus === 'friend') { button.classList.add('hidden'); return; }
    button.classList.remove('hidden');
    button.disabled = false;
    button.textContent = memberFriendStatus === 'incoming_pending' ? 'Aceptar solicitud' : memberFriendStatus === 'outgoing_pending' ? 'Cancelar solicitud' : 'Añadir amigo';
  } catch (error) {
    console.warn('MEMBER FRIEND STATUS', error);
    if (token !== memberStatusRequestToken || String(getMemberId(selectedMember)) !== id) return;
    // A failed status lookup is not allowed to block the action. The server-side operation
    // will return a clear result if a request already exists.
    memberFriendStatus = 'none';
    button.classList.remove('hidden');
    button.disabled = false;
    button.textContent = 'Añadir amigo';
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function sendFriendRequestFromMemberProfile() {
  const member = selectedMember;
  const button = $('#member-profile-add-friend');
  const id = getMemberId(member);
  if (!member || !button || !isValidUuid(id) || id === String(currentUser?.id)) return;
  const previousStatus = memberFriendStatus;
  memberStatusRequestToken++;
  button.disabled = true;
  try {
    let error = null;
    if (previousStatus === 'incoming_pending') {
      ({ error } = await supabase.rpc('xifre_accept_friend_request_from', { p_sender_user: id }));
    } else if (previousStatus === 'outgoing_pending') {
      ({ error } = await supabase.rpc('xifre_cancel_friend_request', { p_target_user: id }));
    } else {
      ({ error } = await supabase.rpc('xifre_send_friend_request', { p_target_user: id }));
    }
    if (error) throw error;
    await Promise.all([loadFriends(), loadFriendRequests()]);
    await updateMemberProfileFriendAction(member);
    if (previousStatus === 'incoming_pending') toast('Solicitud aceptada. Ahora sois amigos.', 'success');
    else if (previousStatus === 'outgoing_pending') toast('Solicitud cancelada.', 'success');
    else toast('Solicitud de amistad enviada.', 'success');
  } catch (error) {
    button.disabled = false;
    toast(friendlyError(error), 'error');
    await updateMemberProfileFriendAction(member);
  }
}
function closeMemberProfile(){ memberStatusRequestToken++; $('#member-profile-popover')?.classList.add('hidden'); const button=$('#member-profile-add-friend'); if(button){button.disabled=false;button.classList.add('hidden');button.textContent='Añadir amigo';} selectedMember=null; }
function openMemberMenu(member,x,y){
selectedMember=member; const menu=$('#member-menu'); if(!menu)return; const me=currentMembers.find(m=>String(m.user_id)===String(currentUser.id)); const creator=!!me?.is_owner, admin=!!me?.is_admin;
const canManage=creator||admin; const targetIsAdmin=!!member.is_admin||!!member.is_owner; $('#member-menu [data-member-menu="kick"]')?.classList.toggle('hidden',!canManage||member.is_owner||(!creator&&targetIsAdmin)); $('#member-menu [data-member-menu="grant"]')?.classList.toggle('hidden',!creator||member.is_owner||member.is_admin); $('#member-menu [data-member-menu="revoke"]')?.classList.toggle('hidden',!creator||!member.is_admin); menu.classList.remove('hidden'); menu.style.left=`${Math.min(x,window.innerWidth-205)}px`; menu.style.top=`${Math.min(y,window.innerHeight-150)}px`;
}
function closeMemberMenu(){ $('#member-menu')?.classList.add('hidden'); selectedMember=null; }
async function memberAction(action){
const member=selectedMember; closeMemberMenu(); if(!member||!currentConversation)return;
let fn='',args={p_conversation_id:currentConversation,p_user_id:member.user_id}; if(action==='kick')fn='xifre_remove_group_member'; if(action==='grant')fn='xifre_grant_group_admin'; if(action==='revoke')fn='xifre_revoke_group_admin'; if(!fn)return;
const {error}=await supabase.rpc(fn,args); if(error)return toast(friendlyError(error),'error'); memberCache.delete(currentConversation); const r=await supabase.rpc('xifre_get_conversation_members',{p_conversation_id:currentConversation}); if(r.error)return toast(friendlyError(r.error),'error'); currentMembers=await hydrateMemberProfiles(r.data||[]); memberCache.set(currentConversation,currentMembers); renderRightPane(); await openChatInfo(); await loadMessages(currentConversation); await loadConversations(); toast(action==='kick'?'Persona expulsada.':action==='grant'?'Administrador añadido.':'Administrador retirado.','success');
}

/* ------------------------------------------------------------------------ */
/* Groups */
/* ------------------------------------------------------------------------ */
function renderGroupSelection() {
const list = $('#group-friends-list');
if (!list) return;
list.innerHTML = '';
friendCache.forEach(friend => {
const row = document.createElement('label');
row.className = 'selection-item';
row.innerHTML = `<input type="checkbox" class="group-friend-check" value="${esc(friend.id)}"><span class="presence-host">${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color)}${presenceDotHTML(friend.id)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.email_handle || friend.username)}</small></span>`;
list.appendChild(row);
});
updateGroupSelectedCount();
}

function updateGroupSelectedCount() {
setText('group-selected-count', `${$$('.group-friend-check:checked', $('#group-friends-list')).length} seleccionados`);
}

async function createGroup() {
const name = String($('#group-name')?.value || '').trim();
const ids = $$('.group-friend-check:checked', $('#group-friends-list')).map(i => i.value);
if (!name) return setModalMessage('group-message', 'Escribe un nombre para el grupo.', 'error');
if (!ids.length) return setModalMessage('group-message', 'Selecciona al menos un amigo.', 'error');
const button = $('#create-group-submit');
setLoading(button, true);
try {
const { data, error } = await supabase.rpc('create_group', { group_name: name, member_ids: ids });
if (error) throw error;
closeModal('group-modal');
$('#group-name').value = '';
await loadConversations();
await openConversation(String(data));
} catch (error) {
setModalMessage('group-message', friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
}

async function openChatInfo() {
if (!currentConversation) return;
const isGroup = currentConversationData?.type === 'group';
if (!isGroup) {
const other = currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
setText('info-title', other?.username || 'Usuario');
setText('info-subtitle', 'Mensaje directo');
$('#group-edit-section')?.classList.add('hidden');
renderInfoMembers(currentMembers);
} else {
setText('info-title', currentConversationData?.name || 'Grupo');
setText('info-subtitle', `${currentMembers.length} miembros`);
renderInfoMembers(currentMembers);
const meMember=currentMembers.find(m=>String(m.user_id)===String(currentUser.id));
const canManage=!!(meMember?.is_owner||meMember?.is_admin);
$('#group-edit-section')?.classList.toggle('hidden', !canManage);
$('#delete-group-button')?.classList.toggle('hidden', !meMember?.is_owner);
setModalMessage('group-settings-message', '');
$('#group-edit-name').value = currentConversationData?.name || 'Grupo';
if (!pendingGroupAvatarFile) avatarInto($('#group-edit-avatar-preview'), currentConversationData?.name || 'Grupo', currentConversationData?.avatar_url, 'group');
renderGroupAddSelection();
}
openModal('chat-info-modal');
}

function renderInfoMembers(members) {
const list = $('#info-members');
if (!list) return;
list.innerHTML = '';
members.forEach(member => {
const row = document.createElement('div');
row.className = 'friend-item';
row.innerHTML = `<span class="friend-avatar presence-host">${avatarHTML(member.username, member.avatar_url, 'private', 'friend-avatar', member.avatar_color)}${presenceDotHTML(getMemberId(member))}</span><div class="friend-copy"><strong>${esc(member.username || 'Usuario')}</strong><small>@${esc(member.email_handle || member.username || 'usuario')}</small></div><span>${member.is_owner?'<span class="member-role-crown crown-owner">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin">♛</span>':''}</span>`;
row.addEventListener('click',()=>showMemberProfile(member,row));
row.addEventListener('contextmenu',e=>{e.preventDefault();openMemberMenu(member,e.clientX,e.clientY);});
list.appendChild(row);
});
}

function renderGroupAddSelection() {
const list = $('#group-add-list');
if (!list) return;
const currentIds = new Set(currentMembers.map(m => String(m.user_id)));
const candidates = friendCache.filter(f => !currentIds.has(String(f.id)));
list.innerHTML = '';
candidates.forEach(friend => {
const row = document.createElement('label');
row.className = 'selection-item';
row.innerHTML = `<input type="checkbox" class="group-add-check" value="${esc(friend.id)}"><span class="presence-host">${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color)}${presenceDotHTML(friend.id)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.email_handle || friend.username)}</small></span>`;
list.appendChild(row);
});
updateGroupAddCount();
}

function updateGroupAddCount() {
setText('group-add-selected-count', `${$$('.group-add-check:checked', $('#group-add-list')).length} seleccionados`);
}

async function addGroupMembers() {
if (!currentConversation) return;
const ids = $$('.group-add-check:checked', $('#group-add-list')).map(i => i.value);
if (!ids.length) return toast('Selecciona al menos una persona.', 'info');
const button = $('#add-group-members-button');
setLoading(button, true);
try {
const { error } = await supabase.rpc('xifre_add_group_members', { p_conversation_id: currentConversation, p_member_ids: ids });
if (error) throw error;
memberCache.delete(currentConversation);
const result = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: currentConversation });
if (result.error) throw result.error;
currentMembers = await hydrateMemberProfiles(result.data || []);
memberCache.set(currentConversation, currentMembers);
updateChatHeader();
renderRightPane();
await openChatInfo();
toast('Personas añadidas.', 'success');
} catch (error) {
toast(friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
}

async function saveGroupSettings() {
  if (!currentConversation || currentConversationData?.type !== 'group') return;
  const conversationId = String(currentConversation);
  const button = $('#save-group-settings');
  const name = String($('#group-edit-name')?.value || '').trim();
  if (!name) return setModalMessage('group-settings-message', 'El nombre es obligatorio.', 'error');
  setLoading(button, true);
  try {
    let avatarUrl = null;
    if (pendingGroupAvatarFile) {
      const path = `${currentUser.id}/groups/${conversationId}/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingGroupAvatarFile)}`;
      avatarUrl = await uploadAvatar(pendingGroupAvatarFile, path);
    }
    const { data, error } = await supabase.rpc('xifre_update_group_v17', {
      p_conversation_id: conversationId,
      p_name: name,
      p_avatar_url: avatarUrl,
      p_remove_avatar: !!removeGroupAvatarRequested && !pendingGroupAvatarFile
    });
    if (error) throw error;
    const updated = Array.isArray(data) ? data[0] : data;
    currentConversationData.name = updated?.name || name;
    currentConversationData.displayName = currentConversationData.name;
    if (updated && Object.prototype.hasOwnProperty.call(updated, 'avatar_url')) currentConversationData.avatar_url = updated.avatar_url || null;
    const local = conversationCache.find(item => String(item.id) === conversationId);
    if (local) { local.name = currentConversationData.name; local.displayName = currentConversationData.name; local.avatar_url = currentConversationData.avatar_url || null; }
    pendingGroupAvatarFile = null; pendingGroupAvatarURL = null; removeGroupAvatarRequested = false;
    const fileInput = $('#group-avatar-file'); if (fileInput) fileInput.value = '';
    updateChatHeader(); renderRightPane(); renderConversations();
    avatarInto($('#group-edit-avatar-preview'), currentConversationData.name, currentConversationData.avatar_url, 'group');
    setModalMessage('group-settings-message', 'Cambios guardados.', 'success');
  } catch (error) {
    setModalMessage('group-settings-message', friendlyError(error), 'error');
  } finally { setLoading(button, false); }
}

async function deleteGroup() {
if (!currentConversation) return;
const ok = await askConfirm('Eliminar grupo', 'Se eliminarán el grupo, sus mensajes y sus miembros. Esta acción no se puede deshacer.', 'Eliminar grupo');
if (!ok) return;
const deletedConversation = currentConversation;
const { error } = await supabase.rpc('xifre_delete_group', { p_conversation_id: deletedConversation });
if (error) return toast(friendlyError(error), 'error');
closeModal('chat-info-modal');
stopChatRealtime();
currentConversation = null;
currentConversationData = null;
currentMembers = [];
memberCache.delete(deletedConversation);
sessionStorage.removeItem('xifre_current_conversation');
resetChatView();
await loadConversations();
toast('Grupo eliminado.', 'success');
}

/* ------------------------------------------------------------------------ */
/* Avatar upload / profile settings */
/* ------------------------------------------------------------------------ */
function fileExt(file) {
const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
return map[file?.type] || 'png';
}

function validateImage(file) {
if (!file) throw new Error('No se ha seleccionado ninguna imagen.');
if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) throw new Error('Solo se permiten PNG, JPG, WEBP o GIF.');
if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5 MB.');
}

async function uploadAvatar(file, path) {
validateImage(file);
const { error } = await supabase.storage.from('xifre-avatars').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
if (error) throw error;
const result = supabase.storage.from('xifre-avatars').getPublicUrl(path);
if (result.error) throw result.error;
return `${result.data.publicUrl}?v=${Date.now()}`;
}

function previewFile(file, target, name, kind) {
try { validateImage(file); } catch (error) { toast(error.message, 'error'); return; }
const oldUrl = target.dataset.objectUrl;
if (oldUrl) URL.revokeObjectURL(oldUrl);
const url = URL.createObjectURL(file);
target.innerHTML = avatarHTML(name, url, kind);
target.dataset.objectUrl = url;
}

function openSettings() {
syncProfileUI();
applyTheme(currentTheme());
$('#settings-modal')?.classList.remove('hidden');
}

async function saveProfileSettings() {
  if (!currentUser) return;
  const button = $('#save-profile-settings');
  const username = normalizeUsername($('#settings-username')?.value);
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return setModalMessage('profile-settings-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
  setLoading(button, true);
  try {
    let avatarUrl = null;
    if (pendingProfileAvatarFile) {
      const path = `${currentUser.id}/profile/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingProfileAvatarFile)}`;
      avatarUrl = await uploadAvatar(pendingProfileAvatarFile, path);
    }
    const { data, error } = await supabase.rpc('xifre_update_profile_v17', {
      p_username: username,
      p_display_name: username,
      p_avatar_url: avatarUrl,
      p_remove_avatar: !!removeProfileAvatarRequested && !pendingProfileAvatarFile
    });
    if (error) throw error;
    currentProfile = Array.isArray(data) ? data[0] : data;
    if (currentProfile && !currentProfile.email_handle) currentProfile.email_handle = emailHandle(currentUser?.email);
    pendingProfileAvatarFile = null; pendingProfileAvatarURL = null; removeProfileAvatarRequested = false;
    const fileInput = $('#profile-avatar-file'); if (fileInput) fileInput.value = '';
    const preview = $('#settings-avatar-preview'); if (preview?.dataset.objectUrl) { URL.revokeObjectURL(preview.dataset.objectUrl); delete preview.dataset.objectUrl; }
    syncProfileUI(); memberCache.clear();
    await Promise.all([loadFriends(), loadConversations()]);
    if (currentConversation) {
      const conv = conversationCache.find(item => String(item.id) === String(currentConversation));
      if (conv) currentConversationData = conv;
      await loadMessages(currentConversation, false);
      updateChatHeader(); renderRightPane();
    }
    setModalMessage('profile-settings-message', 'Cambios guardados.', 'success');
  } catch (error) {
    setModalMessage('profile-settings-message', friendlyError(error), 'error');
  } finally { setLoading(button, false); }
}

/* ------------------------------------------------------------------------ */
/* Custom confirmation */
/* ------------------------------------------------------------------------ */
function askConfirm(title, text, okText = 'Confirmar') {
return new Promise(resolve => {
confirmResolver = resolve;
setText('confirm-title', title);
setText('confirm-text', text);
setText('confirm-ok', okText);
$('#confirm-modal')?.classList.remove('hidden');
});
}

function finishConfirm(value) {
if (!confirmResolver) return;
const resolver = confirmResolver;
confirmResolver = null;
$('#confirm-modal')?.classList.add('hidden');
resolver(value);
}

/* ------------------------------------------------------------------------ */
/* Modals / reset */
/* ------------------------------------------------------------------------ */
function openModal(id) {
$(`#${id}`)?.classList.remove('hidden');
}
function closeModal(id) {
$(`#${id}`)?.classList.add('hidden');
}

/* ------------------------------------------------------------------------ */
/* Catalan on-screen keyboard + locally learned word suggestions             */
/* ------------------------------------------------------------------------ */
const CATALAN_COMMON_WORDS = (`que de no la el y en un una es por con del los las se para como más pero también ya sí porque cuando qué quién dónde yo tú él ella nosotros vosotros ellos me te nos os le les mi tu su esto esta estos estas aquí allí muy mucho poco bien mal mejor peor hoy ayer mañana ahora luego antes después siempre nunca quizá hola adiós gracias por favor perdón vale claro exacto perfecto genial bueno buena necesito quieres quiero puedes puedo podemos tienen tengo hacer decir ir venir ver saber poder querer dar quedar poner hablar pensar pasar encontrar llegar dejar llevar mirar intentar parecer volver sentir vivir jugar estudiar leer escribir comer beber dormir salir entrar abrir cerrar enviar recibir mensaje mensajes grupo grupos amigo amiga amigos amigas persona personas usuario nombre foto perfil cuenta tarea trabajo proyecto examen nota clase profesor alumno alumna escuela instituto asignatura español castellano catalán inglés matemáticas ciencias historia música deporte fútbol baloncesto videojuego juego canción película serie libro ordenador móvil teléfono internet página web aplicación programa archivo imagen vídeo documento enlace problema error solución ayuda pregunta respuesta idea cosa algo nada todo alguien nadie mismo misma diferente igual primero segundo tercero último otra otro nuevo nueva pequeño pequeña grande largo corta fácil difícil interesante importante necesario posible rápido lenta contento contenta triste cansado cansada ocupado ocupada libre disponible conectado conectada preparado preparada listo lista correcto correcta pedir enviar recibir añadir eliminar cambiar guardar subir bajar compartir olvidar recordar esperar empezar acabar continuar parar probar funcionar arreglar crear actualizar comprobar revisar buscar elegir decidir responder aceptar rechazar invitar solicitar instalar descargar ejecutar imprimir copiar pegar mover seleccionar mostrar ocultar activar desactivar permitir utilizar usar entrar salir iniciar sesión cerrar sesión me gusta me encantan no me gusta está bien está mal es verdad seguro realmente quizá no lo creo no lo recuerdo no me importa no tengo ni idea tengo una idea ahora mismo un momento un segundo espera ya vuelvo qué pasa qué quieres qué necesitas qué hacemos dónde estás dónde vamos cuándo quedamos a qué hora qué día qué problema qué solución lo miro te ayudo te lo envío te lo paso ya lo he hecho ya lo he visto lo he enviado lo tengo no lo tengo todavía ya está falta faltan minutos segundos rato un rato un poco un poco más muchísimo bastante casi suficiente enseguida pronto tarde demasiado de nuevo también tampoco todavía aunque mientras entonces así además igualmente especialmente exactamente simplemente normalmente probablemente francamente quizá gracias hola qué tal cómo estás cómo va todo muy bien todo bien sin problema no pasa nada lo siento no lo sé no lo entiendo entendido creo pienso quiero quisiera puedes podemos tenemos vamos hacemos dime explica urgente luego te digo luego hablamos hasta luego hasta mañana nos vemos hablamos claro que sí claro que no por supuesto`).split(/\s+/u);

const CATALAN_KEYBOARD_LAYOUTS = {
  letters: [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l','ç'],
    ['SHIFT','z','x','c','v','b','n','m','BACKSPACE'],
    ['?123','à','è','é','í','ï','ò','ó','ú','ü'],
    ['·',',','APOSTROPHE','SPACE','.','ENTER']
  ],
  symbols: [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['@','#','€','%','&','-','+','(',')','/'],
    ['*','"',':',';','!','?','¿','¡','BACKSPACE'],
    ['ABC','_','\\','|','~','<','>','=','[',']'],
    ['·',',','APOSTROPHE','SPACE','.','ENTER']
  ]
};

function keyboardUsageStorageKey() {
  return `xifre_cat_keyboard_usage_${String(currentUser?.id || 'local')}`;
}
function getKeyboardWordUsage() {
  const owner = String(currentUser?.id || 'local');
  if (keyboardWordUsageCache && keyboardWordUsageOwner === owner) return keyboardWordUsageCache;
  let usage = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(keyboardUsageStorageKey()) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) usage = parsed;
  } catch { usage = {}; }
  keyboardWordUsageOwner = owner;
  keyboardWordUsageCache = usage;
  return usage;
}
function normalizeCatalanWord(word) {
  return String(word || '').toLocaleLowerCase('ca').normalize('NFC');
}
function normalizeCatalanPrefix(word) {
  return normalizeCatalanWord(word).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function recordComposerWordUsage(text) {
  const usage = getKeyboardWordUsage();
  const words = String(text || '').match(/[\p{L}·'’-]{2,32}/gu) || [];
  for (const word of words) {
    const normalized = normalizeCatalanWord(word);
    usage[normalized] = Math.min(9999, Number(usage[normalized] || 0) + 1);
  }
  const entries = Object.entries(usage).sort((a,b) => Number(b[1]) - Number(a[1])).slice(0, 1200);
  keyboardWordUsageCache = Object.fromEntries(entries);
  try { localStorage.setItem(keyboardUsageStorageKey(), JSON.stringify(keyboardWordUsageCache)); } catch {}
}
function keyboardWordContext() {
  const input = $('#message-input');
  if (!input) return { prefix: '', start: 0, end: 0 };
  const value = String(input.value || '');
  const cursor = input.selectionStart ?? value.length;
  const left = value.slice(0, cursor).match(/[\p{L}·'’-]+$/u)?.[0] || '';
  const right = value.slice(cursor).match(/^[\p{L}·'’-]+/u)?.[0] || '';
  return { prefix: left, start: cursor - left.length, end: cursor + right.length };
}
function keyboardSuggestionWords(prefix) {
  const usage = getKeyboardWordUsage();
  const common = [...new Set(CATALAN_COMMON_WORDS.filter(word => word.length > 0))];
  const normalizedPrefix = normalizeCatalanPrefix(prefix);
  const baseRank = new Map(common.map((word, index) => [normalizeCatalanWord(word), index]));
  const learnedWords = Object.keys(usage);
  const pool = [...new Set([...learnedWords, ...common])];
  let words = normalizedPrefix
    ? pool.filter(word => normalizeCatalanPrefix(word).startsWith(normalizedPrefix))
    : pool.slice(0, 80);
  words.sort((a,b) => {
    const useDelta = Number(usage[normalizeCatalanWord(b)] || 0) - Number(usage[normalizeCatalanWord(a)] || 0);
    if (useDelta) return useDelta;
    return (baseRank.get(normalizeCatalanWord(a)) ?? 10000) - (baseRank.get(normalizeCatalanWord(b)) ?? 10000);
  });
  // Keep up to three distinct options and avoid suggesting the same normalized token twice.
  const unique = [];
  const seen = new Set();
  for (const word of words) {
    const key = normalizeCatalanWord(word);
    if (!key || seen.has(key)) continue;
    seen.add(key); unique.push(word);
    if (unique.length === 3) break;
  }
  return unique;
}
function updateKeyboardSuggestions() {
  const box = $('#keyboard-suggestions');
  if (!box) return;
  const context = keyboardWordContext();
  const words = keyboardSuggestionWords(context.prefix);
  box.innerHTML = '';
  words.forEach(word => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'keyboard-suggestion';
    button.dataset.keyboardSuggestion = word;
    button.textContent = word;
    box.appendChild(button);
  });
  if (!words.length) {
    const fallback = document.createElement('span');
    fallback.className = 'keyboard-suggestion-empty';
    fallback.textContent = 'Escriu per veure suggeriments';
    box.appendChild(fallback);
  }
}
function renderCatalanKeyboard() {
  const target = $('#catalan-keyboard-rows');
  if (!target) return;
  target.innerHTML = '';
  const layout = keyboardSymbols ? CATALAN_KEYBOARD_LAYOUTS.symbols : CATALAN_KEYBOARD_LAYOUTS.letters;
  layout.forEach(keys => {
    const row = document.createElement('div');
    row.className = 'catalan-keyboard-row';
    for (const rawKey of keys) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalan-key';
      let key = rawKey;
      if (rawKey === 'SHIFT') { button.dataset.keyboardAction = 'shift'; button.classList.add('keyboard-special'); key = keyboardShift ? '⇧✓' : '⇧'; }
      else if (rawKey === 'BACKSPACE') { button.dataset.keyboardAction = 'backspace'; button.classList.add('keyboard-special'); key = '⌫'; }
      else if (rawKey === 'SPACE') { button.dataset.keyboardAction = 'space'; button.classList.add('keyboard-space'); key = 'Espai'; }
      else if (rawKey === 'ENTER') { button.dataset.keyboardAction = 'enter'; button.classList.add('keyboard-special'); key = '↵'; }
      else if (rawKey === '?123' || rawKey === 'ABC') { button.dataset.keyboardAction = 'symbols'; button.classList.add('keyboard-mode'); key = rawKey; }
      else if (rawKey === 'APOSTROPHE') { key = '’'; button.dataset.keyboardKey = "'"; }
      else button.dataset.keyboardKey = rawKey;
      button.textContent = keyboardShift && /^[a-zçàèéíïòóúü]$/u.test(key) ? key.toLocaleUpperCase('ca') : key;
      if (rawKey === 'SHIFT') button.title = 'Majúscules';
      if (rawKey === 'BACKSPACE') button.title = 'Esborrar';
      if (rawKey === 'SPACE') button.title = 'Espai';
      if (rawKey === 'ENTER') button.title = 'Salt de línia';
      row.appendChild(button);
    }
    target.appendChild(row);
  });
}
function positionCatalanKeyboard() {
  const popover = $('#catalan-keyboard-popover');
  const button = $('#composer-keyboard-button');
  if (!popover || !button || !keyboardOpen) return;
  const rect = button.getBoundingClientRect();
  const width = Math.min(580, window.innerWidth - 20);
  popover.style.width = `${width}px`;
  let left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10));
  let top = rect.top - popover.offsetHeight - 8;
  if (top < 8) top = Math.min(window.innerHeight - popover.offsetHeight - 8, rect.bottom + 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(8, top)}px`;
}
function openCatalanKeyboard() {
  const popover = $('#catalan-keyboard-popover');
  if (!popover) return;
  keyboardOpen = true;
  popover.classList.remove('hidden');
  $('#composer-keyboard-button')?.setAttribute('aria-expanded', 'true');
  renderCatalanKeyboard();
  updateKeyboardSuggestions();
  requestAnimationFrame(positionCatalanKeyboard);
}
function closeCatalanKeyboard() {
  keyboardOpen = false;
  $('#catalan-keyboard-popover')?.classList.add('hidden');
  $('#composer-keyboard-button')?.setAttribute('aria-expanded', 'false');
}
function toggleCatalanKeyboard() {
  if (keyboardOpen) closeCatalanKeyboard();
  else if (!currentConversation) toast('Selecciona una conversación para escribir.', 'info');
  else openCatalanKeyboard();
}
function insertIntoComposer(text, usageSuggestion = false) {
  const input = $('#message-input');
  if (!input || input.disabled) return;
  const value = String(input.value || '');
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? start;
  let insert = String(text ?? '');
  if (usageSuggestion) {
    const context = keyboardWordContext();
    const left = context.start;
    const right = context.end;
    const suffix = value.slice(right);
    const addSpace = !suffix || (!/^\s/u.test(suffix) && !/^[,.;:!?…)}\]]/u.test(suffix));
    insert = `${insert}${addSpace ? ' ' : ''}`;
    input.value = value.slice(0, left) + insert + suffix;
    const cursor = left + insert.length;
    input.focus({ preventScroll: true }); input.setSelectionRange(cursor, cursor);
    recordComposerWordUsage(String(text));
  } else {
    input.value = value.slice(0, start) + insert + value.slice(end);
    const cursor = start + insert.length;
    input.focus({ preventScroll: true }); input.setSelectionRange(cursor, cursor);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  resizeMessageInput();
  updateMentionPicker();
  updateSendState();
  scheduleTyping();
  positionCatalanKeyboard();
}
function performCatalanKeyboardAction(action, rawKey = '') {
  const input = $('#message-input');
  if (!input || input.disabled) return;
  if (action === 'shift') {
    keyboardShift = !keyboardShift;
    renderCatalanKeyboard();
    updateKeyboardSuggestions();
    return;
  }
  if (action === 'symbols') {
    keyboardSymbols = !keyboardSymbols;
    keyboardShift = false;
    renderCatalanKeyboard();
    return;
  }
  if (action === 'space') { insertIntoComposer(' '); keyboardShift = false; renderCatalanKeyboard(); return; }
  if (action === 'enter') { insertIntoComposer('\n'); keyboardShift = false; renderCatalanKeyboard(); return; }
  if (action === 'backspace') {
    const value = String(input.value || '');
    let start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    if (start === end && start > 0) {
      const before = value.slice(0, start);
      const previousCodePoint = Array.from(before).pop() || '';
      start -= previousCodePoint.length;
    }
    input.value = value.slice(0, start) + value.slice(end);
    input.focus({ preventScroll: true }); input.setSelectionRange(start, start);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    resizeMessageInput(); updateMentionPicker(); updateSendState(); scheduleTyping();
    return;
  }
  const key = String(rawKey || '');
  if (!key) return;
  const character = keyboardShift ? key.toLocaleUpperCase('ca') : key;
  insertIntoComposer(character);
  if (keyboardShift && /^[a-zçàèéíïòóúü]$/iu.test(key)) {
    keyboardShift = false;
    renderCatalanKeyboard();
  }
}

$('#composer-keyboard-button')?.addEventListener('click', event => {
  event.preventDefault(); event.stopPropagation(); toggleCatalanKeyboard();
});
$('#catalan-keyboard-close')?.addEventListener('click', closeCatalanKeyboard);
$('#catalan-keyboard-popover')?.addEventListener('click', event => {
  const suggestion = event.target.closest('[data-keyboard-suggestion]');
  if (suggestion) { insertIntoComposer(suggestion.dataset.keyboardSuggestion || '', true); return; }
  const key = event.target.closest('[data-keyboard-key]');
  if (key) { performCatalanKeyboardAction('', key.dataset.keyboardKey || ''); return; }
  const action = event.target.closest('[data-keyboard-action]');
  if (action) performCatalanKeyboardAction(action.dataset.keyboardAction || '');
});
$('#message-input')?.addEventListener('keyup', event => {
  if (['ArrowLeft','ArrowRight','Home','End','Control','Shift','Alt'].includes(event.key)) updateKeyboardSuggestions();
});
$('#message-input')?.addEventListener('click', updateKeyboardSuggestions);
window.addEventListener('resize', () => { positionCatalanKeyboard(); if (!$('#attachment-menu')?.classList.contains('hidden')) closeAttachmentMenu(); });

function resetChatView() {
conversationOpenSequence++;
stopChatRealtime();
setText('chat-title', 'XIFRE');
setText('chat-subtitle', 'Selecciona una conversación');
avatarInto($('#chat-avatar'), 'XIFRE', null, 'private');
$('#chat-info-button')?.classList.add('hidden');
$('#message-input').disabled = true;
$('#message-input').value = '';
clearPendingChatAttachment(false);
closeAttachmentMenu();
closeCatalanKeyboard();
resizeMessageInput();
updateMessageCharacterCount();
$('#send-button').disabled = true;
clearReply(); currentMentionIds.clear(); mentionEverywhere=false; $('#mention-picker')?.classList.add('hidden');
setTypingVisible(false);
$('#messages').innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Bienvenido a XIFRE</h3><p>Selecciona un chat de la izquierda para empezar.</p></div>';
$('.right-pane-empty')?.classList.remove('hidden');
$('#right-dm-content')?.classList.add('hidden');
$('#right-group-content')?.classList.add('hidden');
}

function showChatError(text) {
$('#messages').innerHTML = `<div class="chat-welcome"><div class="welcome-mark">!</div><h3>No se pudo abrir esta conversación</h3><p>${esc(text)}</p><button type="button" id="retry-chat" class="secondary-action" style="margin-top:12px">Reintentar</button></div>`;
$('#retry-chat')?.addEventListener('click', () => openConversation(currentConversation));
$('#message-input').disabled = true;
$('#send-button').disabled = true;
}

function showPeopleTab(tab){
$$('.people-tab').forEach(b=>b.classList.toggle('active',b.dataset.peopleTab===tab));
$$('.people-panel').forEach(p=>p.classList.toggle('active',p.id===`people-${tab==='add'?'add':tab}-panel`));
}

/* ------------------------------------------------------------------------ */
/* Event wiring */
/* ------------------------------------------------------------------------ */
function bind() {
// Presence activity is low-frequency; mouse movement only refreshes activity every 15 seconds.
document.addEventListener('pointerdown', notePresenceActivity, { passive: true });
document.addEventListener('keydown', notePresenceActivity, true);
document.addEventListener('touchstart', notePresenceActivity, { passive: true });
let lastPointerPresenceNotice = 0;
document.addEventListener('pointermove', () => {
  const now = Date.now();
  if (now - lastPointerPresenceNotice < 15000) return;
  lastPointerPresenceNotice = now;
  notePresenceActivity();
}, { passive: true });
document.addEventListener('pointermove',()=>{platformWalletActivityAt=Date.now();},{passive:true});
document.addEventListener('pointerdown',()=>{platformWalletActivityAt=Date.now();},{passive:true});
document.addEventListener('keydown',()=>{platformWalletActivityAt=Date.now();},true);
document.addEventListener('scroll',()=>{platformWalletActivityAt=Date.now();}, {passive:true,capture:true});
// Un solo submit handler por formulario.
$('#login-form')?.addEventListener('submit', event => {
event.preventDefault();
event.stopPropagation();
void login();
});
$('#register-form')?.addEventListener('submit', event => {
event.preventDefault();
event.stopPropagation();
void register();
});

document.addEventListener('click', event => {
const chatLink = event.target.closest('a.chat-link[data-external-url]');
if (chatLink) { event.preventDefault(); event.stopPropagation(); openExternalLinkWarning(chatLink.dataset.externalUrl || chatLink.href); return; }
const go = event.target.closest('[data-go]');
if (go) {
event.preventDefault();
event.stopPropagation();
showScreen(go.dataset.go);
return;
}
const action = event.target.closest('[data-action]');
if (action) {
const type = action.dataset.action;
if (type === 'open-settings') openSettings();
else if (type === 'close-settings') $('#settings-modal')?.classList.add('hidden');
else if (type === 'logout') void logout();
else if (type === 'open-friend') { openModal('people-modal'); showPeopleTab('add'); $('#friend-search').value=''; searchPeople(''); $('#friend-search').focus(); }
else if (type === 'open-friends') { openModal('people-modal'); showPeopleTab('friends'); renderFriendsModal(); }
else if (type === 'open-requests') { openModal('people-modal'); showPeopleTab('requests'); void loadFriendRequests(); }
else if (type === 'open-people') { openModal('people-modal'); showPeopleTab('friends'); renderFriendsModal(); }
else if (type === 'open-conversation-search') openConversationSearch();
else if (type === 'open-group') { openModal('group-modal'); renderGroupSelection(); $('#group-name').focus(); }
else if (type === 'create-group') void createGroup();
else if (type === 'open-chat-info') void openChatInfo();
else if (type === 'close-member-profile') closeMemberProfile();
else if (type === 'send-member-friend-request') void sendFriendRequestFromMemberProfile();
else if (type === 'close-emoji-picker') closeEmojiPicker();
else if (type === 'save-group-settings') void saveGroupSettings();
else if (type === 'add-group-members') void addGroupMembers();
else if (type === 'request-delete-group') void deleteGroup();
else if (type === 'save-profile-settings') void saveProfileSettings();
else if (type === 'composer-placeholder') { event.preventDefault(); toggleAttachmentMenu(); }
else if (type === 'confirm-external-link') confirmExternalLink();
else if (type === 'cancel-external-link') closeExternalLinkWarning();
else if (type === 'resend') void resendConfirmation();
else if (type === 'close-modal') closeModal(action.dataset.modal);
}

const tab = event.target.closest('[data-settings-tab]');
if (tab) {
const value = tab.dataset.settingsTab;
$$('.settings-tab-button').forEach(b => b.classList.toggle('active', b.dataset.settingsTab === value));
$('#settings-profile-tab')?.classList.toggle('active', value === 'profile');
$('#settings-appearance-tab')?.classList.toggle('active', value === 'appearance');
}

const theme = event.target.closest('[data-theme-choice]');
if (theme) applyTheme(theme.dataset.themeChoice);

const messageAction = event.target.closest('[data-message-menu]');
if (messageAction) {
if (messageAction.dataset.messageMenu === 'reply' && menuMessage) setReplyTo(menuMessage);
if (messageAction.dataset.messageMenu === 'edit' && menuMessage) { const message = menuMessage; const row = $(`[data-message-id="${CSS.escape(String(message.id))}"]`); if (row) startEditMessage(message, row); }
if (messageAction.dataset.messageMenu === 'delete' && menuMessage) void deleteMessage(menuMessage);
closeMessageMenu();
}

if (event.target.closest('#confirm-ok')) finishConfirm(true);
if (event.target.closest('#confirm-cancel')) finishConfirm(false);
if (event.target.closest('#cancel-reply')) clearReply();
});

document.addEventListener('click', event => {
if (!event.target.closest('#message-menu')) closeMessageMenu();
if (!event.target.closest('#conversation-menu')) closeConversationMenu();
if (!event.target.closest('#emoji-picker-popover') && !event.target.closest('#composer-emoji-button') && !event.target.closest('[data-message-action="react"]') && !event.target.closest('.message-reaction-add')) closeEmojiPicker();
if (!event.target.closest('#catalan-keyboard-popover') && !event.target.closest('#composer-keyboard-button')) closeCatalanKeyboard();
if (!event.target.closest('#attachment-menu') && !event.target.closest('#composer-plus-button') && !event.target.closest('#upload-chat-attachment')) closeAttachmentMenu();
}, true);

$('#friend-search')?.addEventListener('input', e => searchPeople(e.target.value));
$('#conversation-filter-input')?.addEventListener('input', event => {
  conversationFilter = String(event.target.value || '');
  $('#conversation-filter-clear')?.classList.toggle('hidden', !conversationFilter);
  renderConversations();
});
$('#conversation-filter-clear')?.addEventListener('click', () => {
  const input = $('#conversation-filter-input');
  if (input) { input.value = ''; input.focus(); }
  conversationFilter = '';
  $('#conversation-filter-clear')?.classList.add('hidden');
  renderConversations();
});
$('#composer-emoji-button')?.addEventListener('click', event => {
  event.stopPropagation();
  const popover = $('#emoji-picker-popover');
  if (popover && !popover.classList.contains('hidden') && emojiPickerMode === 'compose') closeEmojiPicker();
  else openEmojiPicker(event.currentTarget, 'compose');
});
setupEmojiPicker();
resizeMessageInput();
$('#conversation-search-input')?.addEventListener('input',e=>{clearTimeout(conversationSearchTimer);conversationSearchTimer=setTimeout(()=>renderConversationSearch(e.target.value),120);});
document.addEventListener('click',event=>{const tab=event.target.closest('[data-people-tab]');if(tab)showPeopleTab(tab.dataset.peopleTab);});
document.addEventListener('click',event=>{const a=event.target.closest('[data-member-menu]');if(a)void memberAction(a.dataset.memberMenu);});
document.addEventListener('click',event=>{if(!event.target.closest('#member-menu'))closeMemberMenu();if(!event.target.closest('#member-profile-popover')&&!event.target.closest('.right-member')&&!event.target.closest('#info-members .friend-item'))closeMemberProfile();});
document.addEventListener('click',event=>{const a=event.target.closest('[data-conversation-menu]');if(a&&selectedConversationForMenu)void markConversationRead(selectedConversationForMenu.id);});
$('#group-friends-list')?.addEventListener('change', updateGroupSelectedCount);
$('#group-add-list')?.addEventListener('change', updateGroupAddCount);

$('#profile-avatar-file')?.addEventListener('change', event => {
const file = event.target.files?.[0];
if (!file) return;
try { validateImage(file); } catch (error) { event.target.value = ''; toast(error.message, 'error'); return; }
pendingProfileAvatarFile = file;
removeProfileAvatarRequested = false;
previewFile(file, $('#settings-avatar-preview'), currentProfile?.username || 'Usuario', 'private', currentProfile?.avatar_color || '');
setModalMessage('profile-settings-message', '');
});

$('#group-avatar-file')?.addEventListener('change', event => {
const file = event.target.files?.[0];
if (!file) return;
try { validateImage(file); } catch (error) { event.target.value = ''; toast(error.message, 'error'); return; }
pendingGroupAvatarFile = file;
removeGroupAvatarRequested = false;
previewFile(file, $('#group-edit-avatar-preview'), currentConversationData?.name || 'Grupo', 'group');
setModalMessage('group-settings-message', '');
});

$('#remove-profile-avatar')?.addEventListener('click', () => {
  pendingProfileAvatarFile = null;
  removeProfileAvatarRequested = true;
  const input = $('#profile-avatar-file'); if (input) input.value = '';
  const preview = $('#settings-avatar-preview');
  if (preview?.dataset.objectUrl) { URL.revokeObjectURL(preview.dataset.objectUrl); delete preview.dataset.objectUrl; }
  avatarInto(preview, currentProfile?.username || 'Usuario', null, 'private', currentProfile?.avatar_color || '');
  setModalMessage('profile-settings-message', 'La foto se quitará al guardar los cambios.', '');
});
$('#remove-group-avatar')?.addEventListener('click', () => {
  pendingGroupAvatarFile = null;
  removeGroupAvatarRequested = true;
  const input = $('#group-avatar-file'); if (input) input.value = '';
  const preview = $('#group-edit-avatar-preview');
  if (preview?.dataset.objectUrl) { URL.revokeObjectURL(preview.dataset.objectUrl); delete preview.dataset.objectUrl; }
  avatarInto(preview, currentConversationData?.name || 'Grupo', null, 'group');
  setModalMessage('group-settings-message', 'La foto se quitará al guardar los cambios.', '');
});

$('#composer-plus-button')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  toggleAttachmentMenu();
});
$('#upload-chat-attachment')?.addEventListener('click', event => {
  event.preventDefault();
  closeAttachmentMenu();
  $('#chat-attachment-input')?.click();
});
$('#chat-attachment-input')?.addEventListener('change', event => {
  const input = event.target;
  const file = input.files?.[0];
  if (file) setPendingChatAttachment(file);
  input.value = '';
});
$('#remove-chat-attachment')?.addEventListener('click', () => clearPendingChatAttachment(true));
$('#message-input')?.addEventListener('paste', event => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find(item => String(item.type || '').startsWith('image/'));
  const file = imageItem?.getAsFile?.();
  if (file) {
    event.preventDefault();
    setPendingChatAttachment(file);
  }
});
for (const dropTarget of [$('#messages'), $('#message-form')].filter(Boolean)) {
  dropTarget.addEventListener('dragover', event => {
    const hasImage = [...(event.dataTransfer?.items || [])].some(item => item.kind === 'file' && String(item.type || '').startsWith('image/'));
    if (hasImage) { event.preventDefault(); $('#main-screen .center-pane')?.classList.add('chat-drag-over'); }
  });
  dropTarget.addEventListener('dragleave', event => {
    if (!dropTarget.contains(event.relatedTarget)) $('#main-screen .center-pane')?.classList.remove('chat-drag-over');
  });
  dropTarget.addEventListener('drop', event => {
    $('#main-screen .center-pane')?.classList.remove('chat-drag-over');
    const file = [...(event.dataTransfer?.files || [])].find(item => String(item.type || '').startsWith('image/'));
    if (file) { event.preventDefault(); setPendingChatAttachment(file); }
  });
}

$('#message-form')?.addEventListener('submit', event => { event.preventDefault(); void sendMessage(); });
$('#message-input')?.addEventListener('input', () => {
resizeMessageInput();
const value = String($('#message-input').value || '').trim();
currentMentionIds.clear(); // mentions are recalculated from current text on send
mentionEverywhere = false;
updateMentionPicker();
updateSendState();
updateKeyboardSuggestions();
if (value) scheduleTyping(); else stopTypingBroadcast();
});
$('#message-input')?.addEventListener('keydown', event => {
const picker=$('#mention-picker');
if(!picker.classList.contains('hidden')){
const items=$$('.mention-item',picker);
if(event.key==='ArrowDown'){event.preventDefault();mentionPickerIndex=Math.min(mentionPickerIndex+1,items.length-1);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
if(event.key==='ArrowUp'){event.preventDefault();mentionPickerIndex=Math.max(mentionPickerIndex-1,0);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
if(event.key==='Enter'&&!event.shiftKey&&items.length){event.preventDefault();items[mentionPickerIndex]?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return;}
if(event.key==='Escape'){picker.classList.add('hidden');return;}
}
if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!sendInFlight) void sendMessage(); }
});
$('#message-input')?.addEventListener('blur', () => stopTypingBroadcast());
$('#messages')?.addEventListener('scroll',()=>{const box=$('#messages');if(!currentConversation||!box)return;if(box.scrollHeight-box.scrollTop-box.clientHeight<12){const c=conversationCache.find(x=>String(x.id)===String(currentConversation));if(c&&(Number(c.unread_count)||c.has_mention)){void supabase.rpc('xifre_mark_read',{p_conversation_id:currentConversation}).then(()=>{c.unread_count=0;c.has_mention=false;renderConversations();});}}});

document.addEventListener('keydown', event => {
if (event.key === 'Escape') {
if (platformBoxOpeningBusy && !$('#box-opening-modal')?.classList.contains('hidden')) {event.stopImmediatePropagation();return;}
if (!$('#external-link-modal')?.classList.contains('hidden')) return closeExternalLinkWarning();
if (!$('#emoji-picker-popover')?.classList.contains('hidden')) return closeEmojiPicker();
if (!$('#message-menu').classList.contains('hidden')) return closeMessageMenu();
if (!$('#confirm-modal').classList.contains('hidden')) return finishConfirm(false);
if (!$('#settings-modal').classList.contains('hidden')) return $('#settings-modal').classList.add('hidden');
$$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
}
});

window.addEventListener('blur',()=>{if(!currentUser)return; void trackPresence(true);});
window.addEventListener('focus',()=>{if(!currentUser)return;presenceActivityAt=Date.now();void trackPresence(true);});
window.addEventListener('pagehide',()=>{try{if(presenceChannel)void presenceChannel.untrack();}catch(_){} });
document.addEventListener('visibilitychange', () => {
if (!currentUser) return;
if (document.visibilityState === 'visible') presenceActivityAt = Date.now();
void trackPresence(true);
renderPresenceIndicators();
if (document.visibilityState !== 'visible') return;
void loadConversations().then(async () => {
  if (currentConversation) {
    const fresh = conversationCache.find(c => String(c.id) === String(currentConversation));
    if (fresh) currentConversationData = fresh;
    // Refresh in place. Do not reopen the chat or reset its scroll position.
    await loadMessages(currentConversation, false).catch(() => {});
    updateChatHeader();
    renderRightPane();
    return;
  }
  await restoreConversation();
}).catch(() => {});
});

window.addEventListener('beforeunload', () => {
if (currentConversation) sessionStorage.setItem('xifre_current_conversation', String(currentConversation));
});
platformBindEvents();
}


/* ========================================================================
   XIFRE ALPHA 1 — PLATFORM / SYSTEM APPS / INVENTORY / TRADING
   Extension built on top of the V21.2 chat. Chat code above remains intact.
   All privileged writes are performed by SECURITY DEFINER RPCs in SQL.
   ======================================================================== */
const XIFRE_SYSTEM_MEDIA_BUCKET = 'xifre-system-media';
const XIFRE_SYSTEM_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const XIFRE_SYSTEM_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const XIFRE_RARITIES = {
  comun: { label: 'Común', className: 'common' },
  poco_comun: { label: 'Poco común', className: 'uncommon' },
  raro: { label: 'Raro', className: 'rare' },
  epico: { label: 'Épico', className: 'epic' },
  legendario: { label: 'Legendario', className: 'legendary' },
  mitico: { label: 'Mítico', className: 'mythic' },
  divino: { label: 'Divino', className: 'divine' }
};

/* Alpha 1.5: one shared definition per item, and a tier per INVENTORY INSTANCE. */
const platformItemDefinitions = new Map();
const platformInstanceFeatures = new Map();
const platformOwnedItemTypes = new Set();
const platformEmojiCodes = new Map();
let platformFeaturesLoadedAt = 0;
let platformFeaturesPromise = null;
const PLATFORM_GRADE_NAMES = ['Normal', 'Dorado', 'Neón'];
function platformGradeName(tier) {return PLATFORM_GRADE_NAMES[Math.max(0,Math.min(2,Number(tier)||0))];}
function platformTypeId(item) {return String(item?.item_id || item?.id || '');}
function platformHydrateItem(row) {
  const typeId=platformTypeId(row);
  const definition=platformItemDefinitions.get(typeId)||{};
  const instance=platformInstanceFeatures.get(platformItemKey(row))||{};
  const tier=Number(row.upgrade_tier ?? instance.upgrade_tier ?? 0);
  const value=Number(tier===1 ? (definition.gold_value ?? row.value ?? 0) : tier===2 ? (definition.neon_value ?? row.value ?? 0) : (definition.value ?? row.value ?? 0));
  // La definición del tipo puede no tener URL (las imágenes solo se firman
  // previamente para los objetos configurados como emoji). No permitir que
  // ese valor vacío sobrescriba la URL firmada de esta copia del inventario.
  const {id:ignored,image_url:definitionImageUrl,...features}=definition;
  return {...row,...features,upgrade_tier:tier,value,base_value:Number(definition.value ?? row.value ?? 0),
    image_url:row.image_url || definitionImageUrl || '',
    reserved:Boolean(row.reserved||instance.gift_reserved),gift_reserved:Boolean(instance.gift_reserved),
    instant_sell_cents:Number(row.instant_sell_cents ?? definition.instant_sell_cents ?? 1)};
}
async function platformLoadItemFeatures(force=false){
  if(!currentUser || !supabase)return;
  if(!force && platformFeaturesLoadedAt && Date.now()-platformFeaturesLoadedAt<18000)return;
  if(platformFeaturesPromise)return platformFeaturesPromise;
  const uid=String(currentUser.id),generation=platformSessionGeneration;
  platformFeaturesPromise=(async()=>{
    const {data,error}=await supabase.rpc('xifre_item_features');
    if(error){console.warn('XIFRE ITEM FEATURES',error);return;}
    if(!currentUser||String(currentUser.id)!==uid||generation!==platformSessionGeneration)return;
    const rows=Array.isArray(data?.items)?data.items:[];
    const signed=await platformSignImagePaths(rows.filter(row=>row.emoji_enabled).map(row=>row.image_path));
    if(!currentUser||String(currentUser.id)!==uid||generation!==platformSessionGeneration)return;
    platformItemDefinitions.clear();platformInstanceFeatures.clear();platformOwnedItemTypes.clear();platformEmojiCodes.clear();
    rows.forEach(row=>{
      const defined={...row,image_url:signed.get(row.image_path)||''};
      platformItemDefinitions.set(String(row.id),defined);
      if(row.emoji_enabled && row.emoji_shortcode)platformEmojiCodes.set(String(row.emoji_shortcode).toLowerCase(),defined);
    });
    (data.instances||[]).forEach(row=>platformInstanceFeatures.set(String(row.instance_id),row));
    (data.owned_item_ids||[]).forEach(id=>platformOwnedItemTypes.add(String(id)));
    platformFeaturesLoadedAt=Date.now();
  })().finally(()=>{platformFeaturesPromise=null;});
  return platformFeaturesPromise;
}
function platformAvailableCopies(itemId,tier){
 return platformInventoryItems.filter(row=>platformTypeId(row)===String(itemId) && Number(row.upgrade_tier||0)===tier && !row.reserved);
}
function platformGradeClass(item){const tier=Number(item?.upgrade_tier||0);return tier===2?'xifre-grade-neon':tier===1?'xifre-grade-gold':'';}
function platformGradeTag(item){const tier=Number(item?.upgrade_tier||0);return tier?`<span class="xifre-grade-tag">${tier===2?'✺ NEÓN':'✦ DORADO'}</span>`:'';}
function platformItemEmojiHtml(sourceHtml){
 if(!platformEmojiCodes.size||!sourceHtml.includes(':xi_'))return sourceHtml;
 return sourceHtml.replace(/(^|>)([^<]*)(?=<|$)/g,(part,prefix,text)=>prefix+text.replace(/:xi_([a-z][a-z0-9_]{1,25}):/gi,(token,code)=>{
   const item=platformEmojiCodes.get(code.toLowerCase());
   return item?.image_url?`<img class="xifre-chat-item-emoji" src="${esc(item.image_url)}" alt="${esc(item.name)}" title="${esc(item.name)} · ${esc(platformRarity(item).label)}" loading="lazy">`:token;
 }));
}

let isXifreAdmin = false;
let platformOwnerId = null;
let platformApps = [];
let platformActiveApp = 'chat';
let platformClockTimer = null;
let platformTradeTimer = null;
let platformTradeDetailTimer = null;
let platformInventoryTimer = null;
let platformTradeChannel = null;
let platformInventoryItems = [];
let platformAdminItems = [];
let platformTrades = [];
let platformTradeIdsSeen = new Set();
let platformTradeNotifications = new Map();
let platformActiveTradeId = null;
let platformActiveTradeDetail = null;
let platformTradeRefreshBusy = false;
let platformTradeDetailBusy = false;
let platformSessionGeneration = 0;
let platformInventoryLoadBusy = false;
let platformInventoryRefreshQueued = false;
let platformAdminLoadBusy = false;
let platformAdminRecipient = null;
let platformAdminSearchTimer = null;
let platformAdminSearchResults = [];
let platformAdminEditingItemId = null;
let platformAdminEditingItemImagePath = null;
let platformAdminItemPreviewUrl = null;
let platformReleaseRecords = [];
let platformReleaseEditingId = null;
let platformReleaseImagePath = null;
let platformReleaseImagePreviewUrl = null;
let platformReleaseLoadBusy = false;
let platformDisplayVersionTimer = null;
let platformVersionWarned = false;
const platformImageSignedUrlCache = new Map();
let platformInventoryRenderKey = '';
let platformTradeListRenderKey = '';
let platformTradeDraftTradeId = null;
let platformTradeOfferDraft = null;
let platformTradeOfferDraftDirty = false;
let platformTradeOfferMutationBusy = false;
let platformTradeOfferRevision = 0;
let platformTradeOfferRetryNeeded = false;
let platformTradeMutationTicket = 0;
let platformTradeDetailQueued = false;
let platformTradeDetailRenderKey = '';
let platformTradeOpenSequence = 0;
let platformBoxIds = new Set();
let platformBoxInstances = new Set();
let platformShopListings = [];
let platformShopOwner = false;
let platformShopEditingId = null;
let platformShopBuying = new Set();
let platformWalletBalance = 0;
let platformWalletTimer = null;
let platformWalletLoading = false;
let platformWalletAccumulated = 0;
let platformWalletTickAt = Date.now();
let platformWalletActivityAt = Date.now();
let platformShopSearchTimer = null;
let platformShopSearchRows = [];
let platformShopSelectedRecipient = null;
let platformBoxOpeningBusy = false;
let platformBoxSpinTimer = null;
let platformBoxSpinToken = 0;
let platformDetailsSequence = 0;



function platformSetMessage(id, message, type = '') {
  const node = $(`#${id}`);
  if (!node) return;
  node.textContent = String(message || '');
  node.className = `admin-form-message${type ? ` ${type}` : ''}`;
}

function platformRarity(item) {
  const key = String(item?.rarity || 'comun');
  return XIFRE_RARITIES[key] || XIFRE_RARITIES.comun;
}

function platformFormatValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(number) : '0';
}

async function platformLoadDisplayVersion() {
  if (!currentUser || !supabase) return;
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  const { data, error } = await supabase.from('xifre_platform_settings').select('display_version').eq('id', 1).maybeSingle();
  if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
  if (error) {
    // Keep the default visible if the small SQL migration hasn't been installed yet.
    if (!platformVersionWarned) console.info('XIFRE VERSION: aplica la migración de configuración.', error.message);
    platformVersionWarned = true;
    return;
  }
  platformVersionWarned = false;
  const version = String(data?.display_version || 'Alpha 1').trim() || 'Alpha 1';
  setText('appbar-version', version.toLocaleUpperCase('es-ES'));
  const editor = $('#platform-display-version');
  if (isXifreAdmin && editor && document.activeElement !== editor) editor.value = version;
}

async function platformSaveDisplayVersion(event) {
  event.preventDefault();
  if (!isXifreAdmin || !currentUser) return;
  const button = $('#platform-version-save');
  const version = String($('#platform-display-version')?.value || '').trim();
  if (!version || version.length > 40) return platformSetMessage('platform-version-message', 'Escribe una versión de entre 1 y 40 caracteres.', 'error');
  setLoading(button, true);
  try {
    const { data, error } = await supabase.rpc('xifre_admin_set_display_version', { p_version: version });
    if (error) throw error;
    setText('appbar-version', String(data || version).toLocaleUpperCase('es-ES'));
    platformSetMessage('platform-version-message', 'Versión actualizada para todos los usuarios.', 'success');
    toast('Versión de XIFRE actualizada.', 'success');
  } catch (error) {
    platformSetMessage('platform-version-message', `${friendlyError(error)}. Comprueba que has ejecutado el SQL nuevo.`, 'error');
  } finally {
    setLoading(button, false);
  }
}

function platformApplyMarkup(host, markup) {
  if (!host) return;
  if (host.__xifreMarkup === markup) return;
  const oldScrollTop = host.scrollTop;
  host.innerHTML = markup;
  host.__xifreMarkup = markup;
  if (oldScrollTop) host.scrollTop = oldScrollTop;
}

function platformItemKey(item) {
  return String(item?.instance_id || item?.id || '');
}

function platformGroupSignature(item) {
  // The grouping compares the full public item definition, not just its display name.
  return JSON.stringify([String(item.name || ''),String(item.description || ''),String(item.rarity || ''),
    String(item.value ?? 0),String(item.image_path || ''),Boolean(platformItemIsBox(item)),String(item.item_id||item.id||''),Number(item.upgrade_tier||0)]);
}
function platformGroupItems(items) {
  const groups = new Map();
  for (const item of items) {
    const signature = platformGroupSignature(item);
    if (!groups.has(signature)) groups.set(signature,{item,items:[],count:0,signature});
    const group = groups.get(signature); group.items.push(item); group.count++;
  }
  return [...groups.values()];
}
function platformItemIsBox(item) {
  const instance = platformItemKey(item);
  return Boolean(item?.is_box || platformBoxInstances.has(instance) || platformBoxIds.has(String(item?.item_id || item?.id || '')));
}
function platformItemCardMarkup(item, { mode = 'collection', disabled = false, selected = false, count = 1 } = {}) {
  const rarity = platformRarity(item);
  const instanceId = platformItemKey(item);
  const image = platformImageMarkup(item.image_url,item.name);
  const boxIcon = platformItemIsBox(item) ? '<span class="mini-item-box" title="Caja consumible">✦ CAJA</span>' : '';
  const numericValue = Number(item?.value) || 0;
  const valueGlow = numericValue >= 5000 ? 'value-precious' : numericValue >= 1000 ? 'value-high' : '';
  const gradeClass=platformGradeClass(item),gradeBadge=platformGradeTag(item);
  if (mode === 'trade') {
    return `<div class="trade-select-item xifre-mini-item rarity-${esc(rarity.className)} ${gradeClass} ${valueGlow} ${selected ? 'is-offered' : ''} ${disabled ? 'is-locked' : ''}" data-trade-tile="${esc(instanceId)}">
      ${count>1?`<span class="mini-item-quantity">×${count}</span>`:''}${gradeBadge}
      <button class="trade-select-hitarea" type="button" data-trade-toggle="${esc(instanceId)}" aria-pressed="${selected}" ${disabled?'disabled':''} title="Añadir una copia">
        <span class="mini-item-image">${image}</span><span class="mini-item-name">${esc(item.name)}</span><strong class="mini-item-value">${esc(platformFormatValue(item.value))}</strong><span class="mini-item-selection">+ Ofrecer</span>
      </button><button class="mini-item-info" type="button" data-open-item="${esc(instanceId)}" data-item-source="trade" aria-label="Detalles">ⓘ</button>
      <button class="mini-item-minus hidden" type="button" data-trade-remove-group="${esc(instanceId)}" aria-label="Quitar una copia">−</button>
    </div>`;
  }
  return `<button type="button" class="inventory-item-card xifre-mini-item rarity-${esc(rarity.className)} ${gradeClass} ${valueGlow} ${item.reserved?'is-reserved':''}" data-open-item="${esc(instanceId)}" data-item-source="collection" title="Detalles de ${esc(item.name)}">
    ${count>1?`<span class="mini-item-quantity">×${count}</span>`:''}${boxIcon}${gradeBadge}
    <span class="mini-item-image">${image}</span><span class="mini-item-name">${esc(item.name)}</span><strong class="mini-item-value">${esc(platformFormatValue(item.value))}</strong>
  </button>`;
}

function platformFindItemForDetails(key, source) {
  const list = source === 'admin' ? platformAdminItems : (source === 'trade'
    ? [...platformInventoryItems, ...(platformActiveTradeDetail?.offers || [])]
    : platformInventoryItems);
  return list.find(item => platformItemKey(item) === String(key)) || null;
}

function platformOpenItemDetails(key, source = 'collection') {
  const item = platformFindItemForDetails(key,source);
  if (!item) return toast('Ese objeto ya no está disponible.', 'info');
  const rarity = platformRarity(item);
  const modal = $('#item-details-modal');
  modal.className = `modal hidden rarity-${rarity.className} ${platformGradeClass(item)}`;
  const hero = $('#item-details-hero');
  if (hero) hero.innerHTML = platformImageMarkup(item.image_url,item.name);
  setText('item-details-name', item.name || 'Objeto');
  setText('item-details-value',platformFormatValue(item.value));
  setText('item-details-rarity',rarity.label);
  setText('item-details-description',item.description || 'Sin descripción.');
  platformDrawItemExtras(item,source);
  const matching = source === 'collection' ? platformInventoryItems.filter(x => platformGroupSignature(x) === platformGroupSignature(item)) : [];
  setText('item-details-status',source==='collection' ? `En tu colección: ${matching.length} ${matching.length===1?'copia':'copias'}.` : source==='admin' ? 'Objeto del catálogo XIFRE.' : 'Objeto mostrado en intercambio.');
  const preview = $('#item-box-preview');
  platformDetailsSequence++;
  preview?.classList.add('hidden');
  const button = $('#item-open-box-button');
  button?.classList.add('hidden');
  button?.removeAttribute('data-box-instance');
  if (platformItemIsBox(item)) void platformRenderBoxPreview(item,source);
  openModal('item-details-modal');
}



/* Alpha 1.5 — Gift cards belong to normal chat messages and never contain client-side ownership transfers. */
let platformChatGifts = new Map();
let platformGiftChatId = '';
let platformGiftLastLoaded = 0;
let platformGiftPromise = null;
let platformGiftPollTimer = null;
let platformGiftSending = false;
let platformGiftSendRequest = null;
const PLATFORM_GIFT_RE=/^\[\[XIFRE_GIFT:([0-9a-f-]{36})\]\]$/i;
function platformGiftCardMarkup(id){
 const gift=platformChatGifts.get(String(id));
 if(!gift)return `<div class="xifre-gift-card xifre-gift-pending" data-xifre-gift="${esc(id)}"><span>🎁</span><strong>${platformGiftChatId===String(currentConversation)?'Regalo no disponible':'Cargando regalo de XIFRE…'}</strong></div>`;
 const rarity=platformRarity(gift),status=gift.status||'open',mine=String(gift.sender_id)===String(currentUser?.id);
 const state=status==='open'?'<span class="xi-gift-open">DISPONIBLE</span>':status==='claimed'?'<span class="xi-gift-claimed">RECLAMADO</span>':'<span class="xi-gift-cancelled">CANCELADO</span>';
 const giftStamp=[gift.status,gift.claimed_by,gift.item_id,gift.upgrade_tier].join(':');
 const claimant=(currentMembers||[]).find(m=>getMemberId(m)===String(gift.claimed_by));
 const who=claimant?.username||'alguien';
 const disabled=!!platformGiftSending;
 return `<div class="xifre-gift-card rarity-${esc(rarity.className)} ${platformGradeClass(gift)}" data-xifre-gift="${esc(id)}" data-gift-stamp="${esc(giftStamp)}">
  <div class="xi-gift-heading"><span>🎁 REGALO DE XIFRE</span>${state}</div>
  <div class="xi-gift-middle"><div class="xi-gift-art">${platformImageMarkup(gift.image_url,gift.name)}</div><div><strong>${esc(gift.name)}</strong><small>${esc(rarity.label)} · ${esc(platformGradeName(gift.upgrade_tier))}</small><b>Valor ${esc(platformFormatValue(gift.value))}</b></div></div>
  ${status==='open'?(mine?`<button type="button" class="xi-gift-button secondary" data-gift-cancel="${esc(id)}" ${disabled?'disabled':''}>Cancelar regalo</button>`:`<button type="button" class="xi-gift-button" data-gift-claim="${esc(id)}" ${disabled?'disabled':''}>🎁 ¡Reclamar regalo!</button>`)
   :`<p class="xi-gift-result">${status==='claimed'?`Este regalo ya lo ha reclamado ${esc(who)}.`:'Este regalo ha sido cancelado.'}</p>`}
 </div>`;
}
async function platformLoadChatGifts(force=false){
 if(!currentUser||!currentConversation)return;
 const id=String(currentConversation),owner=String(currentUser.id);
 if(!force && id===platformGiftChatId && Date.now()-platformGiftLastLoaded<5000)return;
 if(platformGiftPromise){await platformGiftPromise; if(platformGiftChatId!==id && String(currentConversation)===id)return platformLoadChatGifts(true);return;}
 platformGiftPromise=(async()=>{
  const {data,error}=await supabase.rpc('xifre_chat_gifts_in_chat',{p_conversation_id:id});
  if(error){console.warn('XIFRE GIFTS',error);return;}
  if(!currentUser||String(currentUser.id)!==owner||String(currentConversation)!==id)return;
  const rows=Array.isArray(data)?data:[];
  const urls=await platformSignImagePaths(rows.map(row=>row.image_path));
  if(String(currentConversation)!==id)return;
  platformChatGifts=new Map(rows.map(row=>[String(row.id),{...row,image_url:urls.get(row.image_path)||''}]));
  platformGiftChatId=id;platformGiftLastLoaded=Date.now();
  $$('#messages [data-xifre-gift]').forEach(node=>{
   const id=node.dataset.xifreGift;
   const gift=platformChatGifts.get(id);
   const stamp=gift?[gift.status,gift.claimed_by,gift.item_id,gift.upgrade_tier].join(':'):'';
   if(node.dataset.giftStamp!==stamp)node.outerHTML=platformGiftCardMarkup(id);
  });
  // The initial skeleton does not always have data-xifre-gift until content is loaded.
  $$('#messages .xifre-gift-pending').forEach(node=>{
   const parent=node.closest('.message-caption');
   const id=parent?.dataset.giftId;
   if(id)node.outerHTML=platformGiftCardMarkup(id);
  });
 })().finally(()=>{platformGiftPromise=null;});
 return platformGiftPromise;
}
function platformOpenGiftPicker(){
 if(!currentConversation)return toast('Abre una conversación antes de enviar un regalo.','info');
 platformDrawGiftPicker();openModal('chat-gift-modal');
 if(!platformInventoryItems.length)void platformRefreshInventory().then(platformDrawGiftPicker);
}
function platformDrawGiftPicker(){
 const grid=$('#chat-gift-grid');if(!grid)return;
 const available=platformInventoryItems.filter(item=>!item.reserved);
 const groups=platformGroupItems(available);
 grid.innerHTML=groups.length?groups.map(group=>{
   const item=group.item,rarity=platformRarity(item);
   return `<button type="button" class="xi-gift-picker-item rarity-${esc(rarity.className)} ${platformGradeClass(item)}" data-gift-pick="${esc(platformItemKey(item))}">
    ${group.count>1?`<span class="mini-item-quantity">×${group.count}</span>`:''}<span class="xi-gift-picker-art">${platformImageMarkup(item.image_url,item.name)}</span><strong>${esc(item.name)}</strong><small>${esc(rarity.label)} · ${esc(platformGradeName(item.upgrade_tier))}</small><b>${esc(platformFormatValue(item.value))}</b>
   </button>`;
 }).join(''):'<p class="inventory-inline-empty">No tienes objetos libres para regalar. Los publicados o reservados no pueden enviarse.</p>';
 setText('chat-gift-status','');
}
async function platformSendChatGift(instanceId){
 if(platformGiftSending||!currentConversation)return;
 const item=platformInventoryItems.find(i=>platformItemKey(i)===String(instanceId)&&!i.reserved);
 if(!item)return toast('Esta copia ya no está disponible.','error');
 const conversation=String(currentConversation);
 const yes=await askConfirm('Enviar regalo',`¿Regalar ${item.name} (${platformGradeName(item.upgrade_tier)}) en este chat? La primera persona que lo reclame se lo quedará.`, 'Enviar regalo');
 if(!yes)return;
 platformGiftSending=true;
 const request=platformGiftSendRequest?.instanceId===instanceId && platformGiftSendRequest?.conversation===conversation
  ?platformGiftSendRequest.id:crypto.randomUUID();
 platformGiftSendRequest={instanceId,conversation,id:request};
 try{
  const {error}=await supabase.rpc('xifre_send_gift',{p_conversation_id:conversation,p_instance_id:instanceId,p_request_id:request});
  if(error)throw error;
  platformGiftSendRequest=null;
  closeModal('chat-gift-modal');
  await platformLoadItemFeatures(true);
  await Promise.allSettled([platformRefreshInventory(),loadMessages(conversation,false)]);
  await platformLoadChatGifts(true);
  toast('Regalo publicado. La primera persona que lo reclame se lo llevará.','success');
 }catch(error){toast(friendlyError(error),'error');setText('chat-gift-status',friendlyError(error));}
 finally{platformGiftSending=false;}
}
async function platformActionChatGift(id,action){
 if(platformGiftSending)return;
 const gift=platformChatGifts.get(String(id));if(!gift||gift.status!=='open')return;
 if(action==='cancel'){
  if(String(gift.sender_id)!==String(currentUser?.id))return;
  if(!await askConfirm('Cancelar regalo','¿Cancelar el regalo y recuperar la copia que habías reservado?', 'Cancelar regalo'))return;
 }
 platformGiftSending=true;
 try{
  const rpc=action==='cancel'?'xifre_cancel_gift':'xifre_claim_gift';
  const args=action==='cancel'?{p_gift_id:id}:{p_gift_id:id};
  const {data,error}=await supabase.rpc(rpc,args);if(error)throw error;
  if(action==='claim' && data?.claimed===false)toast('Alguien ya ha reclamado este regalo.','info');
  else toast(action==='claim'?'¡Has conseguido el regalo!':'Regalo cancelado.','success');
  await platformLoadItemFeatures(true);
  await Promise.allSettled([platformRefreshInventory(),platformLoadChatGifts(true)]);
 }catch(error){toast(friendlyError(error),'error');await platformLoadChatGifts(true);}
 finally{platformGiftSending=false;}
}

function platformDrawItemExtras(item,source){
 const extras=$('#item-details-extras'),upgrades=$('#item-details-upgrades'),sell=$('#item-instant-sell');
 const feature=platformItemDefinitions.get(platformTypeId(item))||item;
 const rarity=platformRarity(item);
 const bits=[];
 if(Number(item.upgrade_tier||0)>0)bits.push(`<div class="item-feature-row"><span>Acabado</span><strong class="${platformGradeClass(item)}">${esc(platformGradeName(item.upgrade_tier))}</strong></div>`);
 if(feature.show_series && feature.series_name)bits.push(`<div class="item-feature-row"><span>Serie / saga</span><strong>${esc(feature.series_name)}</strong></div>`);
 if(feature.show_source_box && feature.source_box_id){
  const origin=platformItemDefinitions.get(String(feature.source_box_id));
  if(origin)bits.push(`<div class="item-feature-row"><span>Procedencia</span><strong>✦ Caja ${esc(origin.name)}</strong></div>`);
 }
 if(feature.emoji_enabled)bits.push(`<div class="item-feature-row"><span>Uso especial</span><strong>Emoji :xi_${esc(feature.emoji_shortcode)}:</strong></div>`);
 if(extras){extras.innerHTML=bits.join('');extras.classList.toggle('hidden',!bits.length);}
 if(upgrades){
  upgrades.innerHTML='';upgrades.classList.add('hidden');
  if(source==='collection' && feature.upgrade_enabled && !platformItemIsBox(item) && Number(item.upgrade_tier)<2){
   const target=Number(item.upgrade_tier)+1;
   const needed=Number(target===1?feature.gold_required:feature.neon_required);
   const available=platformAvailableCopies(platformTypeId(item),target-1).length;
   const resultValue=Number(target===1?feature.gold_value:feature.neon_value);
   const label=target===1?'Dorado':'Neón';
   upgrades.innerHTML=`<div class="item-upgrade-panel ${target===2?'xifre-grade-neon':'xifre-grade-gold'}"><strong>✦ Mejorar a ${label}</strong><p>Combina ${needed} copias ${target===1?'normales':'doradas'} del mismo objeto. Disponibles: <b>${available}/${needed}</b>.</p><p>Valor resultante: <b>${esc(platformFormatValue(resultValue))}</b> · La rareza original se mantiene.</p><button type="button" class="inventory-primary-button" data-upgrade-item="${esc(platformTypeId(item))}" data-upgrade-target="${target}" ${available<needed?'disabled':''}>Mejorar a ${label}</button></div>`;
   upgrades.classList.remove('hidden');
  }
 }
 if(sell){
   const free=source==='collection'?platformInventoryItems.find(x=>platformGroupSignature(x)===platformGroupSignature(item)&&!x.reserved):null;
   sell.classList.toggle('hidden',!free);
   if(free){sell.dataset.sellInstance=platformItemKey(free);sell.textContent=`⚡ Venta rápida · ${platformMoney(feature.instant_sell_cents??1)}`;}
   else sell.removeAttribute('data-sell-instance');
 }
}
async function platformUpgradeItem(itemId,tier){
 const definition=platformItemDefinitions.get(String(itemId));
 if(!definition || ![1,2].includes(Number(tier)))return;
 const required=Number(tier===1?definition.gold_required:definition.neon_required);
 const available=platformAvailableCopies(itemId,Number(tier)-1).length;
 if(available<required)return toast('No tienes suficientes copias libres.','info');
 const target=platformGradeName(tier);
 const confirmed=await askConfirm(`Mejora ${target}`,`Se utilizarán ${required} copias ${tier===1?'normales':'doradas'} de ${definition.name} para crear 1 copia ${target}. No se puede deshacer.`, 'Confirmar mejora');
 if(!confirmed)return;
 const button=$(`[data-upgrade-item="${CSS.escape(String(itemId))}"]`);
 if(button?.disabled)return; if(button)button.disabled=true;
 try{
  const {data,error}=await supabase.rpc('xifre_upgrade_item',{p_item_id:itemId,p_target_tier:Number(tier)});
  if(error)throw error;
  closeModal('item-details-modal');
  await platformLoadItemFeatures(true);
  await Promise.all([platformRefreshInventory(),platformLoadMarket(true)]);
  toast(`¡${definition.name} mejorado a ${target}! Valor: ${platformFormatValue(data?.value)}.`, 'success');
 }catch(error){toast(friendlyError(error),'error');if(button)button.disabled=false;}
}
function platformPopulateOriginBoxSelect(){
 const select=$('#admin-item-origin-box');if(!select)return;
 const previous=select.value;
 select.innerHTML='<option value="">Ninguna / no indicar</option>'+platformAdminItems.filter(item=>item.is_box).map(box=>`<option value="${esc(box.id)}">${esc(box.name)}</option>`).join('');
 if(previous && select.querySelector(`option[value="${CSS.escape(previous)}"]`))select.value=previous;
}
function platformPopulateItemFeatureEditor(item){
 const field=(id,value)=>{const el=$('#'+id);if(el)el.value=value??'';};
 const checkbox=(id,value)=>{const el=$('#'+id);if(el)el.checked=Boolean(value);};
 field('admin-item-series',item?.series_name||'');checkbox('admin-item-show-series',item?.show_series);
 platformPopulateOriginBoxSelect();field('admin-item-origin-box',item?.source_box_id||'');checkbox('admin-item-show-origin',item?.show_source_box);
 checkbox('admin-item-upgradable',item?.upgrade_enabled);field('admin-item-gold-count',item?.gold_required||3);
 field('admin-item-gold-value',item?.gold_value??0);field('admin-item-neon-count',item?.neon_required||3);field('admin-item-neon-value',item?.neon_value??0);
 checkbox('admin-item-emoji-enabled',item?.emoji_enabled);field('admin-item-emoji-code',item?.emoji_shortcode||'');
}
async function platformAdminSaveItemFeatures(id){
 const i=n=>$('#admin-item-'+n), enabled=i('emoji-enabled')?.checked;
 const payload={
  p_item_id:id,p_series_name:String(i('series')?.value||'').trim(),p_show_series:!!i('show-series')?.checked,
  p_source_box_id:i('origin-box')?.value||null,p_show_source_box:!!i('show-origin')?.checked,
  p_upgrade_enabled:!!i('upgradable')?.checked,p_gold_required:Number(i('gold-count')?.value||3),
  p_gold_value:Number(i('gold-value')?.value||0),p_neon_required:Number(i('neon-count')?.value||3),
  p_neon_value:Number(i('neon-value')?.value||0),p_emoji_enabled:!!enabled,
  p_emoji_shortcode:enabled?String(i('emoji-code')?.value||'').toLowerCase().trim():''
 };
 if(![payload.p_gold_required,payload.p_neon_required,payload.p_gold_value,payload.p_neon_value].every(v=>Number.isSafeInteger(v) && v>=0))
  throw new Error('Los requisitos y valores de los upgrades deben ser números enteros válidos.');
 if(payload.p_upgrade_enabled && (payload.p_gold_required<2||payload.p_neon_required<2))throw new Error('Cada upgrade debe necesitar al menos dos copias.');
 if(enabled&&!/^[a-z][a-z0-9_]{1,25}$/.test(payload.p_emoji_shortcode))throw new Error('El código del emoji debe tener 2-26 caracteres, empezar con letra y no contener espacios.');
 const {error}=await supabase.rpc('xifre_admin_item_features',payload);
 if(error)throw error;
}

function platformUpdateClock() {
  const now = new Date();
  const dateNode = $('#appbar-date');
  const timeNode = $('#appbar-time');
  if (dateNode) dateNode.textContent = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  if (timeNode) timeNode.textContent = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(now);
}

async function platformInitialize() {
  if (!currentUser || !supabase) return;
  const owner = String(currentUser.id);
  if (platformOwnerId === owner && platformTradeChannel) {
    await platformLoadSystemApps();
    platformUpdateClock();
    return;
  }
  platformStop();
  platformOwnerId = owner;
  const generation = platformSessionGeneration;
  isXifreAdmin = false;
  const adminResult = await supabase.rpc('xifre_is_admin');
  if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
  if (adminResult.error) {
    console.warn('XIFRE PLATFORM ADMIN CHECK', adminResult.error);
  } else {
    isXifreAdmin = adminResult.data === true;
  }
  $('#app-admin-button')?.classList.toggle('hidden', !isXifreAdmin);
  $('#inventory-admin-nav-group')?.classList.toggle('hidden', !isXifreAdmin);
  $('#release-admin-editor')?.classList.toggle('hidden', !isXifreAdmin);
  await platformLoadBoxMeta();
  await platformLoadItemFeatures();
  await platformLoadSystemApps();
  if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
  void platformLoadReleases();
  platformShopOwner = isXifreAdmin && String(currentUser.email || '').toLowerCase() === 'samuelgil@vedrunaimmaculada.cat';
  $('#shop-admin')?.classList.toggle('hidden',!platformShopOwner);
  void platformLoadWallet(true);
  platformStartWalletTimer();
  platformUpdateClock();
  void platformLoadDisplayVersion();
  if (platformMarketRefreshTimer) clearInterval(platformMarketRefreshTimer);
  platformMarketRefreshTimer=setInterval(()=>{
    if(currentUser && String(currentUser.id)===owner && document.visibilityState==='visible'){
      void platformLoadMarket(platformActiveApp==='market');
      if(platformActiveApp!=='shop')void platformLoadShop();
      platformUpdateChatBadges();
    }
  },30000);
  void (async()=>{await platformUiLoad();await platformInlineLoad();})().catch(error=>console.warn('XIFRE UI START',error));
  void platformLoadMarket(false);
  if(platformGiftPollTimer)clearInterval(platformGiftPollTimer);
  platformGiftPollTimer=setInterval(()=>{if(currentUser&&currentConversation&&document.visibilityState==='visible')void platformLoadChatGifts(true);},8000);
  if(currentConversation)void platformLoadChatGifts(true);
  $$('.xifre-edit-launch').forEach(button=>button.remove());
  platformInlinePrepare();
  if (platformDisplayVersionTimer) clearInterval(platformDisplayVersionTimer);
  platformDisplayVersionTimer = setInterval(() => {
    if (currentUser && String(currentUser.id) === owner && document.visibilityState === 'visible') void platformLoadDisplayVersion();
  }, 45000);
  if (platformClockTimer) clearInterval(platformClockTimer);
  platformClockTimer = setInterval(platformUpdateClock, 1000);
  await platformLoadTrades(true).catch(error => console.warn('XIFRE INITIAL TRADES', error));
  platformSetupTradeRealtime();
  if (platformTradeTimer) clearInterval(platformTradeTimer);
  platformTradeTimer = setInterval(() => {
    if (currentUser && String(currentUser.id) === owner && document.visibilityState === 'visible') {
      void platformLoadTrades(false).catch(error => console.warn('XIFRE TRADE POLL', error));
    }
  }, 4500);
  if (platformTradeDetailTimer) clearInterval(platformTradeDetailTimer);
  platformTradeDetailTimer = setInterval(() => {
    if (currentUser && String(currentUser.id) === owner && platformActiveApp === 'inventory' && platformActiveTradeId && document.visibilityState === 'visible') {
      void platformRefreshTradeDetail(false).catch(error => console.warn('XIFRE TRADE DETAIL POLL', error));
    }
  }, 2800);
  if (platformInventoryTimer) clearInterval(platformInventoryTimer);
  platformInventoryTimer = setInterval(() => {
    if (currentUser && String(currentUser.id) === owner && platformActiveApp === 'inventory' && document.visibilityState === 'visible') {
      void platformRefreshInventory().catch(error => console.warn('XIFRE INVENTORY POLL', error));
    }
  }, 15000);
}

function platformStop() {
  platformInlineEndEdit(true);platformInlineData={texts:[],images:[]};platformInlinePrepared=false;
  $$('.xi-inline-pencil,.xi-overlay-image').forEach(node=>node.remove());
  platformSessionGeneration += 1;
  if(platformGiftPollTimer)clearInterval(platformGiftPollTimer);platformGiftPollTimer=null;
  platformChatGifts.clear();platformGiftChatId='';platformGiftLastLoaded=0;platformGiftSendRequest=null;platformGiftSending=false;
  platformItemDefinitions.clear();platformInstanceFeatures.clear();platformOwnedItemTypes.clear();platformEmojiCodes.clear();platformFeaturesLoadedAt=0;
  if (platformClockTimer) clearInterval(platformClockTimer);
  if (platformTradeTimer) clearInterval(platformTradeTimer);
  if (platformTradeDetailTimer) clearInterval(platformTradeDetailTimer);
  if (platformInventoryTimer) clearInterval(platformInventoryTimer);
  if (platformDisplayVersionTimer) clearInterval(platformDisplayVersionTimer);
  if (platformMarketRefreshTimer) clearInterval(platformMarketRefreshTimer);
  platformMarketRefreshTimer=null;
  if (platformWalletTimer) clearInterval(platformWalletTimer);
  platformWalletTimer=null;platformWalletAccumulated=0;platformWalletLoading=false;
  platformBoxSpinToken++;
  if (platformBoxSpinTimer) clearTimeout(platformBoxSpinTimer);
  platformBoxSpinTimer=null;platformBoxOpeningBusy=false;
  platformDisplayVersionTimer = null;
  platformClockTimer = null;
  platformTradeTimer = null;
  platformTradeDetailTimer = null;
  platformInventoryTimer = null;
  const channel = platformTradeChannel;
  platformTradeChannel = null;
  if (channel && supabase) void supabase.removeChannel(channel).catch(error => console.warn('XIFRE TRADE CHANNEL CLEANUP', error));
  for (const timer of platformTradeNotifications.values()) clearTimeout(timer);
  platformTradeNotifications.clear();
  $('#xifre-notification-stack')?.replaceChildren();
  // Never carry the previous account's selected app/admin screen into the next session.
  $('#chat-app-view')?.classList.add('active');
  $('#chat-app-view')?.classList.remove('hidden');
  $('#inventory-app-view')?.classList.remove('active');
  $('#inventory-app-view')?.classList.add('hidden');
  $('#app-chat-button')?.classList.add('active');
  $('#app-inventory-button')?.classList.remove('active');
  $('#app-inventory-button')?.classList.add('hidden');
  $('#app-shop-button')?.classList.remove('active');
  $('#app-shop-button')?.classList.add('hidden');
  $('#app-market-button')?.classList.remove('active');
  $('#app-market-button')?.classList.add('hidden');
  $('#market-app-view')?.classList.remove('active');
  $('#market-app-view')?.classList.add('hidden');
  $('#shop-app-view')?.classList.remove('active');
  $('#shop-app-view')?.classList.add('hidden');
  $('#app-admin-button')?.classList.add('hidden');
  $('#updates-new-dot')?.classList.add('hidden');
  $('#inventory-admin-nav-group')?.classList.add('hidden');
  $('#release-admin-editor')?.classList.add('hidden');
  $('#inventory-panel-collection')?.classList.add('active');
  $('#inventory-panel-trades')?.classList.remove('active');
  $('#inventory-panel-admin')?.classList.remove('active');
  $('#trade-list-view')?.classList.remove('hidden');
  $('#trade-workspace')?.classList.add('hidden');
  platformOwnerId = null;
  isXifreAdmin = false;
  platformApps = [];
  platformActiveApp = 'chat';
  platformInventoryItems = [];
  platformAdminItems = [];
  platformBoxIds=new Set();platformBoxInstances=new Set();
  platformBoxInstanceToItem.clear();platformBoxPreviewCache.clear();platformPurchaseRequestIds.clear();
  platformShopListings=[];platformShopOwner=false;platformShopEditingId=null;platformShopBuying.clear();
  platformMarketListings=[];platformMarketMyListings=[];platformMarketInventory=[];platformMarketHistory=[];
  platformMarketSelectedInstance='';platformMarketTab='explore';platformMarketLoadBusy=false;platformMarketRefreshQueued=false;platformMarketPurchaseRequests.clear();platformMarketMutations.clear();
  platformUiRecords=[];platformUiLoaded=false;platformReadTradeIds.clear();platformChatBadgeBaseline=0;
  for(const key of Object.keys(platformNotifications))platformNotifications[key]=0;
  platformUpdateTitleAndBadges();
  $$('.xifre-edit-launch').forEach(button=>button.classList.add('hidden'));
  platformWalletBalance=0;platformShopSelectedRecipient=null;platformShopSearchRows=[];
  setText('shop-wallet-balance','0.00€');
  platformTrades = [];
  platformTradeIdsSeen = new Set();
  platformActiveTradeId = null;
  platformActiveTradeDetail = null;
  platformAdminRecipient = null;
  platformAdminSearchResults = [];
  platformReleaseRecords = [];
  platformTradeRefreshBusy = false;
  platformTradeDetailBusy = false;
  platformInventoryLoadBusy = false;
  platformInventoryRefreshQueued = false;
  platformAdminLoadBusy = false;
  platformReleaseLoadBusy = false;
  platformInventoryRenderKey = '';
  platformTradeListRenderKey = '';
  platformTradeDraftTradeId = null;
  platformTradeOfferDraft = null;
  platformTradeOfferDraftDirty = false;
  platformTradeOfferMutationBusy = false;
  platformTradeOfferRevision += 1;
  platformTradeMutationTicket += 1;
  platformTradeOfferRetryNeeded = false;
  platformTradeDetailQueued = false;
  platformTradeDetailRenderKey = '';
  platformTradeOpenSequence += 1;
  platformImageSignedUrlCache.clear();
  setText('appbar-version', 'ALPHA 1');
  if ($('#platform-display-version')) $('#platform-display-version').value = 'Alpha 1';
  if (platformAdminSearchTimer) clearTimeout(platformAdminSearchTimer);
  platformAdminSearchTimer = null;
  if (platformAdminItemPreviewUrl) URL.revokeObjectURL(platformAdminItemPreviewUrl);
  if (platformReleaseImagePreviewUrl) URL.revokeObjectURL(platformReleaseImagePreviewUrl);
  platformAdminItemPreviewUrl = null;
  platformReleaseImagePreviewUrl = null;
  platformAdminEditingItemId = null;
  platformAdminEditingItemImagePath = null;
  platformReleaseEditingId = null;
  platformReleaseImagePath = null;
  $('#admin-item-form')?.reset();
  $('#admin-grant-form')?.reset();
  $('#admin-user-results').innerHTML = '<span>Busca a un usuario para seleccionarlo.</span>';
  $('#admin-selected-user')?.classList.add('hidden');
  $('#admin-item-list').innerHTML = '<div class="inventory-inline-empty">Todavía no hay objetos.</div>';
  $('#admin-system-apps').innerHTML = '<span class="inventory-inline-empty">Cargando aplicaciones...</span>';
  $('#admin-item-image-preview')?.replaceChildren(Object.assign(document.createElement('span'), { textContent: 'Vista previa del objeto' }));
  $('#release-image-preview')?.replaceChildren(Object.assign(document.createElement('span'), { textContent: 'Sin imagen adjunta' }));
  for (const id of ['inventory-grid','trade-my-items','trade-own-offer','trade-other-offer','trade-incoming-list','trade-active-list','trade-history-list','admin-item-list','release-list']) {
    const node = $('#'+id);
    if (node) delete node.__xifreMarkup;
  }
}

async function platformLoadSystemApps() {
  if (!currentUser) return;
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  const { data, error } = await supabase.rpc('xifre_list_system_apps');
  if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
  if (error) {
    console.warn('XIFRE SYSTEM APPS', error);
    return;
  }
  platformApps = Array.isArray(data) ? data : [];
  const shopRow = platformApps.find(app=>app.app_id==='shop');
  const shopAvailable=Boolean(shopRow?.enabled);
  $('#app-shop-button')?.classList.toggle('hidden',!shopAvailable && !isXifreAdmin);
  $('#app-shop-button')?.classList.toggle('app-launcher-disabled',!shopAvailable);
  const marketRow=platformApps.find(app=>app.app_id==='market');
  $('#app-market-button')?.classList.toggle('hidden',!marketRow?.enabled && !isXifreAdmin);
  $('#app-market-button')?.classList.toggle('app-launcher-disabled',!marketRow?.enabled);
  const inventoryRow = platformApps.find(app => app.app_id === 'inventory');
  const inventoryAvailable = Boolean(inventoryRow?.enabled);
  const inventoryButton = $('#app-inventory-button');
  inventoryButton?.classList.toggle('hidden', !inventoryAvailable && !isXifreAdmin);
  inventoryButton?.classList.toggle('app-launcher-disabled', !inventoryAvailable);
  inventoryButton?.setAttribute('aria-disabled', String(!inventoryAvailable && !isXifreAdmin));
  $('#app-admin-button')?.classList.toggle('hidden', !isXifreAdmin);
  if (isXifreAdmin) platformRenderSystemAppAdmin();
}

function platformSetApp(appId, forceAdmin = false) {
  if (!currentUser) return;
  if (appId === 'inventory') {
    const app = platformApps.find(entry => entry.app_id === 'inventory');
    if (!app?.enabled && !isXifreAdmin) {
      toast('Esta aplicación del sistema no está disponible.', 'info');
      return;
    }
  }
  if (appId === 'shop') {
    const shop = platformApps.find(entry=>entry.app_id==='shop');
    if (!shop?.enabled && !isXifreAdmin) return toast('La tienda no está disponible.','info');
  }
  if(appId==='market'){
    const market=platformApps.find(entry=>entry.app_id==='market');
    if(!market?.enabled && !isXifreAdmin)return toast('El Mercado no está disponible.','info');
  }
  if (!['chat', 'inventory', 'shop','market'].includes(appId)) return;
  platformActiveApp = appId;
  $('#chat-app-view')?.classList.toggle('active', appId === 'chat');
  $('#chat-app-view')?.classList.toggle('hidden', appId !== 'chat');
  $('#inventory-app-view')?.classList.toggle('active', appId === 'inventory');
  $('#inventory-app-view')?.classList.toggle('hidden', appId !== 'inventory');
  $('#shop-app-view')?.classList.toggle('active',appId==='shop');
  $('#shop-app-view')?.classList.toggle('hidden',appId!=='shop');
  $('#app-chat-button')?.classList.toggle('active', appId === 'chat');
  $('#app-inventory-button')?.classList.toggle('active', appId === 'inventory');
  $('#app-shop-button')?.classList.toggle('active',appId==='shop');
  $('#market-app-view')?.classList.toggle('active',appId==='market');
  $('#market-app-view')?.classList.toggle('hidden',appId!=='market');
  $('#app-market-button')?.classList.toggle('active',appId==='market');
  platformMarkAppSeen(appId);
  if(appId==='market'){void platformLoadMarket(true);void platformLoadWallet(false);}
  if (appId==='shop') { void platformLoadShop();void platformLoadWallet(false); }
  if (appId === 'inventory') {
    if (forceAdmin && isXifreAdmin) platformSetInventoryTab('admin');
    void platformRefreshInventory();
    void platformLoadTrades(false);
  }
}

function platformSetInventoryTab(tab) {
  const valid = tab === 'collection' || tab === 'trades' || (tab === 'admin' && isXifreAdmin);
  if (!valid) {
    if (tab === 'admin') toast('Esta zona está reservada a administradores.', 'error');
    return;
  }
  platformLeaveTradeWorkspace(false);
  $$('[data-inventory-tab]').forEach(button => button.classList.toggle('active', button.dataset.inventoryTab === tab));
  $('#inventory-panel-collection')?.classList.toggle('active', tab === 'collection');
  $('#inventory-panel-trades')?.classList.toggle('active', tab === 'trades');
  $('#inventory-panel-admin')?.classList.toggle('active', tab === 'admin');
  if (tab === 'trades') {
    $('#trade-list-view')?.classList.remove('hidden');
    $('#trade-workspace')?.classList.add('hidden');
    void platformLoadTrades(false);
    platformPopulateFriendSelect();
  }
  if (tab === 'admin') void platformLoadAdminData();
}
async function platformSignImagePaths(paths) {
  const unique = [...new Set((paths || []).filter(path => typeof path === 'string' && path.trim()))];
  const mapped = new Map();
  if (!unique.length || !supabase) return mapped;
  const now = Date.now();
  const missing = [];
  for (const path of unique) {
    const cached = platformImageSignedUrlCache.get(path);
    if (cached && cached.expiresAt > now) mapped.set(path, cached.url);
    else missing.push(path);
  }
  if (!missing.length) return mapped;
  const { data, error } = await supabase.storage.from(XIFRE_SYSTEM_MEDIA_BUCKET).createSignedUrls(missing, 86400);
  if (error) {
    console.warn('XIFRE MEDIA SIGN', error);
    return mapped;
  }
  (data || []).forEach((row, index) => {
    const path = String(row.path || missing[index] || '');
    const url = row.signedUrl || row.signedURL || '';
    if (path && url) {
      mapped.set(path, url);
      // Signed links are valid for 24h. Refresh them 1h before expiration.
      platformImageSignedUrlCache.set(path, { url, expiresAt: now + 23 * 60 * 60 * 1000 });
    }
  });
  return mapped;
}
function platformImageMarkup(url, name, className = '') {
  if (!url) return `<div class="platform-image-fallback ${esc(className)}"><span>✧</span></div>`;
  return `<div class="platform-image-frame ${esc(className)}"><img src="${esc(url)}" alt="${esc(name || 'Objeto') }" loading="lazy" decoding="async"></div>`;
}

async function platformRefreshInventory() {
  if (!currentUser) return;
  if (platformInventoryLoadBusy) {
    platformInventoryRefreshQueued = true;
    return;
  }
  platformInventoryLoadBusy = true;
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  try {
    const { data, error } = await supabase.rpc('xifre_get_my_inventory');
    if (error) throw error;
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
    const rawItems = Array.isArray(data) ? data : [];
    const urls = await platformSignImagePaths(rawItems.map(item => item.image_path));
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
    const marketReserved=new Set(platformMarketMyListings.filter(r=>r.status==='active').map(r=>String(r.inventory_instance_id)));
    await platformLoadItemFeatures();
    platformInventoryItems = rawItems.map(item => platformHydrateItem({ ...item, is_box: platformItemIsBox(item), reserved:Boolean(item.reserved||marketReserved.has(platformItemKey(item))), image_url: urls.get(item.image_path) || '' }));
    platformRenderInventory();
    // Don't redraw the entire trade workspace: its item selection is interactive.
    if (platformActiveTradeId && !platformTradeOfferMutationBusy) platformRenderTradeAvailableItems();
  } catch (error) {
    console.error('XIFRE LOAD INVENTORY', error);
    if (!platformInventoryItems.length) {
      const grid = $('#inventory-grid');
      if (grid) platformApplyMarkup(grid, `<div class="inventory-empty inventory-error"><span>!</span><strong>No se pudo cargar el inventario</strong><p>${esc(friendlyError(error))}</p></div>`);
    }
  } finally {
    platformInventoryLoadBusy = false;
    if (platformInventoryRefreshQueued && currentUser) {
      platformInventoryRefreshQueued = false;
      queueMicrotask(() => { void platformRefreshInventory(); });
    }
  }
}
function platformRenderInventory() {
  const rows=platformInventoryItems;
  const groups=platformGroupItems(rows);
  setText('inventory-total-count',`${rows.length} ${rows.length===1?'objeto':'objetos'}`);
  setText('inventory-nav-count',String(rows.length));
  setText('inventory-collection-count',`${rows.length} ${rows.length===1?'COPIA':'COPIAS'} · ${groups.length} TIPOS`);
  const markup=groups.length ? groups.map(group=>platformItemCardMarkup(group.item,{count:group.count})).join('') : '<div class="inventory-empty"><span>▦</span><strong>Tu inventario está vacío</strong><p>Cuando recibas objetos, aparecerán aquí.</p></div>';
  platformApplyMarkup($('#inventory-grid'),markup);
}

async function platformUploadImage(file, folder) {
  if (!(file instanceof File)) throw new Error('Selecciona una imagen.');
  if (!XIFRE_SYSTEM_MEDIA_TYPES.has(file.type)) throw new Error('Formato no admitido. Usa PNG, JPG, WEBP o GIF.');
  if (file.size <= 0 || file.size > XIFRE_SYSTEM_MEDIA_MAX_BYTES) throw new Error('La imagen debe ocupar menos de 8 MB.');
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  const id = (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${folder}/${id}.${extensions[file.type]}`;
  const { error } = await supabase.storage.from(XIFRE_SYSTEM_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type
  });
  if (error) throw error;
  return path;
}

async function platformDeleteImage(path) {
  if (!path || !supabase) return;
  const { error } = await supabase.storage.from(XIFRE_SYSTEM_MEDIA_BUCKET).remove([path]);
  if (error) console.warn('XIFRE OLD IMAGE CLEANUP', error);
}

function platformSetPreview(containerId, file, currentPath = '') {
  const container = $(`#${containerId}`);
  if (!container) return;
  if (platformAdminItemPreviewUrl && containerId === 'admin-item-image-preview') URL.revokeObjectURL(platformAdminItemPreviewUrl);
  if (platformReleaseImagePreviewUrl && containerId === 'release-image-preview') URL.revokeObjectURL(platformReleaseImagePreviewUrl);
  if (containerId === 'admin-item-image-preview') platformAdminItemPreviewUrl = null;
  if (containerId === 'release-image-preview') platformReleaseImagePreviewUrl = null;
  container.replaceChildren();
  if (file) {
    const url = URL.createObjectURL(file);
    if (containerId === 'admin-item-image-preview') platformAdminItemPreviewUrl = url;
    if (containerId === 'release-image-preview') platformReleaseImagePreviewUrl = url;
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Vista previa';
    container.appendChild(image);
    return;
  }
  if (currentPath) {
    void platformSignImagePaths([currentPath]).then(urls => {
      const url = urls.get(currentPath);
      if (!url || !container.isConnected || container.childElementCount) return;
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Imagen actual';
      container.appendChild(image);
    });
    return;
  }
  const hint = document.createElement('span');
  hint.textContent = containerId === 'release-image-preview' ? 'Sin imagen adjunta' : 'Vista previa del objeto';
  container.appendChild(hint);
}

async function platformLoadAdminData() {
  if (!isXifreAdmin || !currentUser || platformAdminLoadBusy) return;
  platformAdminLoadBusy = true;
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  try {
    const { data, error } = await supabase.rpc('xifre_admin_list_items');
    if (error) throw error;
    platformAdminItems = Array.isArray(data) ? data : [];
    const priceResult=await supabase.rpc('xifre_admin_instant_prices');
    if(!priceResult.error && Array.isArray(priceResult.data)){
      const prices=new Map(priceResult.data.map(row=>[String(row.id),Number(row.instant_sell_cents)]));
      platformAdminItems=platformAdminItems.map(row=>({...row,instant_sell_cents:prices.get(String(row.id))??1}));
    }
    const urls = await platformSignImagePaths(platformAdminItems.map(item => item.image_path));
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner || !isXifreAdmin) return;
    await platformLoadItemFeatures();
    platformAdminItems = platformAdminItems.map(item => platformHydrateItem({ ...item, is_box: platformBoxIds.has(String(item.id)), image_url: urls.get(item.image_path) || '' }));
    platformPopulateOriginBoxSelect();
    platformRenderAdminItems();
    platformPopulateGrantItemSelect();
    if (platformShopOwner) platformPopulateShopAdminSelect();
    platformRenderSystemAppAdmin();
  } catch (error) {
    console.error('XIFRE ADMIN ITEMS', error);
    const list = $('#admin-item-list');
    if (list) list.innerHTML = `<div class="inventory-inline-empty">No se pudo cargar el catálogo: ${esc(friendlyError(error))}</div>`;
  } finally {
    platformAdminLoadBusy = false;
  }
}

function platformRenderAdminItems() {
  const list = $('#admin-item-list');
  if (!list) return;
  if (!platformAdminItems.length) {
    platformApplyMarkup(list, '<div class="inventory-inline-empty">Todavía no has creado ningún objeto.</div>');
    return;
  }
  platformApplyMarkup(list, platformAdminItems.map(item => {
    const rarity = platformRarity(item);
    return `<article class="admin-item-row rarity-${esc(rarity.className)} ${item.active ? '' : 'is-disabled'}">
      <button type="button" class="admin-item-row-image" data-open-item="${esc(item.id)}" data-item-source="admin" title="Ver ficha de ${esc(item.name)}">${platformImageMarkup(item.image_url, item.name)}</button>
      <div class="admin-item-row-copy"><strong>${esc(item.name)}</strong><span>${esc(rarity.label)} · <b>${esc(platformFormatValue(item.value))}</b> · ${esc(String(item.owned_count || 0))} copias</span><small>${item.is_box ? '✦ CAJA · ' : ''}${item.active ? 'Disponible' : 'Desactivado'}</small></div>
      <div class="admin-item-row-actions"><button type="button" class="inventory-secondary-button compact" data-admin-edit-item="${esc(item.id)}">Editar</button><button type="button" class="inventory-secondary-button compact" data-admin-toggle-item="${esc(item.id)}" data-enabled="${item.active ? 'false' : 'true'}">${item.active ? 'Desactivar' : 'Activar'}</button></div>
    </article>`;
  }).join(''));
}
function platformPopulateGrantItemSelect() {
  const select = $('#admin-grant-item');
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">Selecciona un objeto...</option>' + platformAdminItems.filter(item => item.active).map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(platformRarity(item).label)}</option>`).join('');
  if (selected && platformAdminItems.some(item => item.id === selected && item.active)) select.value = selected;
}

function platformRenderSystemAppAdmin() {
  const host = $('#admin-system-apps');
  if (!host || !isXifreAdmin) return;
  if (!platformApps.length) {
    host.innerHTML = '<span class="inventory-inline-empty">No hay aplicaciones disponibles.</span>';
    return;
  }
  host.innerHTML = platformApps.map(app => `<div class="admin-app-toggle-row"><span><strong>${esc(app.title || app.app_id)}</strong><small>${app.app_id === 'chat' ? 'Mensajería principal' : (app.app_id==='shop'?'Mercado y economía virtual':'Colección e intercambios')}</small></span><button type="button" class="admin-toggle ${app.enabled ? 'enabled' : ''}" data-admin-app-toggle="${esc(app.app_id)}" data-enabled="${app.enabled ? 'false' : 'true'}" ${app.app_id === 'chat' ? 'disabled title="CHAT siempre está disponible"' : ''} aria-label="${app.enabled ? 'Desactivar' : 'Activar'} ${esc(app.title)}"><i></i></button></div>`).join('');
}

async function platformToggleSystemApp(appId, enabled) {
  if (!isXifreAdmin) return toast('No tienes permisos de administrador.', 'error');
  try {
    const { error } = await supabase.rpc('xifre_admin_set_system_app', { p_app_id: appId, p_enabled: enabled });
    if (error) throw error;
    await platformLoadSystemApps();
    platformRenderSystemAppAdmin();
    toast(`Aplicación ${enabled ? 'activada' : 'desactivada'}.`, 'success');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

function platformResetItemForm() {
  const form = $('#admin-item-form');
  if (form) form.reset();
  if($('#admin-item-instant-price'))$('#admin-item-instant-price').value='0.01';
  platformAdminEditingItemId = null;
  platformAdminEditingItemImagePath = null;
  const button = $('#admin-item-save');
  if (button) button.textContent = 'Crear objeto';
  setText('admin-item-form-title', 'Crear objeto');
  platformSetMessage('admin-item-message', '');
  platformSetPreview('admin-item-image-preview', null, '');
  platformToggleBoxFields();
  platformPopulateItemFeatureEditor(null);
  $('#admin-box-drops')?.replaceChildren();
  platformUpdateBoxPercent();
}

function platformEditItem(itemId) {
  if (!isXifreAdmin) return;
  const item = platformAdminItems.find(row => String(row.id) === String(itemId));
  if (!item) return toast('No se ha encontrado ese objeto.', 'error');
  platformAdminEditingItemId = item.id;
  platformAdminEditingItemImagePath = item.image_path || null;
  $('#admin-item-name').value = item.name || '';
  $('#admin-item-description').value = item.description || '';
  $('#admin-item-rarity').value = item.rarity || 'comun';
  $('#admin-item-value').value = String(item.value || 0);
  const priceInput=$('#admin-item-instant-price');
  if(priceInput)priceInput.value=(Number(item.instant_sell_cents??1)/100).toFixed(2);
  $('#admin-item-image').value = '';
  $('#admin-item-is-box').checked = Boolean(item.is_box);
  platformPopulateItemFeatureEditor(item);
  platformToggleBoxFields();
  $('#admin-box-drops')?.replaceChildren();
  if (item.is_box) void platformLoadBoxEditor(item.id);
  setText('admin-item-form-title', 'Editar objeto');
  setText('admin-item-save', 'Guardar cambios');
  platformSetPreview('admin-item-image-preview', null, item.image_path || '');
  platformSetMessage('admin-item-message', 'Editando el objeto seleccionado.', 'info');
  $('#admin-item-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function platformSaveItem(event) {
  event.preventDefault();
  if (!isXifreAdmin) return toast('No tienes permisos para crear objetos.', 'error');
  const button = $('#admin-item-save');
  const file = $('#admin-item-image')?.files?.[0] || null;
  let uploadedPath = null;
  let saveRpcStarted = false;
  const wasEditing = Boolean(platformAdminEditingItemId);
  setLoading(button, true);
  platformSetMessage('admin-item-message', 'Guardando objeto...', 'info');
  try {
    const name = String($('#admin-item-name')?.value || '').trim();
    const description = String($('#admin-item-description')?.value || '').trim();
    const rarity = String($('#admin-item-rarity')?.value || 'comun');
    const isBox = Boolean($('#admin-item-is-box')?.checked);
    const drops = isBox ? platformReadBoxDrops() : [];
    const valueText = String($('#admin-item-value')?.value || '');
    if (!name) throw new Error('Escribe un nombre para el objeto.');
    if (!/^\d+$/.test(valueText) || !Number.isSafeInteger(Number(valueText)) || Number(valueText) < 0) throw new Error('Introduce un valor entero válido.');
    if (isBox && !drops.length) throw new Error('Añade premios a la caja y suma un 100%.');
    // Check new fields BEFORE creating/updating the base item: prevent avoidable partial saves.
    const upgradeEnabled=Boolean($('#admin-item-upgradable')?.checked);
    const goldRequired=Number($('#admin-item-gold-count')?.value);
    const neonRequired=Number($('#admin-item-neon-count')?.value);
    const goldValue=Number($('#admin-item-gold-value')?.value);
    const neonValue=Number($('#admin-item-neon-value')?.value);
    if (![goldRequired,neonRequired,goldValue,neonValue].every(v=>Number.isSafeInteger(v) && v>=0))
      throw new Error('Las cantidades y los valores de mejora deben ser enteros válidos.');
    if(goldRequired<2 || goldRequired>100 || neonRequired<2 || neonRequired>100)
      throw new Error('Cada mejora requiere entre 2 y 100 copias.');
    if(upgradeEnabled && isBox) throw new Error('Las cajas no pueden tener acabado Dorado o Neón.');
    const emojiEnabled=Boolean($('#admin-item-emoji-enabled')?.checked);
    if(emojiEnabled && !/^[a-z][a-z0-9_]{1,25}$/.test(String($('#admin-item-emoji-code')?.value||'').trim().toLowerCase()))
      throw new Error('El código del emoji debe tener 2-26 caracteres y empezar por letra.');
    if (file) uploadedPath = await platformUploadImage(file, 'items');
    const imagePath = uploadedPath || platformAdminEditingItemImagePath;
    if (!imagePath) throw new Error('Selecciona una imagen para el objeto.');
    saveRpcStarted = true;
    const { data, error } = await supabase.rpc('xifre_admin_save_item', {
      p_item_id: platformAdminEditingItemId,
      p_name: name,
      p_description: description,
      p_rarity: rarity,
      p_value: Number(valueText),
      p_image_path: imagePath
    });
    if (error) throw error;
    let savedId = String(data?.id || data?.item_id || data || platformAdminEditingItemId || '');
    if (!isValidUuid(savedId)) {
      // Legacy Alpha-1 RPC versions may return a boolean instead of the new ID.
      // Retrieve the catalog and match the unique uploaded image rather than guessing.
      const lookup=await supabase.rpc('xifre_admin_list_items');
      if (lookup.error) throw lookup.error;
      const candidate=(lookup.data || []).find(row=>String(row.image_path)===String(imagePath) && String(row.name)===name);
      if (candidate?.id) savedId=String(candidate.id);
    }
    if (!isValidUuid(savedId)) throw new Error('El objeto se ha guardado, pero no se ha podido identificar su ID. Revisa el catálogo antes de continuar.');
    const configured = await supabase.rpc('xifre_admin_configure_box',{p_item_id:savedId,p_is_box:isBox,p_drops:drops});
    if (configured.error) throw new Error(`Objeto guardado, pero no se configuró la caja: ${friendlyError(configured.error)}. Edita el objeto e inténtalo otra vez.`);
    await platformAdminSaveInstantPrice(savedId,platformMoneyToCents($('#admin-item-instant-price')?.value||'0.01'));
    await platformAdminSaveItemFeatures(savedId);
    await platformLoadItemFeatures(true);
    await platformLoadBoxMeta();
    if (uploadedPath && platformAdminEditingItemImagePath && uploadedPath !== platformAdminEditingItemImagePath) {
      await platformDeleteImage(platformAdminEditingItemImagePath);
    }
    platformResetItemForm();
    await platformLoadAdminData();
    await platformRefreshInventory();
    toast(wasEditing ? 'Objeto actualizado.' : 'Objeto creado.', 'success');
  } catch (error) {
    if (uploadedPath && !saveRpcStarted) await platformDeleteImage(uploadedPath);
    console.error('XIFRE SAVE ITEM', error);
    platformSetMessage('admin-item-message', friendlyError(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function platformToggleItem(itemId, enabled) {
  if (!isXifreAdmin) return;
  try {
    const { error } = await supabase.rpc('xifre_admin_set_item_active', { p_item_id: itemId, p_active: enabled });
    if (error) throw error;
    await platformLoadAdminData();
    toast(`Objeto ${enabled ? 'activado' : 'desactivado'}.`, 'success');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

function platformRenderAdminUserResults(rows) {
  const host = $('#admin-user-results');
  if (!host) return;
  platformAdminSearchResults = rows || [];
  if (!rows?.length) {
    host.innerHTML = '<span>No se han encontrado usuarios.</span>';
    return;
  }
  host.innerHTML = rows.map(user => `<button type="button" class="admin-user-result" data-admin-user-id="${esc(user.id)}"><strong>${esc(user.username || 'Usuario')}</strong><small>@${esc(user.email_handle || user.username || 'usuario')}</small></button>`).join('');
}

async function platformSearchAdminUsers(query) {
  if (!isXifreAdmin) return;
  if (platformAdminSearchTimer) clearTimeout(platformAdminSearchTimer);
  const value = String(query || '').trim().replace(/^@+/, '');
  platformAdminRecipient = null;
  $('#admin-selected-user')?.classList.add('hidden');
  if (value.length < 2) {
    const host = $('#admin-user-results');
    if (host) host.innerHTML = '<span>Escribe al menos 2 caracteres.</span>';
    return;
  }
  const host = $('#admin-user-results');
  if (host) host.innerHTML = '<span>Buscando usuarios...</span>';
  const owner = String(currentUser?.id || '');
  const generation = platformSessionGeneration;
  platformAdminSearchTimer = setTimeout(async () => {
    try {
      const { data, error } = await supabase.rpc('xifre_admin_search_users', { p_query: value });
      if (error) throw error;
      if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner || !isXifreAdmin) return;
      if (String($('#admin-user-search')?.value || '').trim().replace(/^@+/, '') !== value) return;
      platformRenderAdminUserResults(data || []);
    } catch (error) {
      if (generation === platformSessionGeneration && currentUser && String(currentUser.id) === owner && isXifreAdmin && host) host.innerHTML = `<span>${esc(friendlyError(error))}</span>`;
    }
  }, 220);
}

function platformSelectAdminUser(userId) {
  if (!isXifreAdmin) return;
  const user = platformAdminSearchResults.find(row => String(row.id) === String(userId));
  if (!user) return;
  platformAdminRecipient = user;
  const selected = $('#admin-selected-user');
  if (selected) {
    selected.textContent = `Destinatario: ${user.username || 'Usuario'} · @${user.email_handle || user.username || 'usuario'}`;
    selected.classList.remove('hidden');
  }
  const results = $('#admin-user-results');
  if (results) results.innerHTML = '<span>Destinatario seleccionado.</span>';
  if(platformShopOwner)void platformAdminLoadAssets();
}

async function platformGrantItem(event) {
  event.preventDefault();
  if (!isXifreAdmin) return toast('No tienes permisos para entregar objetos.', 'error');
  const itemId = String($('#admin-grant-item')?.value || '');
  const quantity = Number($('#admin-grant-quantity')?.value || 0);
  const button = $('#admin-grant-form button[type="submit"]');
  setLoading(button, true);
  platformSetMessage('admin-grant-message', 'Entregando objetos...', 'info');
  try {
    if (!itemId) throw new Error('Selecciona un objeto.');
    if (!platformAdminRecipient?.id) throw new Error('Busca y selecciona un destinatario.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('La cantidad debe estar entre 1 y 100.');
    const { data, error } = await supabase.rpc('xifre_admin_grant_item', {
      p_target_user: platformAdminRecipient.id,
      p_item_id: itemId,
      p_quantity: quantity
    });
    if (error) throw error;
    platformSetMessage('admin-grant-message', `Se han entregado ${Number(data || quantity)} copias correctamente.`, 'success');
    const ownGrant = String(platformAdminRecipient.id) === String(currentUser.id);
    $('#admin-grant-form')?.reset();
    platformAdminRecipient = null;
    $('#admin-selected-user')?.classList.add('hidden');
    $('#admin-user-results').innerHTML = '<span>Busca a otro destinatario para continuar.</span>';
    await platformLoadAdminData();
    if (ownGrant) await platformRefreshInventory();
    toast('Objetos entregados correctamente.', 'success');
  } catch (error) {
    console.error('XIFRE GRANT ITEM', error);
    platformSetMessage('admin-grant-message', friendlyError(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

function platformPopulateFriendSelect() {
  const select = $('#trade-friend-select');
  if (!select) return;
  const selected = select.value;
  const friends = [...(friendCache || [])].sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''), 'es'));
  select.innerHTML = '<option value="">Selecciona un amigo...</option>' + friends.map(friend => `<option value="${esc(friend.id)}">${esc(friend.username || friend.display_name || 'Usuario')}</option>`).join('');
  if (selected && friends.some(friend => String(friend.id) === selected)) select.value = selected;
}

async function platformCreateTradeRequest(event) {
  event.preventDefault();
  const recipientId = String($('#trade-friend-select')?.value || '');
  const button = $('#trade-request-form button[type="submit"]');
  if (!recipientId) return toast('Selecciona primero a un amigo.', 'info');
  setLoading(button, true);
  try {
    const { data, error } = await supabase.rpc('xifre_create_trade_request', { p_recipient_id: recipientId });
    if (error) throw error;
    $('#trade-request-form')?.reset();
    toast('Solicitud de intercambio enviada.', 'success');
    await platformLoadTrades(false);
  } catch (error) {
    toast(friendlyError(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function platformLoadTrades(showNotifications = true) {
  if (!currentUser || platformTradeRefreshBusy) return;
  platformTradeRefreshBusy = true;
  const generation = platformSessionGeneration;
  try {
    const owner = String(currentUser.id);
    const { data, error } = await supabase.rpc('xifre_list_my_trades');
    if (error) throw error;
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
    platformTrades = Array.isArray(data) ? data : [];
    platformUpdateTradeBadges();
    const incoming = platformTrades.filter(trade => trade.status === 'pending' && String(trade.recipient_id) === owner);
    setText('inventory-trade-badge', String(incoming.length));
    $('#inventory-trade-badge')?.classList.toggle('hidden', incoming.length === 0);
    // The list is re-rendered only on actual data changes. This preserves scroll and hover.
    platformRenderTrades();
    if (showNotifications && document.visibilityState === 'visible') {
      for (const trade of incoming) {
        const id = String(trade.id);
        if (platformTradeIdsSeen.has(id)) continue;
        platformTradeIdsSeen.add(id);
        const age = Date.now() - new Date(trade.created_at || 0).getTime();
        if (Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000) platformShowTradeNotification(trade);
      }
    } else incoming.forEach(trade => platformTradeIdsSeen.add(String(trade.id)));
    if (platformActiveTradeId && !platformTrades.some(trade => String(trade.id) === String(platformActiveTradeId) && trade.status === 'active')) {
      // Fetch the final state rather than leaving a stale 'active' workspace behind.
      void platformRefreshTradeDetail(false);
    }
  } catch (error) {
    console.warn('XIFRE LOAD TRADES', error);
  } finally {
    platformTradeRefreshBusy = false;
  }
}
function platformRenderTrades() {
  const me = String(currentUser?.id || '');
  const incoming = platformTrades.filter(trade => trade.status === 'pending' && String(trade.recipient_id) === me);
  const active = platformTrades.filter(trade => trade.status === 'active');
  const history = platformTrades.filter(trade => trade.status !== 'active' && !(trade.status === 'pending' && String(trade.recipient_id) === me));
  setText('trade-incoming-count', String(incoming.length));
  setText('trade-active-count', String(active.length));
  setText('trade-history-count', String(history.length));
  platformApplyMarkup($('#trade-incoming-list'), incoming.length ? incoming.map(trade => `<article class="trade-list-row"><div class="trade-list-copy"><strong>${esc(trade.partner_username || 'Usuario')}</strong><span>Te invita a intercambiar</span><small>${esc(platformDateLabel(trade.created_at))}</small></div><div class="trade-list-actions"><button type="button" class="inventory-primary-button compact" data-trade-response="accept" data-trade-id="${esc(trade.id)}">Aceptar</button><button type="button" class="inventory-secondary-button compact" data-trade-response="reject" data-trade-id="${esc(trade.id)}">Rechazar</button></div></article>`).join('') : '<div class="inventory-inline-empty">No tienes solicitudes pendientes.</div>');
  platformApplyMarkup($('#trade-active-list'), active.length ? active.map(trade => `<article class="trade-list-row"><div class="trade-list-copy"><strong>${esc(trade.partner_username || 'Usuario')}</strong><span>Intercambio en curso</span><small>${trade.sender_confirmed && trade.recipient_confirmed ? 'Confirmado por ambas partes' : 'Prepara la oferta y confírmala'}</small></div><button type="button" class="inventory-primary-button compact" data-open-trade="${esc(trade.id)}">Continuar →</button></article>`).join('') : '<div class="inventory-inline-empty">No tienes intercambios activos.</div>');
  platformApplyMarkup($('#trade-history-list'), history.length ? history.map(trade => {
    const status = platformTradeStatusLabel(trade.status);
    const outgoing = String(trade.sender_id) === me && trade.status === 'pending';
    return `<article class="trade-list-row trade-history-row"><div class="trade-list-copy"><strong>${esc(trade.partner_username || 'Usuario')}</strong><span>${esc(status)}</span><small>${esc(platformDateLabel(trade.created_at))}</small></div>${outgoing ? `<button type="button" class="inventory-secondary-button compact" data-cancel-trade="${esc(trade.id)}">Cancelar</button>` : ''}</article>`;
  }).join('') : '<div class="inventory-inline-empty">Todavía no hay actividad.</div>');
}
function platformDateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function platformTradeStatusLabel(status) {
  const labels = { pending: 'Solicitud enviada', active: 'En curso', completed: 'Completado', rejected: 'Rechazado', cancelled: 'Cancelado', expired: 'Caducado' };
  return labels[status] || 'Estado desconocido';
}

function platformShowTradeNotification(trade) {
  const stack = $('#xifre-notification-stack');
  if (!stack || !currentUser || document.visibilityState !== 'visible') return;
  const id = String(trade.id);
  if (stack.querySelector(`[data-trade-notification="${CSS.escape(id)}"]`)) return;
  const node = document.createElement('article');
  node.className = 'xifre-trade-notification';
  node.dataset.tradeNotification = id;
  const copy = document.createElement('div');
  copy.className = 'xifre-trade-notification-copy';
  const kicker = document.createElement('span');
  kicker.textContent = 'NUEVA SOLICITUD';
  const title = document.createElement('strong');
  title.textContent = `${trade.partner_username || 'Un amigo'} quiere intercambiar contigo`;
  const detail = document.createElement('small');
  detail.textContent = 'Esta notificación desaparece en 10 segundos.';
  copy.append(kicker, title, detail);
  const actions = document.createElement('div');
  actions.className = 'xifre-trade-notification-actions';
  const accept = document.createElement('button');
  accept.type = 'button'; accept.textContent = 'Aceptar'; accept.dataset.tradeResponse = 'accept'; accept.dataset.tradeId = id; accept.className = 'inventory-primary-button compact';
  const reject = document.createElement('button');
  reject.type = 'button'; reject.textContent = 'Rechazar'; reject.dataset.tradeResponse = 'reject'; reject.dataset.tradeId = id; reject.className = 'inventory-secondary-button compact';
  actions.append(accept, reject);
  node.append(copy, actions);
  stack.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  const timer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 260);
    platformTradeNotifications.delete(id);
  }, 10000);
  platformTradeNotifications.set(id, timer);
}

function platformRemoveTradeNotification(tradeId) {
  const id = String(tradeId);
  const timer = platformTradeNotifications.get(id);
  if (timer) clearTimeout(timer);
  platformTradeNotifications.delete(id);
  const node = $(`[data-trade-notification="${CSS.escape(id)}"]`);
  if (node) node.remove();
}

async function platformRespondTrade(tradeId, accept) {
  platformRemoveTradeNotification(tradeId);
  try {
    const { data, error } = await supabase.rpc('xifre_respond_trade_request', { p_trade_id: tradeId, p_accept: Boolean(accept) });
    if (error) throw error;
    await platformLoadTrades(false);
    if (data === 'active') {
      toast('Solicitud aceptada. Ya podéis preparar vuestras ofertas.', 'success');
      platformSetApp('inventory');
      platformSetInventoryTab('trades');
      await platformOpenTradeWorkspace(tradeId);
    } else if (data === 'expired') {
      toast('La solicitud ha caducado.', 'info');
    } else {
      toast('Solicitud rechazada.', 'info');
    }
  } catch (error) {
    toast(friendlyError(error), 'error');
    await platformLoadTrades(false);
  }
}

async function platformCancelTrade(tradeId) {
  const confirmed = await askConfirm('Cancelar intercambio', '¿Seguro que quieres cancelar este intercambio? Las ofertas dejarán de estar reservadas.', 'Cancelar intercambio');
  if (!confirmed) return;
  try {
    const { error } = await supabase.rpc('xifre_cancel_trade', { p_trade_id: tradeId });
    if (error) throw error;
    if (String(platformActiveTradeId) === String(tradeId)) platformLeaveTradeWorkspace(true);
    await platformLoadTrades(false);
    await platformRefreshInventory();
    toast('Intercambio cancelado.', 'success');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

function platformSetupTradeRealtime() {
  if (!currentUser || !supabase) return;
  if (platformTradeChannel) void supabase.removeChannel(platformTradeChannel);
  const owner = String(currentUser.id);
  const channel = supabase.channel(`xifre-alpha1-trades-${owner}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'xifre_trades' }, () => {
      void platformLoadTrades(true);
      if (platformActiveTradeId) void platformRefreshTradeDetail(false);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'xifre_trade_offers' }, () => {
      if (platformActiveTradeId) void platformRefreshTradeDetail(false);
    })
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') console.info('XIFRE TRADE REALTIME SUBSCRIBED');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('XIFRE TRADE REALTIME', status, error || '');
    });
  platformTradeChannel = channel;
}

async function platformOpenTradeWorkspace(tradeId) {
  if (!isValidUuid(tradeId)) return toast('Intercambio no válido.', 'error');
  platformSetApp('inventory');
  platformSetInventoryTab('trades');
  platformActiveTradeId = String(tradeId);
  platformTradeOpenSequence += 1;
  platformTradeDraftTradeId = null;
  platformTradeOfferDraft = null;
  platformTradeOfferDraftDirty = false;
  platformTradeOfferRetryNeeded = false;
  platformTradeOfferRevision += 1;
  platformTradeDetailRenderKey = '';
  $('#trade-list-view')?.classList.add('hidden');
  $('#trade-workspace')?.classList.remove('hidden');
  setText('trade-workspace-feedback', 'Cargando intercambio...');
  await platformRefreshTradeDetail(true);
}
async function platformRefreshTradeDetail(withInventory = false) {
  if (!platformActiveTradeId || !currentUser) return;
  if (platformTradeDetailBusy || platformTradeOfferMutationBusy) {
    if (withInventory) platformTradeDetailQueued = true;
    return;
  }
  platformTradeDetailBusy = true;
  const tradeId = String(platformActiveTradeId);
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  const revision = platformTradeOfferRevision;
  try {
    const { data, error } = await supabase.rpc('xifre_get_trade_detail', { p_trade_id: tradeId });
    if (error) throw error;
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner || String(platformActiveTradeId) !== tradeId || revision !== platformTradeOfferRevision) return;
    if (!data?.trade) throw new Error('El intercambio ya no está disponible.');
    let inventory = null;
    if (withInventory) {
      const response = await supabase.rpc('xifre_get_my_inventory');
      if (response.error) throw response.error;
      inventory = Array.isArray(response.data) ? response.data : [];
    }
    const urls = await platformSignImagePaths([...(inventory || []).map(item => item.image_path), ...(data.offers || []).map(item => item.image_path)]);
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner || String(platformActiveTradeId) !== tradeId || revision !== platformTradeOfferRevision || platformTradeOfferMutationBusy) return;
    if (inventory) {
      await platformLoadItemFeatures();
      platformInventoryItems = inventory.map(item => platformHydrateItem({ ...item, is_box: platformItemIsBox(item), image_url: urls.get(item.image_path) || '' }));
      platformRenderInventory();
    }
    let tradeFinishes=new Map();
    try{
      const updated=await supabase.rpc('xifre_trade_upgrade_values',{p_trade_id:tradeId});
      if(!updated.error && Array.isArray(updated.data))tradeFinishes=new Map(updated.data.map(v=>[String(v.instance_id),v]));
    }catch(error){console.warn('XIFRE TRADE GRADES',error);}
    const nextDetail = { ...data, offers: (data.offers || []).map(item => {
      const grade=tradeFinishes.get(String(item.instance_id||''));
      return platformHydrateItem({ ...item, upgrade_tier:grade?.upgrade_tier??item.upgrade_tier,
       value:grade?.value??item.value, image_url: urls.get(item.image_path) || '' });
    }) };
    const ownOfferIds = (nextDetail.offers || []).filter(item => String(item.user_id) === owner).map(item => String(item.instance_id));
    if (platformTradeDraftTradeId !== tradeId || !platformTradeOfferDraft || !platformTradeOfferDraftDirty) {
      platformTradeOfferDraft = new Set(ownOfferIds);
      platformTradeDraftTradeId = tradeId;
    }
    platformActiveTradeDetail = nextDetail;
    platformRenderTradeWorkspace();
  } catch (error) {
    console.warn('XIFRE TRADE DETAIL', error);
    if (withInventory && generation === platformSessionGeneration && String(platformActiveTradeId) === tradeId) {
      toast(friendlyError(error), 'error');
      setText('trade-workspace-feedback', 'No se pudo cargar el intercambio. Prueba a volver a abrirlo.');
    }
  } finally {
    platformTradeDetailBusy = false;
    if (platformTradeDetailQueued && currentUser && platformActiveTradeId && !platformTradeOfferMutationBusy) {
      platformTradeDetailQueued = false;
      queueMicrotask(() => { void platformRefreshTradeDetail(true); });
    }
  }
}
function platformRenderTradeWorkspace() {
  const detail = platformActiveTradeDetail;
  const me = String(currentUser?.id || '');
  if (!detail?.trade || !me || String(detail.trade.id) !== String(platformActiveTradeId)) return;
  const trade = detail.trade;
  const ownOffer = (detail.offers || []).filter(item => String(item.user_id) === me);
  const otherOffer = (detail.offers || []).filter(item => String(item.user_id) !== me);
  const isSender = me === String(trade.sender_id);
  const ownName = isSender ? detail.sender?.username : detail.recipient?.username;
  const otherName = isSender ? detail.recipient?.username : detail.sender?.username;
  const ownConfirmed = isSender ? trade.sender_confirmed : trade.recipient_confirmed;
  const otherConfirmed = isSender ? trade.recipient_confirmed : trade.sender_confirmed;
  const active = trade.status === 'active';
  setText('trade-own-name', `${ownName || 'Usuario'} (tú)`);
  setText('trade-other-name', otherName || 'Amigo');
  setText('trade-own-total',platformFormatValue(ownOffer.reduce((sum,item)=>sum+Number(item.value||0),0)));
  setText('trade-other-total',platformFormatValue(otherOffer.reduce((sum,item)=>sum+Number(item.value||0),0)));
  setText('trade-own-confirmed', ownConfirmed ? 'Confirmado ✓' : 'Sin confirmar');
  setText('trade-other-confirmed', otherConfirmed ? 'Confirmado ✓' : 'Sin confirmar');
  $('#trade-own-confirmed')?.classList.toggle('confirmed', Boolean(ownConfirmed));
  $('#trade-other-confirmed')?.classList.toggle('confirmed', Boolean(otherConfirmed));
  setText('trade-workspace-subtitle', `Con ${otherName || 'tu amigo'}. Añade objetos abajo y, cuando estés listo, confirma.`);
  setText('trade-workspace-status', active ? 'EN CURSO' : platformTradeStatusLabel(trade.status).toLocaleUpperCase('es-ES'));
  $('#trade-cancel-button')?.classList.toggle('hidden', !active);
  $('#trade-confirm-button')?.classList.toggle('hidden', !active);
  if (!platformTradeOfferMutationBusy && !platformTradeOfferDraftDirty && !platformTradeOfferRetryNeeded) {
    if (trade.status === 'completed') setText('trade-workspace-feedback', 'Intercambio completado. Los objetos se han transferido a sus nuevos dueños.');
    else if (!active) setText('trade-workspace-feedback', 'Este intercambio ha terminado y no admite cambios.');
    else if (ownConfirmed && otherConfirmed) setText('trade-workspace-feedback', 'Ambos habéis confirmado. Completando intercambio...');
    else if (ownConfirmed) setText('trade-workspace-feedback', 'Tu oferta está confirmada. Esperando a la otra persona.');
    else if (otherConfirmed) setText('trade-workspace-feedback', 'Tu amigo ha confirmado. Comprueba su oferta antes de aceptar.');
    else setText('trade-workspace-feedback', 'Los regalos están permitidos: basta con que una de las dos personas ofrezca algo. Confirmad ambos para completarlo.');
  }
  const markup = items => items.length ? items.map(item => {
    const rarity = platformRarity(item);
    return `<button type="button" class="trade-offer-item rarity-${esc(rarity.className)} ${platformGradeClass(item)}" data-open-item="${esc(platformItemKey(item))}" data-item-source="trade" title="Detalles del objeto"><span class="trade-offer-thumb">${platformImageMarkup(item.image_url, item.name)}</span><span class="trade-offer-copy"><strong>${esc(item.name)}</strong><small>${esc(platformFormatValue(item.value))}</small></span></button>`;
  }).join('') : '<div class="trade-offer-empty">Ningún objeto todavía</div>';
  platformApplyMarkup($('#trade-own-offer'), markup(ownOffer));
  platformApplyMarkup($('#trade-other-offer'), markup(otherOffer));
  platformRenderTradeAvailableItems();
  platformUpdateTradeSelectionCount();
  const confirmButton = $('#trade-confirm-button');
  if (confirmButton) {
    confirmButton.disabled = Boolean(ownConfirmed) || !active || platformTradeOfferMutationBusy || platformTradeOfferDraftDirty || platformTradeOfferRetryNeeded;
    confirmButton.textContent = ownConfirmed ? 'Esperando a tu amigo' : 'Confirmar intercambio';
  }
}
function platformRenderTradeAvailableItems() {
  const host = $('#trade-my-items');
  const detail=platformActiveTradeDetail;
  if (!host || !detail?.trade || String(detail.trade.id)!==String(platformActiveTradeId)) return;
  const available=platformInventoryItems.filter(item=>!item.reserved || String(item.reserved_trade_id)===String(detail.trade.id));
  const groups=platformGroupItems(available);
  const active=detail.trade.status==='active';
  const markup=groups.length ? groups.map(group=>platformItemCardMarkup(group.item,{mode:'trade',count:group.count,disabled:!active})).join('')
    : '<div class="inventory-inline-empty">No tienes objetos disponibles para este intercambio.</div>';
  platformApplyMarkup(host,markup);
  platformRefreshTradeTileStates();
}

function platformRefreshTradeTileStates() {
  const available = platformInventoryItems.filter(item => !item.reserved || String(item.reserved_trade_id)===String(platformActiveTradeId));
  $$('#trade-my-items [data-trade-tile]').forEach(tile=>{
    const representative=available.find(item=>platformItemKey(item)===tile.dataset.tradeTile);
    if (!representative) return;
    const members=available.filter(item=>platformGroupSignature(item)===platformGroupSignature(representative));
    const selected=members.filter(item=>platformTradeOfferDraft?.has(platformItemKey(item))).length;
    const active=platformActiveTradeDetail?.trade?.status==='active';
    tile.classList.toggle('is-offered',selected>0);
    const plus=tile.querySelector('[data-trade-toggle]');
    if(plus){plus.disabled=!active || selected===members.length;plus.setAttribute('aria-pressed',String(selected>0));}
    const minus=tile.querySelector('.mini-item-minus');
    if(minus){minus.classList.toggle('hidden',selected===0 || !active);minus.disabled=!active || !selected;}
    const label=tile.querySelector('.mini-item-selection');
    if(label) label.textContent=selected ? `${selected}/${members.length} ofrecidos` : '+ Ofrecer';
  });
  platformUpdateTradeSelectionCount();
}

function platformToggleTradeItem(itemId, remove = false) {
  const trade=platformActiveTradeDetail?.trade;
  if (!trade || trade.status!=='active' || String(trade.id)!==String(platformActiveTradeId)) return;
  const available=platformInventoryItems.filter(item=>!item.reserved || String(item.reserved_trade_id)===String(trade.id));
  const representative=available.find(row=>platformItemKey(row)===String(itemId));
  if(!representative) return;
  const members=available.filter(item=>platformGroupSignature(item)===platformGroupSignature(representative));
  if(!platformTradeOfferDraft) platformTradeOfferDraft=new Set();
  const chosen=remove ? members.slice().reverse().find(item=>platformTradeOfferDraft.has(platformItemKey(item))) : members.find(item=>!platformTradeOfferDraft.has(platformItemKey(item)));
  if(!chosen)return;
  const id=platformItemKey(chosen);
  if(remove)platformTradeOfferDraft.delete(id); else platformTradeOfferDraft.add(id);
  platformTradeOfferDraftDirty=true;
  platformTradeOfferRetryNeeded=false;
  platformTradeOfferRevision++;
  platformRefreshTradeTileStates();
  setText('trade-workspace-feedback','Guardando tu oferta...');
  void platformSyncTradeOffer();
}

async function platformSyncTradeOffer() {
  if (!platformActiveTradeId || !currentUser || platformTradeOfferMutationBusy || !platformTradeOfferDraft) return;
  const tradeId = String(platformActiveTradeId);
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  const ticket = ++platformTradeMutationTicket;
  platformTradeOfferMutationBusy = true;
  platformTradeOfferRetryNeeded = false;
  $('#trade-save-offer-button')?.classList.add('hidden');
  platformUpdateTradeSelectionCount();
  let ok = true;
  try {
    // Multiple rapid clicks serialize; the newest selection always wins.
    while (platformTradeOfferDraftDirty && ticket === platformTradeMutationTicket && generation === platformSessionGeneration && currentUser && String(currentUser.id) === owner && String(platformActiveTradeId) === tradeId) {
      platformTradeOfferDraftDirty = false;
      const ids = [...platformTradeOfferDraft].filter(isValidUuid).sort();
      const { error } = await supabase.rpc('xifre_set_trade_offer', { p_trade_id: tradeId, p_inventory_item_ids: ids });
      if (error) throw error;
    }
  } catch (error) {
    ok = false;
    if (ticket === platformTradeMutationTicket && generation === platformSessionGeneration && String(platformActiveTradeId) === tradeId) {
      platformTradeOfferDraftDirty = true;
      platformTradeOfferRetryNeeded = true;
      setText('trade-workspace-feedback', `No se guardó la oferta: ${friendlyError(error)}. Puedes reintentarlo.`);
      $('#trade-save-offer-button')?.classList.remove('hidden');
      toast('Error al guardar la oferta. Usa «Reintentar guardar».', 'error');
    }
  } finally {
    if (ticket === platformTradeMutationTicket) {
      platformTradeOfferMutationBusy = false;
      platformUpdateTradeSelectionCount();
    }
  }
  if (ticket !== platformTradeMutationTicket || generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner || String(platformActiveTradeId) !== tradeId) return;
  if (ok) {
    setText('trade-workspace-feedback', 'Oferta guardada. Puedes confirmarla cuando estés de acuerdo.');
    platformTradeDetailQueued = false;
    await platformRefreshTradeDetail(true);
    void platformLoadTrades(false);
  }
}

function platformUpdateTradeSelectionCount() {
  const selected = platformTradeOfferDraft?.size || 0;
  setText('trade-selected-count', `${selected} ${selected === 1 ? 'ofrecido' : 'ofrecidos'}`);
  const confirmButton = $('#trade-confirm-button');
  if (confirmButton && platformActiveTradeDetail?.trade) {
    const trade = platformActiveTradeDetail.trade;
    const ownConfirmed = String(currentUser?.id) === String(trade.sender_id) ? trade.sender_confirmed : trade.recipient_confirmed;
    confirmButton.disabled = trade.status !== 'active' || Boolean(ownConfirmed) || platformTradeOfferMutationBusy || platformTradeOfferDraftDirty || platformTradeOfferRetryNeeded;
  }
}
async function platformSaveTradeOffer() {
  if (!platformActiveTradeId || !platformTradeOfferDraft) return;
  platformTradeOfferDraftDirty = true;
  platformTradeOfferRetryNeeded = false;
  await platformSyncTradeOffer();
}
async function platformConfirmTrade() {
  if (!platformActiveTradeId) return;
  if (platformTradeOfferMutationBusy || platformTradeOfferDraftDirty || platformTradeOfferRetryNeeded) return toast('Primero debe terminar de guardarse tu oferta.', 'info');
  const tradeId = String(platformActiveTradeId);
  const button = $('#trade-confirm-button');
  setLoading(button, true);
  try {
    const { data, error } = await supabase.rpc('xifre_confirm_trade_v2', { p_trade_id: tradeId });
    if (error) throw error;
    if (data === 'completed') {
      toast('¡Intercambio completado! Los objetos ya se han transferido.', 'success');
      await platformRefreshInventory();
    } else if (data === 'expired') toast('El intercambio ha caducado.', 'info');
    else toast('Confirmación guardada. Falta la otra persona.', 'success');
    await platformRefreshTradeDetail(true);
    await platformLoadTrades(false);
  } catch (error) {
    toast(friendlyError(error), 'error');
    await platformRefreshTradeDetail(true);
  } finally {
    setLoading(button, false);
  }
}
function platformLeaveTradeWorkspace(showList = true) {
  platformActiveTradeId = null;
  platformActiveTradeDetail = null;
  platformTradeDraftTradeId = null;
  platformTradeOfferDraft = null;
  platformTradeOfferDraftDirty = false;
  platformTradeOfferRetryNeeded = false;
  platformTradeDetailQueued = false;
  platformTradeDetailRenderKey = '';
  platformTradeOfferRevision += 1;
  platformTradeMutationTicket += 1;
  platformTradeOfferMutationBusy = false;
  platformTradeOpenSequence += 1;
  $('#trade-workspace')?.classList.add('hidden');
  if (showList) $('#trade-list-view')?.classList.remove('hidden');
}

function platformBackToTradeList() {
  platformLeaveTradeWorkspace(true);
  void platformLoadTrades(false);
}
function platformReleaseSeenKey() {
  return `xifre-last-release-seen:${String(currentUser?.id || 'guest')}`;
}

function platformGetLastReleaseSeen() {
  try { return localStorage.getItem(platformReleaseSeenKey()) || ''; } catch { return ''; }
}

function platformSetLastReleaseSeen(value) {
  try { localStorage.setItem(platformReleaseSeenKey(), String(value || '')); } catch (error) { console.warn('XIFRE RELEASE SEEN STORAGE', error); }
}

async function platformOpenUpdates() {
  openModal('updates-modal');
  $('#updates-new-dot')?.classList.add('hidden');
  await platformLoadReleases();
  const latest = platformReleaseRecords.find(row => row.published);
  if (latest?.id) {
    platformSetLastReleaseSeen(latest.id);
    $('#updates-new-dot')?.classList.add('hidden');
  }
}

async function platformLoadReleases() {
  if (!currentUser || platformReleaseLoadBusy) return;
  platformReleaseLoadBusy = true;
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  try {
    const { data, error } = await supabase.from('xifre_release_notes').select('id,version,title,summary,body,image_path,published,created_at,updated_at').order('created_at', { ascending: false });
    if (error) throw error;
    platformReleaseRecords = Array.isArray(data) ? data : [];
    const urls = await platformSignImagePaths(platformReleaseRecords.map(row => row.image_path));
    if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id) !== owner) return;
    platformReleaseRecords = platformReleaseRecords.map(row => ({ ...row, image_url: urls.get(row.image_path) || '' }));
    platformRenderReleases();
    const latest = platformReleaseRecords.find(row => row.published);
    const lastSeen = platformGetLastReleaseSeen();
    $('#updates-new-dot')?.classList.toggle('hidden', !latest?.id || String(latest.id) === lastSeen);
  } catch (error) {
    console.error('XIFRE LOAD RELEASES', error);
    const host = $('#release-list');
    if (host) host.innerHTML = `<div class="inventory-inline-empty">No se pudieron cargar las actualizaciones: ${esc(friendlyError(error))}</div>`;
  } finally {
    platformReleaseLoadBusy = false;
  }
}

function platformReleaseBodyHTML(body) {
  const lines = String(body || '').split(/\r?\n/u);
  if (!lines.some(line => line.trim())) return '';
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<div class="release-line-gap" aria-hidden="true"></div>';
    const match = trimmed.match(/^(?:[•*\-]|\d+[.)])\s+(.+)$/u);
    if (match) return `<p class="release-bullet"><span aria-hidden="true">•</span>${esc(match[1])}</p>`;
    return `<p class="release-paragraph">${esc(trimmed)}</p>`;
  }).join('');
}

function platformRenderReleases() {
  const host = $('#release-list');
  if (!host) return;
  const rows = platformReleaseRecords.filter(row => row.published || isXifreAdmin);
  if (!rows.length) {
    platformApplyMarkup(host, '<div class="inventory-inline-empty">Todavía no hay actualizaciones publicadas.</div>');
    return;
  }
  const latestPublished = platformReleaseRecords.find(row => row.published)?.id;
  platformApplyMarkup(host, rows.map(row => `<article class="release-entry ${row.id === latestPublished ? 'release-entry-latest' : ''}">
    <div class="release-entry-top"><span class="release-version-pill">${esc(row.version)}</span>${row.id === latestPublished ? '<span class="release-latest-tag">MÁS RECIENTE</span>' : ''}<time>${esc(platformDateLabel(row.created_at))}</time>${isXifreAdmin && !row.published ? '<span class="release-draft-pill">BORRADOR</span>' : ''}</div>
    <h3>${esc(row.title)}</h3>${row.summary ? `<p class="release-summary">${esc(row.summary)}</p>` : ''}
    ${row.image_url ? `<img class="release-image" src="${esc(row.image_url)}" alt="Imagen de ${esc(row.title)}" loading="lazy">` : ''}
    <div class="release-body">${platformReleaseBodyHTML(row.body)}</div>
    ${isXifreAdmin ? `<button type="button" class="inventory-secondary-button compact release-edit-button" data-edit-release="${esc(row.id)}">Editar publicación</button>` : ''}
  </article>`).join(''));
}
function platformResetReleaseEditor() {
  $('#release-admin-form')?.reset();
  platformReleaseEditingId = null;
  platformReleaseImagePath = null;
  setText('release-editor-title', 'Publicar actualización');
  setText('release-save-button', 'Guardar publicación');
  platformSetMessage('release-admin-message', '');
  platformSetPreview('release-image-preview', null, '');
}

function platformEditRelease(releaseId) {
  if (!isXifreAdmin) return;
  const row = platformReleaseRecords.find(entry => String(entry.id) === String(releaseId));
  if (!row) return toast('No se ha encontrado esa publicación.', 'error');
  platformReleaseEditingId = row.id;
  platformReleaseImagePath = row.image_path || null;
  $('#release-version').value = row.version || '';
  $('#release-published').value = String(Boolean(row.published));
  $('#release-title').value = row.title || '';
  $('#release-summary').value = row.summary || '';
  $('#release-body').value = row.body || '';
  $('#release-image').value = '';
  setText('release-editor-title', 'Editar publicación');
  setText('release-save-button', 'Guardar cambios');
  platformSetPreview('release-image-preview', null, row.image_path || '');
  platformSetMessage('release-admin-message', 'Editando la publicación seleccionada.', 'info');
  $('#release-admin-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function platformSaveRelease(event) {
  event.preventDefault();
  if (!isXifreAdmin) return toast('Solo los administradores pueden publicar actualizaciones.', 'error');
  const button = $('#release-save-button');
  const file = $('#release-image')?.files?.[0] || null;
  let uploadedPath = null;
  let saveRpcStarted = false;
  setLoading(button, true);
  platformSetMessage('release-admin-message', 'Guardando publicación...', 'info');
  try {
    if (file) uploadedPath = await platformUploadImage(file, 'releases');
    const imagePath = uploadedPath || platformReleaseImagePath;
    saveRpcStarted = true;
    const { error } = await supabase.rpc('xifre_admin_save_release', {
      p_id: platformReleaseEditingId,
      p_version: String($('#release-version')?.value || '').trim(),
      p_title: String($('#release-title')?.value || '').trim(),
      p_summary: String($('#release-summary')?.value || '').trim(),
      p_body: String($('#release-body')?.value || ''),
      p_image_path: imagePath,
      p_published: $('#release-published')?.value === 'true'
    });
    if (error) throw error;
    if (uploadedPath && platformReleaseImagePath && uploadedPath !== platformReleaseImagePath) await platformDeleteImage(platformReleaseImagePath);
    platformResetReleaseEditor();
    await platformLoadReleases();
    toast('Actualización guardada.', 'success');
  } catch (error) {
    if (uploadedPath && !saveRpcStarted) await platformDeleteImage(uploadedPath);
    console.error('XIFRE SAVE RELEASE', error);
    platformSetMessage('release-admin-message', friendlyError(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

/* ========================================================================
   XIFRE ALPHA 1.3: secure simulated economy / shop / configurable loot boxes
   ======================================================================== */

const platformBoxInstanceToItem = new Map();
const platformBoxPreviewCache = new Map();
const platformPurchaseRequestIds = new Map();

async function platformLoadBoxMeta() {
  if (!currentUser || !supabase) return;
  const owner = String(currentUser.id);
  const generation = platformSessionGeneration;
  const { data, error } = await supabase.rpc('xifre_box_meta');
  if (error) { console.warn('XIFRE BOX META',error); return; }
  if (generation !== platformSessionGeneration || !currentUser || String(currentUser.id)!==owner) return;
  platformBoxIds = new Set((data?.item_ids || []).map(String));
  platformBoxInstances = new Set((data?.inventory || []).map(row=>String(row.instance_id)));
  platformBoxInstanceToItem.clear();
  (data?.inventory || []).forEach(row=>platformBoxInstanceToItem.set(String(row.instance_id),String(row.item_id)));
  platformBoxPreviewCache.clear();
}

function platformBoxIdFor(item) {
  const instance = platformItemKey(item);
  return String(platformBoxInstanceToItem.get(instance) || item?.item_id || item?.id || '');
}

async function platformGetBoxDrops(itemId, refresh = false) {
  const id = String(itemId || '');
  if (!isValidUuid(id)) throw new Error('No se ha encontrado el tipo de caja. Actualiza el inventario.');
  if (!refresh && platformBoxPreviewCache.has(id)) return platformBoxPreviewCache.get(id);
  const { data,error } = await supabase.rpc('xifre_box_preview',{p_box_item_id:id});
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const urls = await platformSignImagePaths(rows.map(row=>row.image_path));
  const drops = rows.map(row=>({...row,image_url:urls.get(row.image_path)||''}));
  platformBoxPreviewCache.set(id,drops);
  return drops;
}

async function platformRenderBoxPreview(item, source) {
  const preview = $('#item-box-preview');
  const button = $('#item-open-box-button');
  const sequence=platformDetailsSequence;
  if (!preview) return;
  const itemId = platformBoxIdFor(item);
  const instanceId = platformItemKey(item);
  preview.classList.remove('hidden');
  preview.innerHTML = '<p>Cargando premios posibles...</p>';
  if (source==='collection') {
    const available = platformInventoryItems.find(x=>platformGroupSignature(x)===platformGroupSignature(item) && !x.reserved && platformBoxInstances.has(platformItemKey(x)));
    if (available && button) {
      button.dataset.boxInstance=platformItemKey(available);
      button.classList.remove('hidden');
    }
  }
  try {
    const drops = await platformGetBoxDrops(itemId);
    if (sequence!==platformDetailsSequence || !$('#item-details-modal') || $('#item-details-modal').classList.contains('hidden')) return;
    preview.innerHTML = `<strong class="box-details-title">PREMIOS POSIBLES · PROBABILIDADES</strong><div class="box-details-grid">${drops.map(drop=>{
      const rarity=platformRarity(drop);
      const hidden=Boolean(drop.hidden && !platformShopOwner);
      return `<div class="box-detail-prize rarity-${esc(rarity.className)} ${hidden?'box-detail-secret':''}"><span class="box-detail-image">${hidden?'<span class="box-secret-shadow">?</span>':platformImageMarkup(drop.image_url,drop.name)}</span><strong>${esc(hidden?'Ítem '+rarity.label:drop.name)}</strong><small>${esc(hidden?'Premio oculto':String(drop.chance)+'% · '+rarity.label)}</small></div>`;
    }).join('') || '<p>Esta caja aún no tiene premios.</p>'}</div>`;
  } catch(error) {
    preview.innerHTML=`<p>Premios no disponibles: ${esc(friendlyError(error))}</p>`;
  }
}

function platformToggleBoxFields() {
  const checked = Boolean($('#admin-item-is-box')?.checked);
  $('#admin-box-config')?.classList.toggle('hidden',!checked);
  if (checked && !$('#admin-box-drops')?.children.length) platformAddBoxDropRow();
}

function platformAddBoxDropRow(itemId='',chance='',hidden=false) {
  const host=$('#admin-box-drops');
  if (!host) return;
  const valid = platformAdminItems.filter(item=>item.active && !item.is_box && String(item.id)!==String(platformAdminEditingItemId));
  const row=document.createElement('div');
  row.className='admin-box-drop-row';
  row.innerHTML=`<select class="admin-box-drop-item" aria-label="Premio" required><option value="">Selecciona premio</option>${valid.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(platformRarity(item).label)}</option>`).join('')}</select><div class="admin-box-drop-chance"><input type="number" class="admin-box-drop-percent" min="0.0001" max="100" step="0.0001" placeholder="Prob. %" aria-label="Probabilidad en porcentaje" value="${esc(chance)}"><span>%</span></div><label class="admin-box-drop-hidden" title="Ocultar el premio a usuarios"><input type="checkbox" class="admin-box-drop-secret" ${hidden?'checked':''}> Oculto</label><button class="inventory-secondary-button compact" type="button" data-box-drop-remove aria-label="Quitar premio">×</button>`;
  host.appendChild(row);
  row.querySelector('select').value=String(itemId || '');
  platformUpdateBoxPercent();
}

function platformUpdateBoxPercent() {
  const total=$$('#admin-box-drops .admin-box-drop-percent').reduce((sum,field)=>sum+Number(field.value || 0),0);
  const node=$('#admin-box-probability');
  if (node) {
    node.textContent=`Total: ${total.toLocaleString('es-ES',{maximumFractionDigits:4})}% / 100%`;
    node.classList.toggle('correct',Math.abs(total-100)<0.00001);
  }
}

function platformReadBoxDrops() {
  const rows=$$('#admin-box-drops .admin-box-drop-row').map(row=>({
    item_id:String(row.querySelector('select')?.value || ''),
    chance:Number(row.querySelector('.admin-box-drop-percent')?.value || 0),
    hidden:Boolean(row.querySelector('.admin-box-drop-secret')?.checked)
  }));
  if (!rows.length) throw new Error('Añade al menos un premio.');
  if (rows.some(row=>!isValidUuid(row.item_id) || !Number.isFinite(row.chance) || row.chance<=0 || row.chance>100)) throw new Error('Revisa los premios y sus probabilidades.');
  if (new Set(rows.map(row=>row.item_id)).size!==rows.length) throw new Error('No repitas el mismo premio.');
  if (Math.abs(rows.reduce((sum,row)=>sum+row.chance,0)-100)>0.00001) throw new Error('Las probabilidades deben sumar exactamente 100%.');
  if (rows.some(row=>Math.round(row.chance*10000)/10000!==row.chance)) throw new Error('Usa como máximo 4 decimales en las probabilidades.');
  return rows;
}

async function platformLoadBoxEditor(itemId) {
  try {
    const drops=await platformGetBoxDrops(itemId,true);
    if (String(platformAdminEditingItemId)!==String(itemId)) return;
    $('#admin-box-drops')?.replaceChildren();
    drops.forEach(drop=>platformAddBoxDropRow(drop.item_id,String(drop.chance),Boolean(drop.hidden)));
    platformUpdateBoxPercent();
  } catch(error) { platformSetMessage('admin-item-message','No se pudieron cargar los premios: '+friendlyError(error),'error'); }
}

function platformMoney(cents) {
  const n=Number(cents || 0);
  return (n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'€';
}
function platformMoneyToCents(value) {
  const text=String(value ?? '').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Escribe un precio con un máximo de dos decimales.');
  const [whole,fraction='']=text.split('.');
  const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(n) || n>1e12)throw new Error('Importe demasiado grande.');
  return n;
}

function platformSetWalletUI(cents) {
  platformWalletBalance=Math.max(0,Number(cents||0));
  setText('shop-wallet-balance',platformMoney(platformWalletBalance));
  setText('market-wallet',platformMoney(platformWalletBalance));
  $$('#shop-products [data-shop-buy],#shop-featured [data-shop-buy]').forEach(button=>{
    const listing=platformShopListings.find(l=>l.id===button.dataset.shopBuy);
    if(!listing)return;
    const busy=platformShopBuying.has(String(listing.id));
    button.disabled=busy || Number(listing.price_cents)>platformWalletBalance || listing.stock===0 || !listing.active;
    button.textContent=busy?'Comprando...':Number(listing.price_cents)>platformWalletBalance?'Saldo insuficiente':'Comprar ahora';
  });
}

async function platformLoadWallet(initial = false) {
  if (!supabase || !currentUser) return;
  const owner=String(currentUser.id),generation=platformSessionGeneration;
  try {
    const { data,error }=await supabase.rpc('xifre_wallet_get');
    if(error)throw error;
    if(!currentUser || owner!==String(currentUser.id) || generation!==platformSessionGeneration)return;
    platformSetWalletUI(data?.balance_cents);
    if (initial) {
      // Establish the server clock baseline; never claim time prior to login.
      const start=await supabase.rpc('xifre_wallet_heartbeat',{p_active_seconds:0});
      if(start.error)throw start.error;
      if(!currentUser || owner!==String(currentUser.id) || generation!==platformSessionGeneration)return;
      platformSetWalletUI(start.data?.balance_cents);
      platformWalletTickAt=Date.now();
      platformWalletAccumulated=0;
    }
  } catch(error) {
    console.warn('XIFRE WALLET',error);
    if(platformActiveApp==='shop')toast('La economía necesita el SQL nuevo: '+friendlyError(error),'error');
  }
}

function platformStartWalletTimer() {
  if(platformWalletTimer)clearInterval(platformWalletTimer);
  platformWalletTickAt=Date.now();
  platformWalletActivityAt=Date.now();
  platformWalletTimer=setInterval(()=>{
    if (!currentUser || !supabase) return;
    const now=Date.now();
    const elapsed=Math.min(2,Math.max(0,Math.floor((now-platformWalletTickAt)/1000)));
    platformWalletTickAt=now;
    if(document.visibilityState==='visible' && now-platformWalletActivityAt<15000)platformWalletAccumulated=Math.min(12,platformWalletAccumulated+elapsed);
    if(platformWalletAccumulated>=5 && !platformWalletLoading)void platformSendWalletHeartbeat();
  },1000);
}

async function platformSendWalletHeartbeat() {
  if(!currentUser || !supabase || platformWalletLoading || !platformWalletAccumulated)return;
  const owner=String(currentUser.id),generation=platformSessionGeneration;
  const activeSeconds=Math.min(12,platformWalletAccumulated);
  platformWalletAccumulated-=activeSeconds;
  platformWalletLoading=true;
  try {
    const { data,error }=await supabase.rpc('xifre_wallet_heartbeat',{p_active_seconds:activeSeconds});
    if(error)throw error;
    if(generation!==platformSessionGeneration || String(currentUser?.id)!==owner)return;
    platformSetWalletUI(data?.balance_cents);
  } catch(error) {
    if(generation===platformSessionGeneration && String(currentUser?.id)===owner) {
      platformWalletAccumulated=Math.min(12,platformWalletAccumulated+activeSeconds);
      console.warn('XIFRE WALLET HEARTBEAT',error);
    }
  } finally {platformWalletLoading=false;}
}

async function platformLoadShop() {
  if(!currentUser || !supabase)return;
  const owner=String(currentUser.id),generation=platformSessionGeneration;
  const {data,error}=await supabase.rpc('xifre_shop_catalog',{p_include_inactive:platformShopOwner});
  if(error) {
    console.error('XIFRE SHOP',error);
    platformApplyMarkup($('#shop-featured'),`<div class="shop-empty">No se pudo cargar la tienda. Comprueba la migración SQL.<small>${esc(friendlyError(error))}</small></div>`);
    return;
  }
  const listings=Array.isArray(data)?data:[];
  const urls=await platformSignImagePaths(listings.map(row=>row.image_path));
  if(generation!==platformSessionGeneration || String(currentUser?.id)!==owner)return;
  platformShopListings=listings.map(row=>({...row,image_url:urls.get(row.image_path)||''}));
  platformRenderShop();
  platformUpdateListingBadges('shop',platformShopListings.filter(r=>r.active));
  if(platformShopOwner) {
    if(!platformAdminItems.length)void platformLoadAdminData();
    platformPopulateShopAdminSelect();
    platformRenderShopAdminList();
  }
}

function platformShopListingMarkup(listing, featured = false) {
  const rarity=platformRarity(listing);
  const disabled=!listing.active || !listing.item_active || listing.stock===0;
  const price=platformMoney(listing.price_cents);
  const theme=['indigo','gold','rose','cyan','green','violet'].includes(listing.theme)?listing.theme:'indigo';
  return `<article class="shop-listing rarity-${esc(rarity.className)} shop-theme-${esc(theme)} ${featured?'shop-listing-featured':listing.placement==='special'?'shop-listing-special':''} ${listing.glow?'shop-listing-glow':''} ${disabled?'shop-listing-disabled':''}">
    <div class="shop-listing-visual"><span class="shop-listing-rings"></span>${listing.badge_text?`<span class="shop-listing-badge">${esc(listing.badge_text)}</span>`:''}
      ${listing.is_box?'<span class="shop-listing-box-mark">✦ CAJA SORPRESA</span>':''}
      <div class="shop-listing-image">${platformImageMarkup(listing.image_url,listing.name)}</div>
    </div>
    <div class="shop-listing-information"><span class="shop-listing-rarity">${esc(rarity.label.toUpperCase())}</span><h3>${esc(listing.name)}</h3><p>${esc(listing.description || 'Objeto de XIFRE')}</p>
      <div class="shop-listing-bottom"><div><small>PRECIO</small><strong>${esc(price)}</strong>${listing.stock!==null?`<span class="shop-listing-stock">${listing.stock} disponibles</span>`:''}</div><button type="button" data-shop-buy="${esc(listing.id)}" ${disabled?'disabled':''} class="shop-buy-button">${disabled?'No disponible':'Comprar ahora'}</button></div>
    </div>
  </article>`;
}

function platformRenderShop() {
  const available=platformShopListings.filter(item=>item.active && item.item_active && item.stock!==0);
  const featured=available.filter(item=>item.placement==='featured');
  const rest=available.filter(item=>item.placement!=='featured');
  const hero=featured[0] || available[0];
  const others=hero?available.filter(item=>item.id!==hero.id):[];
  platformApplyMarkup($('#shop-featured'),hero?platformShopListingMarkup(hero,true):'<div class="shop-empty">Todavía no hay ofertas destacadas. Pronto aparecerán nuevos objetos.</div>');
  platformApplyMarkup($('#shop-products'),others.length?others.map(item=>platformShopListingMarkup(item)).join(''):'<div class="shop-empty">Pronto habrá más ofertas.</div>');
  setText('shop-count',`${available.length} ${available.length===1?'artículo':'artículos'}`);
  platformSetWalletUI(platformWalletBalance);
}

function platformPopulateShopAdminSelect() {
  const select=$('#shop-admin-item');
  if(!select)return;
  const selected=select.value;
  select.innerHTML='<option value="">Elige un objeto...</option>'+platformAdminItems.filter(item=>item.active).map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(platformRarity(item).label)}${item.is_box?' · CAJA':''}</option>`).join('');
  if(selected && platformAdminItems.some(item=>String(item.id)===selected))select.value=selected;
}

function platformRenderShopAdminList() {
  const host=$('#shop-admin-list');
  if(!host)return;
  const rows=platformShopListings;
  platformApplyMarkup(host,rows.length?rows.map(row=>`<div class="shop-admin-row"><div><strong>${esc(row.name)}</strong><small>${esc(platformMoney(row.price_cents))} · ${esc(row.placement)} · ${esc(row.theme)} ${row.active?'':'· OCULTA'}</small></div><div><button class="inventory-secondary-button compact" type="button" data-shop-edit="${esc(row.id)}">Editar</button>${row.active?`<button class="inventory-secondary-button compact" type="button" data-shop-disable="${esc(row.id)}">Ocultar</button>`:''}</div></div>`).join(''):'<p class="shop-empty">Aún no hay artículos publicados.</p>');
}

function platformResetShopForm() {
  $('#shop-admin-form')?.reset();
  platformShopEditingId=null;
  setText('shop-admin-form-title','Nueva oferta');
  setText('shop-admin-save','Publicar oferta');
  setText('shop-admin-message','');
}

function platformEditShopListing(listingId) {
  if(!platformShopOwner)return;
  const row=platformShopListings.find(item=>item.id===String(listingId));
  if(!row)return;
  platformShopEditingId=row.id;
  $('#shop-admin-item').value=row.item_id;
  $('#shop-admin-price').value=(Number(row.price_cents)/100).toFixed(2);
  $('#shop-admin-placement').value=row.placement;
  $('#shop-admin-badge').value=row.badge_text || '';
  $('#shop-admin-theme').value=row.theme || 'indigo';
  $('#shop-admin-glow').checked=Boolean(row.glow);
  $('#shop-admin-active').checked=Boolean(row.active);
  $('#shop-admin-stock').value=row.stock === null ? '' : String(row.stock);
  setText('shop-admin-form-title','Editar oferta');
  setText('shop-admin-save','Guardar cambios');
  $('#shop-admin-form')?.scrollIntoView({behavior:'smooth',block:'start'});
}

async function platformSaveShopListing(event) {
  event.preventDefault();
  if(!platformShopOwner)return;
  const button=$('#shop-admin-save');
  setLoading(button,true);
  try {
    const stockText=String($('#shop-admin-stock')?.value||'').trim();
    const stock=stockText===''?null:Number(stockText);
    if(stock!==null && (!Number.isInteger(stock) || stock<0 || stock>1000000))throw new Error('Existencias inválidas.');
    const { error }=await supabase.rpc('xifre_admin_shop_save_listing',{
      p_listing_id:platformShopEditingId,
      p_item_id:$('#shop-admin-item').value,
      p_price_cents:platformMoneyToCents($('#shop-admin-price').value),
      p_placement:$('#shop-admin-placement').value,
      p_badge_text:$('#shop-admin-badge').value.trim(),
      p_theme:$('#shop-admin-theme').value,
      p_glow:$('#shop-admin-glow').checked,
      p_stock:stock,
      p_active:$('#shop-admin-active').checked
    });
    if(error)throw error;
    platformResetShopForm();
    await platformLoadShop();
    toast('Oferta de la tienda guardada.','success');
  } catch(error) {
    setText('shop-admin-message','Error: '+friendlyError(error));
    toast(friendlyError(error),'error');
  } finally {setLoading(button,false);}
}

async function platformDisableShopListing(id) {
  if(!platformShopOwner)return;
  try {
    const {error}=await supabase.rpc('xifre_admin_shop_delete_listing',{p_listing_id:id});
    if(error)throw error;
    await platformLoadShop();
    toast('Oferta ocultada.','success');
  }catch(error){toast(friendlyError(error),'error');}
}

async function platformBuyShopItem(id) {
  if(!currentUser || !isValidUuid(id) || platformShopBuying.has(String(id)))return;
  const listing=platformShopListings.find(row=>String(row.id)===String(id));
  if(!listing || !listing.active || listing.stock===0)return;
  if(platformWalletBalance<Number(listing.price_cents))return toast('Necesitas más saldo para comprar este objeto.','info');
  platformShopBuying.add(String(id));
  const requestId=platformPurchaseRequestIds.get(String(id)) || (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  platformPurchaseRequestIds.set(String(id),requestId);
  platformSetWalletUI(platformWalletBalance);
  try {
    const {data,error}=await supabase.rpc('xifre_shop_purchase',{p_listing_id:id,p_request_id:requestId});
    if(error)throw error;
    platformPurchaseRequestIds.delete(String(id));
    platformSetWalletUI(data?.balance_cents);
    await Promise.all([platformLoadBoxMeta(),platformLoadShop()]);
    await platformRefreshInventory();
    toast('¡Compra completada! Ya tienes el objeto en tu inventario.','success');
  }catch(error){toast(friendlyError(error),'error');}
  finally {platformShopBuying.delete(String(id));platformSetWalletUI(platformWalletBalance);}
}

function platformSearchShopMoneyUsers(value) {
  if(!platformShopOwner)return;
  if(platformShopSearchTimer)clearTimeout(platformShopSearchTimer);
  const query=String(value || '').replace(/^@/,'').trim();
  platformShopSelectedRecipient=null;
  $('#shop-money-selected')?.classList.add('hidden');
  if(query.length<2) {
    setText('shop-money-results','Escribe al menos 2 letras.');
    return;
  }
  setText('shop-money-results','Buscando...');
  const owner=String(currentUser?.id||'');
  platformShopSearchTimer=setTimeout(async()=>{
    const {data,error}=await supabase.rpc('xifre_admin_search_users',{p_query:query});
    if(String(currentUser?.id)!==owner || $('#shop-money-search')?.value?.replace(/^@/,'').trim()!==query)return;
    if(error){setText('shop-money-results',friendlyError(error));return;}
    platformShopSearchRows=Array.isArray(data)?data:[];
    platformApplyMarkup($('#shop-money-results'),platformShopSearchRows.length?platformShopSearchRows.map(row=>`<button type="button" data-shop-user="${esc(row.id)}"><strong>${esc(row.username)}</strong><small>@${esc(row.email_handle || row.username)}</small></button>`).join(''):'No se han encontrado usuarios.');
  },250);
}

function platformSelectShopMoneyUser(id) {
  const user=platformShopSearchRows.find(row=>String(row.id)===String(id));
  if(!user)return;
  platformShopSelectedRecipient=user;
  setText('shop-money-selected',`Destinatario: ${user.username} (@${user.email_handle || user.username})`);
  $('#shop-money-selected')?.classList.remove('hidden');
  setText('shop-money-results','Usuario seleccionado.');
}

async function platformGiveShopMoney(event) {
  event.preventDefault();
  if(!platformShopOwner)return;
  const button=$('#shop-money-submit');
  setLoading(button,true);
  try {
    if(!platformShopSelectedRecipient?.id)throw new Error('Selecciona primero un usuario.');
    const amount=platformMoneyToCents($('#shop-money-amount').value);
    if(amount<=0)throw new Error('El importe tiene que ser positivo.');
    const {error}=await supabase.rpc('xifre_admin_give_money',{p_target_user:platformShopSelectedRecipient.id,p_amount_cents:amount});
    if(error)throw error;
    setText('shop-money-message',`Se han entregado ${platformMoney(amount)} a ${platformShopSelectedRecipient.username}.`);
    if(String(platformShopSelectedRecipient.id)===String(currentUser.id))await platformLoadWallet();
    toast('Saldo entregado.','success');
  }catch(error){setText('shop-money-message','Error: '+friendlyError(error));}
  finally {setLoading(button,false);}
}

function platformPickCosmeticDrop(drops) {
  const sum=drops.reduce((s,x)=>s+Number(x.chance||0),0);
  let roll=Math.random()*sum;
  for(const item of drops){roll-=Number(item.chance||0);if(roll<=0)return item;}
  return drops[drops.length-1];
}

async function platformOpenBox(instanceId) {
  if(platformBoxOpeningBusy || !currentUser || !platformBoxInstances.has(String(instanceId)))return;
  const item=platformInventoryItems.find(row=>platformItemKey(row)===String(instanceId));
  if(!item)return toast('Esta caja ya no está en tu inventario.','error');
  const boxId=platformBoxIdFor(item);
  platformBoxOpeningBusy=true;
  platformBoxSpinToken++;
  const token=platformBoxSpinToken;
  const button=$('#item-open-box-button');
  if(button)button.disabled=true;
  try {
    const drops=await platformGetBoxDrops(boxId);
    if(!drops.length)throw new Error('Esta caja todavía no tiene premios configurados.');
    // The prize and inventory change happen ATOMICALLY at the server; the reel is cosmetic only.
    const {data,error}=await supabase.rpc('xifre_box_open',{p_inventory_instance_id:instanceId});
    if(error)throw error;
    if(!data?.item_id)throw new Error('Respuesta de caja incompleta. Actualiza el inventario.');
    const prize= {...data};
    const paths=await platformSignImagePaths([prize.image_path]);
    prize.image_url=paths.get(prize.image_path)||'';
    closeModal('item-details-modal');
    openModal('box-opening-modal');
    $('#box-opening-result')?.classList.add('hidden');
    $('#box-opening-done')?.classList.add('hidden');
    setText('box-opening-title','¡Abriendo caja!');
    setText('box-opening-hint','El premio ya está guardado en tu colección.');
    const reel=$('#box-reel-strip');
    const rolls=Array.from({length:55},(_,i)=>i===47?prize:platformPickCosmeticDrop(drops));
    reel.innerHTML=rolls.map((row,i)=>`<div class="box-reel-card rarity-${esc(platformRarity(row).className)} ${i===47?'box-winning-card':''}"><span>${row.hidden && !platformShopOwner?'<span class="box-secret-shadow">?</span>':platformImageMarkup(row.image_url,row.name)}</span><strong>${esc(row.hidden && !platformShopOwner?'Ítem '+platformRarity(row).label:row.name)}</strong><small>${esc(platformRarity(row).label)}</small></div>`).join('');
    reel.style.transition='none';
    reel.style.transform='translate3d(0,0,0)';
    const windowEl=$('#box-reel-window');
    const reelCards=reel.querySelectorAll('.box-reel-card');
    const target=reelCards[47];
    if(!windowEl || !target)throw new Error('No se puede mostrar la animación. El premio ya se ha entregado.');
    await platformLoadBoxMeta();
    await platformRefreshInventory();
    // Two animation frames force initial paint; the reel lands with a slight randomized offset.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(token!==platformBoxSpinToken)return;
      const targetX=-(target.offsetLeft + target.offsetWidth/2 - windowEl.clientWidth/2 + (Math.random()*12-6));
      reel.style.transition='transform 5500ms cubic-bezier(.10,.73,.09,1)';
      reel.style.transform=`translate3d(${targetX}px,0,0)`;
    }));
    platformBoxSpinTimer=setTimeout(()=>{
      if(token!==platformBoxSpinToken)return;
      platformBoxOpeningBusy=false;
      setText('box-opening-title','¡Nuevo objeto conseguido!');
      const rarity=platformRarity(prize);
      $('#box-opening-result').innerHTML=`<div class="box-result-visual rarity-${esc(rarity.className)}">${platformImageMarkup(prize.image_url,prize.name)}</div><span class="box-result-rarity">${esc(rarity.label)}</span><strong>${esc(prize.name)}</strong><small>Valor ${esc(platformFormatValue(prize.value))}</small>`;
      $('#box-opening-result')?.classList.remove('hidden');
      $('#box-opening-done')?.classList.remove('hidden');
      setText('box-opening-hint','Objeto añadido a tu inventario.');
    },5750);
  }catch(error) {
    console.error('XIFRE BOX OPEN',error);
    toast(friendlyError(error),'error');
    platformBoxOpeningBusy=false;
    void platformRefreshInventory();
    void platformLoadBoxMeta();
  } finally {if(button)button.disabled=false;}
}

function platformFinishBoxOpening() {
  if(platformBoxOpeningBusy)return;
  if(platformBoxSpinTimer)clearTimeout(platformBoxSpinTimer);
  platformBoxSpinToken++;
  closeModal('box-opening-modal');
  platformSetApp('inventory');
  platformSetInventoryTab('collection');
}

/* ==============================================================
   XIFRE ALPHA 1.4 — MARKET / NOTIFICATIONS / VISUAL EDITOR
   ============================================================= */
let platformMarketListings = [];
let platformMarketMyListings = [];
let platformMarketInventory = [];
let platformMarketHistory = [];
let platformMarketSelectedInstance = '';
let platformMarketTab = 'explore';
let platformMarketLoadBusy = false;
let platformMarketRefreshQueued = false;
let platformMarketRefreshTimer = null;
const platformMarketPurchaseRequests = new Map();
const platformMarketMutations = new Set();
const platformNotifications = {chat:0,inventory:0,shop:0,market:0};
let platformReadTradeIds = new Set();
let platformChatBadgeBaseline = 0;
let platformUiRecords = [];
let platformUiEditingApp = 'chat';
let platformUiLoaded = false;
const PLATFORM_EDIT_FIELDS = {
  chat:[['chat-title','Título CHAT'],['chat-group','Botón Nuevo grupo'],['chat-friends','Botón Amigos'],['chat-banner','Imagen sobre la ventana de chat']],
  inventory:[['inventory-title','Título Inventario'],['inventory-subtitle','Descripción Inventario'],['inventory-trades','Botón Intercambios'],['inventory-banner','Imagen del Inventario']],
  shop:[['shop-title','Título Tienda'],['shop-subtitle','Descripción Tienda'],['shop-banner','Imagen de la Tienda']],
  market:[['market-title','Título Mercado'],['market-subtitle','Descripción Mercado'],['market-banner','Imagen del Mercado']]
};
const PLATFORM_UI_SELECTORS = {
  'chat-title':'.chat-brand-label > span',
  'chat-group':'[data-action="open-group"] > span:last-child',
  'chat-friends':'[data-action="open-people"] > span:nth-child(2)',
  'inventory-title':'.inventory-header-title h1',
  'inventory-subtitle':'.inventory-header-title p',
  'inventory-trades':'[data-inventory-tab="trades"] > span:nth-child(2)',
  'shop-title':'#shop-title-text',
  'shop-subtitle':'.shop-header > div:first-of-type p',
  'market-title':'#market-heading',
  'market-subtitle':'#market-subheading'
};

function platformUpdateTitleAndBadges() {
  let total=0;
  for(const id of ['chat','inventory','shop','market']) {
    const amount=Math.max(0,Math.floor(Number(platformNotifications[id])||0));
    const badge=$(`#notification-${id}`);
    if(badge) {
      badge.textContent=amount>99?'99+':String(amount);
      badge.classList.toggle('hidden',amount===0);
      badge.setAttribute('aria-label',`${amount} notificaciones`);
    }
    total+=amount;
  }
  document.title=total?`XIFRE (${total>99?'99+':total})`:'XIFRE';
}
function platformNotify(app,amount) {
  if(!Object.prototype.hasOwnProperty.call(platformNotifications,app)) return;
  platformNotifications[app]=Math.max(0,Math.round(Number(amount)||0));
  platformUpdateTitleAndBadges();
}
function platformReadKey(app) {return `xifre_a14_seen_${app}_${currentUser?.id||'anonymous'}`;}
function platformLastSeen(app) {
  try {
    const key=platformReadKey(app);
    const raw=localStorage.getItem(key);
    if(raw===null){const now=Date.now();localStorage.setItem(key,String(now));return now;}
    return Number(raw)||0;
  }catch(_){return Date.now();}
}
function platformMarkAppSeen(app) {
  try{localStorage.setItem(platformReadKey(app),String(Date.now()));}catch(_){/* ephemeral */}
  if(app==='inventory') platformReadTradeIds=new Set(platformTrades.filter(t=>t.status==='pending' && String(t.recipient_id)===String(currentUser?.id)).map(t=>String(t.id)));
  if(app==='chat') platformChatBadgeBaseline=platformUnreadChatTotal();
  platformNotify(app,0);
}
function platformUnreadChatTotal() {
  const fromChats=conversationCache.reduce((sum,row)=>sum+Math.max(0,Number(row.unread_count||0)),0);
  const friendRequest=Number($('#friend-request-badge')?.textContent||0);
  return fromChats+(Number.isFinite(friendRequest)?friendRequest:0);
}
function platformUpdateChatBadges(){
  if(platformActiveApp==='chat') return platformNotify('chat',0);
  platformNotify('chat',Math.max(0,platformUnreadChatTotal()-platformChatBadgeBaseline));
}
function platformUpdateTradeBadges(){
  const incoming=platformTrades.filter(t=>t.status==='pending' && String(t.recipient_id)===String(currentUser?.id));
  if(platformActiveApp==='inventory')platformReadTradeIds=new Set(incoming.map(t=>String(t.id)));
  platformNotify('inventory',platformActiveApp==='inventory'?0:incoming.filter(t=>!platformReadTradeIds.has(String(t.id))).length);
}
function platformUpdateListingBadges(app,rows) {
  if(platformActiveApp===app){platformMarkAppSeen(app);return;}
  const since=platformLastSeen(app);
  platformNotify(app,rows.filter(row=>new Date(row.created_at||0).getTime()>since).length);
}
function platformRarityMarketClass(item){return `rarity-${esc(platformRarity(item).className)}`;}
async function platformLoadMarket(withInventory=false) {
  if(!currentUser || !supabase)return;
  if(platformMarketLoadBusy){platformMarketRefreshQueued=true;return;}
  platformMarketLoadBusy=true;
  const owner=String(currentUser.id),generation=platformSessionGeneration;
  try {
    const jobs=[supabase.rpc('xifre_market_catalog',{p_only_mine:false}),supabase.rpc('xifre_market_catalog',{p_only_mine:true})];
    jobs.push(supabase.rpc('xifre_market_inventory'));
    const results=await Promise.all(jobs);
    for(const result of results)if(result.error)throw result.error;
    if(!currentUser || String(currentUser.id)!==owner || generation!==platformSessionGeneration)return;
    const all=Array.isArray(results[0].data)?results[0].data:[];
    const mine=Array.isArray(results[1].data)?results[1].data:[];
    const inv=results[2]?Array.isArray(results[2].data)?results[2].data:[]:platformMarketInventory;
    const urls=await platformSignImagePaths([...all,...mine,...inv].map(x=>x.image_path));
    if(!currentUser || String(currentUser.id)!==owner || generation!==platformSessionGeneration)return;
    const img=(r)=>({...r,image_url:urls.get(r.image_path)||''});
    await platformLoadItemFeatures();
    platformMarketListings=all.map(row=>platformHydrateItem(img(row)));
    platformMarketMyListings=mine.map(row=>platformHydrateItem(img(row)));
    if(results[2])platformMarketInventory=inv.map(row=>platformHydrateItem(img(row)));
    if(platformInventoryItems.length) {
      const reservedIds=new Set(platformMarketMyListings.filter(r=>r.status==='active').map(r=>String(r.inventory_instance_id)));
      for(const item of platformInventoryItems) if(reservedIds.has(platformItemKey(item))) item.reserved=true;
      if(platformActiveApp==='inventory')platformRenderInventory();
    }
    platformUpdateListingBadges('market',platformMarketListings.filter(r=>r.seller_id!==owner));
    if(platformActiveApp==='market')platformRenderMarket();
  }catch(error){
    console.warn('XIFRE MARKET',error);
    if(platformActiveApp==='market') platformApplyMarkup($('#market-listings'),`<div class="market-empty">No se puede cargar el Mercado. ${esc(friendlyError(error))}</div>`);
  }finally{
    platformMarketLoadBusy=false;
    if(platformMarketRefreshQueued && currentUser){
      platformMarketRefreshQueued=false;
      queueMicrotask(()=>{void platformLoadMarket(true);});
    }
  }
}
function platformMarketListingHTML(listing,{mine=false}={}) {
  const owner=String(currentUser?.id||'')===String(listing.seller_id);
  const rarity=platformRarity(listing);
  const status=listing.status;
  return `<article class="market-listing ${platformRarityMarketClass(listing)} ${platformGradeClass(listing)}">
    <div class="market-art">${platformImageMarkup(listing.image_url,listing.name)}</div>
    <span class="market-rarity">${esc(rarity.label.toUpperCase())}</span>
    <h3 title="${esc(listing.name)}">${esc(listing.name)}</h3>
    <small class="market-seller">${mine?`Estado: ${esc(status==='active'?'En venta':status==='sold'?'Vendida':'Cancelada')}`:`Vendedor: @${esc(listing.seller_name||'Usuario')}`}</small>
    <div class="market-price-row"><strong>${esc(platformMoney(listing.price_cents))}</strong>
      ${mine&&status==='active'?`<button data-market-cancel="${esc(listing.id)}" type="button" class="inventory-secondary-button compact">Retirar</button>`:
        owner?'<span class="market-own-tag">Tu oferta</span>':status==='active'?`<button data-market-buy="${esc(listing.id)}" class="inventory-primary-button compact" type="button" ${platformWalletBalance<Number(listing.price_cents)?'disabled title="Saldo insuficiente"':''}>Comprar</button>`:'<span class="market-own-tag">Cerrada</span>'}
    </div>
  </article>`;
}
function platformRenderMarket() {
  const q=normalizeUsername($('#market-search')?.value||'');
  const rarity=$('#market-filter-rarity')?.value||'';
  const items=platformMarketListings.filter(l=>(!q || normalizeUsername(l.name).includes(q) || normalizeUsername(l.seller_name).includes(q)) && (!rarity||l.rarity===rarity))
    .sort((a,b)=>Number(a.price_cents)-Number(b.price_cents) || new Date(a.created_at)-new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
  platformApplyMarkup($('#market-listings'),items.length?items.map(i=>platformMarketListingHTML(i)).join(''):'<div class="market-empty">No hay ofertas que coincidan con tu búsqueda.</div>');
  setText('market-count',`${items.length} ${items.length===1?'oferta':'ofertas'} · Orden: más barato primero`);
  platformApplyMarkup($('#market-my-listings'),platformMarketMyListings.length?platformMarketMyListings.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(i=>platformMarketListingHTML(i,{mine:true})).join(''):'<div class="market-empty">Todavía no has publicado ofertas.</div>');
  platformRenderMarketInventory();
  setText('market-wallet',platformMoney(platformWalletBalance));
  $$('[data-market-tab]').forEach(b=>b.classList.toggle('active',b.dataset.marketTab===platformMarketTab));
  $$('.market-panel').forEach(p=>p.classList.toggle('active',p.id===`market-panel-${platformMarketTab}`));
}
function platformRenderMarketInventory() {
  const excluded=new Set(platformMarketMyListings.filter(r=>r.status==='active').map(r=>String(r.inventory_instance_id)));
  const items=platformMarketInventory.filter(i=>!i.listed&&!i.reserved&&!excluded.has(String(i.instance_id)));
  const host=$('#market-my-inventory');
  platformApplyMarkup(host,items.length?items.map(item=>`<button type="button" data-market-select="${esc(item.instance_id)}" class="market-inventory-item ${platformRarityMarketClass(item)} ${platformMarketSelectedInstance===String(item.instance_id)?'active':''}">
    <span class="market-art">${platformImageMarkup(item.image_url,item.name)}</span><strong>${esc(item.name)}</strong><small>${esc(platformRarity(item).label)} · ${esc(platformFormatValue(item.value))}</small></button>`).join(''):'<div class="market-empty">No hay objetos disponibles. Los objetos puestos a la venta o en un intercambio están reservados.</div>');
  const selected=items.find(i=>String(i.instance_id)===platformMarketSelectedInstance);
  $('#market-sell-selection')?.classList.toggle('hidden',!selected);
  if(selected){
    setText('market-sell-selected',`${selected.name} · ${platformRarity(selected).label}`);
    setText('market-instant-price',platformMoney(selected.instant_sell_cents));
  }else platformMarketSelectedInstance='';
}
function platformSelectMarketItem(id){platformMarketSelectedInstance=String(id);platformRenderMarketInventory();$('#market-sell-selection')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function platformMarketCreateListing(event) {
  event.preventDefault();
  const id=platformMarketSelectedInstance;
  if(!id || platformMarketMutations.has(id))return;
  platformMarketMutations.add(id);
  const button=$('#market-list-submit');setLoading(button,true);
  try {
    const cents=platformMoneyToCents($('#market-list-price').value);
    if(cents<1)throw new Error('El precio mínimo es 0.01€.');
    const {error}=await supabase.rpc('xifre_market_list_item',{p_instance_id:id,p_price_cents:cents});
    if(error)throw error;
    platformMarketSelectedInstance='';
    await platformLoadMarket(true);
    await platformRefreshInventory();
    toast('Tu oferta ya está publicada en el Mercado.','success');
    platformSetMarketTab('my');
  }catch(error){toast(friendlyError(error),'error');}
  finally{platformMarketMutations.delete(id);setLoading(button,false);}
}
async function platformMarketCancelListing(id){
  if(platformMarketMutations.has(id))return;
  platformMarketMutations.add(id);
  try{
    const {error}=await supabase.rpc('xifre_market_cancel',{p_listing_id:id});if(error)throw error;
    await platformLoadMarket(true);await platformRefreshInventory();toast('Oferta retirada. Tu copia vuelve a estar disponible.','success');
  }catch(error){toast(friendlyError(error),'error');}
  finally{platformMarketMutations.delete(id);}
}
async function platformMarketBuy(id) {
  if(platformMarketMutations.has(id))return;
  const row=platformMarketListings.find(x=>String(x.id)===String(id));
  if(!row || String(row.seller_id)===String(currentUser?.id))return;
  if(platformWalletBalance<Number(row.price_cents))return toast('Saldo insuficiente.','info');
  platformMarketMutations.add(id);
  const requestId=platformMarketPurchaseRequests.get(id)||crypto.randomUUID();
  platformMarketPurchaseRequests.set(id,requestId);
  try{
    const {data,error}=await supabase.rpc('xifre_market_buy',{p_listing_id:id,p_request_id:requestId});
    if(error)throw error;
    platformMarketPurchaseRequests.delete(id);
    if(typeof data?.balance_cents==='number')platformSetWalletUI(data.balance_cents);
    await Promise.all([platformLoadWallet(false),platformLoadMarket(true),platformLoadBoxMeta()]);
    await platformRefreshInventory();
    toast('¡Compra completada! El artículo ya es tuyo.','success');
  }catch(error){toast(friendlyError(error),'error');}
  finally{platformMarketMutations.delete(id);}
}
async function platformMarketInstantSell(forcedInstanceId=null) {
  const id=String(forcedInstanceId||platformMarketSelectedInstance);
  const row=platformMarketInventory.find(i=>String(i.instance_id)===id)||platformInventoryItems.find(i=>platformItemKey(i)===id);
  if(!row || platformMarketMutations.has(id))return;
  const confirmed=await askConfirm('Venta instantánea',`¿Vender ${row.name} por ${platformMoney(row.instant_sell_cents)}? No se puede recuperar esta copia.`, 'Vender ahora');
  if(!confirmed)return;
  platformMarketMutations.add(id);
  const requestId=crypto.randomUUID();
  try {
    const {data,error}=await supabase.rpc('xifre_market_instant_sell',{p_instance_id:id,p_request_id:requestId});
    if(error)throw error;
    if(platformMarketSelectedInstance===id)platformMarketSelectedInstance='';
    closeModal('item-details-modal');
    await platformLoadItemFeatures(true);
    if(typeof data?.balance_cents==='number')platformSetWalletUI(data.balance_cents);
    await Promise.all([platformLoadWallet(false),platformLoadMarket(true),platformRefreshInventory(),platformLoadBoxMeta()]);
    toast(`Vendido inmediatamente por ${platformMoney(data.price_cents)}.`, 'success');
  }catch(error){toast(friendlyError(error),'error');}
  finally{platformMarketMutations.delete(id);}
}
function platformSetMarketTab(tab){
  if(!['explore','sell','my','history'].includes(tab))return;
  platformMarketTab=tab;
  if(tab==='sell')void platformLoadMarket(true);
  if(tab==='history')void platformMarketLoadHistory();
  platformRenderMarket();
}
async function platformMarketLoadHistory(){
  const owner=String(currentUser?.id||'');
  const {data,error}=await supabase.rpc('xifre_market_history');
  if(error){toast('No se pudo cargar el historial: '+friendlyError(error),'error');return;}
  if(String(currentUser?.id)!==owner)return;
  platformMarketHistory=Array.isArray(data)?data:[];
  platformApplyMarkup($('#market-history'),platformMarketHistory.length?platformMarketHistory.map(r=>`<div class="market-history-row"><span>${esc(r.action==='venta'?'Vendido':r.action==='instant'?'Venta inmediata':'Comprado')}: ${esc(r.name)} · ${esc(platformRarity(r).label)}</span><strong>${esc(platformMoney(r.price_cents))}</strong></div>`).join(''):'<div class="market-empty">No hay compras ni ventas todavía.</div>');
}

async function platformAdminLoadAssets(){
  if(!platformShopOwner || !platformAdminRecipient?.id)return;
  const target=String(platformAdminRecipient.id),owner=String(currentUser?.id);
  setText('admin-assets-user',`Cuenta: @${platformAdminRecipient.username||'Usuario'}`);
  $('#admin-assets-content')?.classList.remove('hidden');
  const {data,error}=await supabase.rpc('xifre_admin_user_assets',{p_target_user:target});
  if(error){toast('No se pudieron cargar los bienes: '+friendlyError(error),'error');return;}
  if(!currentUser || owner!==String(currentUser.id) || String(platformAdminRecipient?.id)!==target)return;
  setText('admin-assets-balance',platformMoney(data?.balance_cents));
  const urls=await platformSignImagePaths((data?.items||[]).map(r=>r.image_path));
  if(String(platformAdminRecipient?.id)!==target)return;
  const host=$('#admin-assets-items');
  platformApplyMarkup(host,(data?.items||[]).length?(data.items||[]).map(row=>{
    const rarity=platformRarity(row),locked=Boolean(row.reserved);
    return `<div class="admin-asset-row ${platformRarityMarketClass(row)}"><span class="admin-asset-thumb">${platformImageMarkup(urls.get(row.image_path)||'',row.name)}</span><div><strong>${esc(row.name)}</strong><small>${esc(rarity.label)} · ${esc(platformFormatValue(row.value))} ${locked?'· EN VENTA':''}</small></div>
    <button type="button" class="inventory-secondary-button compact" data-admin-remove-instance="${esc(row.instance_id)}">Quitar copia</button></div>`;
  }).join(''):'<p class="inventory-inline-empty">Este usuario no tiene objetos.</p>');
}
async function platformAdminAdjustMoney(event){
  event.preventDefault();if(!platformShopOwner || !platformAdminRecipient?.id)return;
  const raw=String($('#admin-assets-money-delta')?.value||'');
  const negative=raw.startsWith('-');
  const amount=platformMoneyToCents(negative?raw.slice(1):raw)*(negative?-1:1);
  if(amount===0)return toast('Introduce un importe distinto de cero.','info');
  const {error}=await supabase.rpc('xifre_admin_adjust_wallet',{p_target_user:platformAdminRecipient.id,p_delta_cents:amount});
  if(error)return toast(friendlyError(error),'error');
  toast('Saldo modificado correctamente.','success');
  await platformAdminLoadAssets();
}
async function platformAdminRemoveInstance(id){
  if(!platformShopOwner || !platformAdminRecipient?.id)return;
  const okay=await askConfirm('Retirar objeto','¿Quitar esta copia del inventario del usuario? Esta acción no se puede deshacer.','Quitar copia');
  if(!okay)return;
  const {error}=await supabase.rpc('xifre_admin_remove_inventory',{p_target_user:platformAdminRecipient.id,p_instance_id:id});
  if(error)return toast(friendlyError(error),'error');
  toast('Copia retirada.','success');
  await platformAdminLoadAssets();
  if(platformAdminRecipient.id===currentUser.id)await platformRefreshInventory();
}
async function platformAdminSaveInstantPrice(itemId,cents){
  const {error}=await supabase.rpc('xifre_admin_set_instant_price',{p_item_id:itemId,p_price_cents:cents});
  if(error)throw error;
}

async function platformUiLoad(){
  if(!currentUser)return;
  const owner=String(currentUser.id),gen=platformSessionGeneration;
  const {data,error}=await supabase.rpc('xifre_ui_get');
  if(error){console.warn('XIFRE UI CONFIG',error);return;}
  if(!currentUser || String(currentUser.id)!==owner || gen!==platformSessionGeneration)return;
  platformUiRecords=Array.isArray(data)?data:[];
  platformUiLoaded=true;
  await platformUiApply();
}
async function platformUiApply(){
  if(!currentUser || !platformUiLoaded)return;
  for(const [key,selector] of Object.entries(PLATFORM_UI_SELECTORS)){
    const node=$(selector);if(!node)continue;
    if(node.__xifreDefaultText===undefined)node.__xifreDefaultText=node.textContent;
    const record=platformUiRecords.find(r=>r.key===key);
    node.textContent=record?.text_value?.trim()||node.__xifreDefaultText;
  }
  const banners=platformUiRecords.filter(r=>r.key.endsWith('-banner') && r.image_path);
  const urls=await platformSignImagePaths(banners.map(r=>r.image_path));
  for(const app of ['chat','inventory','shop','market']){
    const container=$(`#${app}-banner-slot`);if(!container)continue;
    const record=platformUiRecords.find(r=>r.key===`${app}-banner`);
    const url=record?.image_path?urls.get(record.image_path):'';
    if(url){const markup=`<img src="${esc(url)}" alt="Imagen personalizada de ${esc(app)}">`;platformApplyMarkup(container,markup);container.classList.remove('hidden');}
    else{container.classList.add('hidden');container.replaceChildren();delete container.__xifreMarkup;}
  }
}
function platformUiOpenEditor(app){
  if(!platformShopOwner || !PLATFORM_EDIT_FIELDS[app])return;
  platformUiEditingApp=app;
  const select=$('#xifre-editor-key');
  select.innerHTML=PLATFORM_EDIT_FIELDS[app].map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('');
  setText('xifre-editor-title',`Editar ${app.toUpperCase()}`);
  platformUiFillEditor();openModal('xifre-editor-modal');
}
function platformUiFillEditor(){
  const key=$('#xifre-editor-key')?.value||'';
  const rec=platformUiRecords.find(r=>r.key===key);
  const banner=key.endsWith('-banner');
  $('#xifre-editor-text-label')?.classList.toggle('hidden',banner);
  $('#xifre-editor-text').value=rec?.text_value||'';
  $('#xifre-editor-image').value='';$('#xifre-editor-remove-image').checked=false;
  setText('xifre-editor-preview',rec?.image_path?'Hay una imagen guardada. Puedes reemplazarla o quitarla.':'Sin imagen personalizada.');
  setText('xifre-editor-feedback','');
}
async function platformUiSave(event){
  event.preventDefault();if(!platformShopOwner)return;
  const key=$('#xifre-editor-key')?.value||'';
  if(!PLATFORM_EDIT_FIELDS[platformUiEditingApp].some(row=>row[0]===key))return;
  const button=$('#xifre-editor-submit');setLoading(button,true);
  const current=platformUiRecords.find(r=>r.key===key);
  let path=current?.image_path||'';let fresh='';
  try {
    const file=$('#xifre-editor-image')?.files?.[0];
    if($('#xifre-editor-remove-image')?.checked)path='';
    if(file){fresh=await platformUploadImage(file,'ui');path=fresh;}
    const textValue=key.endsWith('-banner')?'':String($('#xifre-editor-text')?.value||'').trim();
    const {error}=await supabase.rpc('xifre_admin_ui_save',{p_key:key,p_text:textValue,p_image_path:path});
    if(error)throw error;
    await platformUiLoad();
    setText('xifre-editor-feedback','Cambios guardados para todos.');
    toast('Interfaz actualizada.','success');
  }catch(error){
    if(fresh)await platformDeleteImage(fresh).catch(()=>{});
    setText('xifre-editor-feedback','Error: '+friendlyError(error));
  }finally{setLoading(button,false);}
}

/* -------------------------------------------------------------------
   ALPHA 1.5 — Inline section editor. No modal, no executable HTML,
   positioned decorations use percentages to survive responsive layout.
   ------------------------------------------------------------------- */
const PLATFORM_INLINE_SECTIONS={
 'chat-nav':{root:'#chat-app-view .left-pane-head',fields:{'xi-chat-title':'.chat-brand-label > span','xi-chat-new-group':'[data-action="open-group"] > span:last-child','xi-chat-friends':'[data-action="open-people"] > span:nth-child(2)'}},
 'chat-main':{root:'#chat-app-view .center-pane',fields:{}},
 'chat-right':{root:'#chat-app-view .right-pane',fields:{}},
 'chat-people':{root:'#people-modal .modal-card',fields:{}},
 'chat-settings':{root:'#settings-modal',fields:{}},
 'inventory-header':{root:'#inventory-app-view .inventory-header',fields:{'xi-inventory-title':'.inventory-header-title h1','xi-inventory-description':'.inventory-header-title p'}},
 'inventory-collection':{root:'#inventory-panel-collection',fields:{'xi-collection-title':'.inventory-panel-heading h2','xi-collection-desc':'.inventory-panel-heading p'}},
 'inventory-trades':{root:'#inventory-panel-trades',fields:{'xi-trades-title':'#trade-list-view .inventory-panel-heading h2','xi-trades-desc':'#trade-list-view .inventory-panel-heading p','xi-trades-new':'#trade-request-form .trade-request-copy > strong'}},
 'inventory-trade-workspace':{root:'#trade-workspace',fields:{'xi-tradework-title':'.trade-workspace-heading h2'}},
 'inventory-admin':{root:'#inventory-panel-admin',fields:{'xi-invadmin-title':'.inventory-panel-heading h2'}},
 'shop-header':{root:'#shop-app-view .shop-header',fields:{'xi-shop-title':'#shop-title-text','xi-shop-description':'.shop-header > div:first-of-type p'}},
 'shop-catalog':{root:'#shop-app-view .shop-scroller',fields:{'xi-shop-intro':'.shop-intro > span','xi-shop-catalog':'.shop-section-heading h2'}},
 'shop-admin':{root:'#shop-admin',fields:{'xi-shop-admin-title':'.shop-admin-top h2'}},
 'market-header':{root:'#market-app-view .market-header',fields:{'xi-market-title':'#market-heading','xi-market-description':'#market-subheading'}},
 'market-explore':{root:'#market-app-view .market-summary',fields:{'xi-market-explore-title':'.market-summary h2','xi-market-explore-desc':'.market-summary span'}},
 'market-sell':{root:'#market-panel-sell',fields:{'xi-market-sell-title':'.market-panel-heading h2','xi-market-sell-desc':'.market-panel-heading p'}},
 'market-my':{root:'#market-panel-my',fields:{'xi-market-my-title':'.market-panel-heading h2','xi-market-my-desc':'.market-panel-heading p'}},
 'market-history':{root:'#market-panel-history',fields:{'xi-market-history-title':'.market-panel-heading h2'}},
 'updates':{root:'#updates-modal .updates-modal-card',fields:{'xi-updates-title':'#updates-title'}}
};
let platformInlineData={texts:[],images:[]};
let platformInlineEditSection='';
let platformInlineLoading=null;
let platformInlineDragging=null;
let platformInlinePrepared=false;
function platformInlineRoot(section){const config=PLATFORM_INLINE_SECTIONS[section];return config?$(config.root):null;}
function platformInlineTextNode(section,key){const config=PLATFORM_INLINE_SECTIONS[section];const root=platformInlineRoot(section);return config&&root&&config.fields[key]?$(config.fields[key],root):null;}
function platformInlineTextSet(node,value){
 if(!node)return;
 const spark=node.querySelector?.('.shop-header-spark');
 if(spark){
   let first=[...node.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
   if(!first){first=document.createTextNode('');node.insertBefore(first,node.firstChild);}
   first.textContent=value;return;
 }
 node.textContent=value;
}
async function platformInlineLoad(){
 if(!currentUser)return;
 if(platformInlineLoading)return platformInlineLoading;
 const uid=String(currentUser.id),gen=platformSessionGeneration;
 platformInlineLoading=(async()=>{
  const {data,error}=await supabase.rpc('xifre_ui_inline_get');
  if(error){console.warn('XIFRE INLINE EDITOR',error);return;}
  if(!currentUser||String(currentUser.id)!==uid||gen!==platformSessionGeneration)return;
  platformInlineData={texts:Array.isArray(data?.texts)?data.texts:[],images:Array.isArray(data?.images)?data.images:[]};
  await platformInlineApply();
  platformInlinePrepare();
 })().finally(()=>{platformInlineLoading=null;});
 return platformInlineLoading;
}
function platformInlinePrepare(){
 for(const [key,config] of Object.entries(PLATFORM_INLINE_SECTIONS)){
  const root=platformInlineRoot(key);if(!root)continue;
  root.classList.add('xi-inline-surface');root.dataset.xiSection=key;
  if(!platformShopOwner){root.querySelector('.xi-inline-pencil')?.remove();continue;}
  if(root.querySelector(':scope > .xi-inline-pencil'))continue;
  const button=document.createElement('button');button.type='button';button.className='xi-inline-pencil';button.title=`Editar este apartado: ${key}`;
  button.setAttribute('aria-label',`Editar sección ${key}`);button.dataset.xiEdit=key;button.innerHTML='✎';root.appendChild(button);
 }
 platformInlinePrepared=true;
}
async function platformInlineApply(){
 for(const [section,config] of Object.entries(PLATFORM_INLINE_SECTIONS)){
  for(const [key] of Object.entries(config.fields)){
   const node=platformInlineTextNode(section,key);if(!node)continue;
   if(node.__xiInitialText===undefined)node.__xiInitialText=node.textContent.trim();
   if(platformInlineEditSection===section)continue;
   const record=platformInlineData.texts.find(row=>row.key===key);
   if(record)platformInlineTextSet(node,record.text_value??node.__xiInitialText);
  }
 }
 await platformInlineDrawImages();
}
async function platformInlineDrawImages(){
 const records=platformInlineData.images;
 const urls=await platformSignImagePaths(records.map(row=>row.image_path));
 for(const section of Object.keys(PLATFORM_INLINE_SECTIONS)){
  const root=platformInlineRoot(section);if(!root)continue;
  root.querySelectorAll(':scope > .xi-overlay-image').forEach(node=>node.remove());
  for(const rec of records.filter(i=>i.section_key===section)){
   const url=urls.get(rec.image_path);if(!url)continue;
   const wrapper=document.createElement('div');wrapper.className='xi-overlay-image';wrapper.dataset.xiImage=rec.id;
   wrapper.style.left=`${Number(rec.x_pct)||0}%`;wrapper.style.top=`${Number(rec.y_pct)||0}%`;wrapper.style.width=`${Number(rec.width_pct)||20}%`;
   wrapper.dataset.x=String(rec.x_pct);wrapper.dataset.y=String(rec.y_pct);wrapper.dataset.w=String(rec.width_pct);
   wrapper.innerHTML=`<img src="${esc(url)}" alt="Decoración de XIFRE" draggable="false"><button type="button" data-xi-image-delete="${esc(rec.id)}" title="Quitar esta imagen" aria-label="Eliminar imagen">×</button><span class="xi-overlay-drag-hint">Arrastra para mover</span>`;
   root.appendChild(wrapper);
  }
  root.classList.toggle('xi-inline-editing',platformInlineEditSection===section);
 }
}
function platformInlineEndEdit(discard=false){
 const section=platformInlineEditSection;
 if(!section)return;
 const root=platformInlineRoot(section);
 if(root){
  for(const key of Object.keys(PLATFORM_INLINE_SECTIONS[section].fields)){
   const node=platformInlineTextNode(section,key);
   if(node){node.contentEditable='false';node.classList.remove('xi-inline-text-edit');}
  }
  root.querySelector(':scope > .xi-inline-toolbar')?.remove();root.classList.remove('xi-inline-editing');
 }
 platformInlineEditSection='';
 if(discard)void platformInlineApply();
}
function platformInlineStart(section){
 if(!platformShopOwner||!PLATFORM_INLINE_SECTIONS[section])return;
 if(platformInlineEditSection===section){platformInlineEndEdit(true);return;}
 platformInlineEndEdit(true);
 const root=platformInlineRoot(section);if(!root)return;
 platformInlineEditSection=section;root.classList.add('xi-inline-editing');
 for(const key of Object.keys(PLATFORM_INLINE_SECTIONS[section].fields)){
  const node=platformInlineTextNode(section,key);
  if(node){node.contentEditable='plaintext-only';node.spellcheck=false;node.classList.add('xi-inline-text-edit');node.dataset.xiKey=key;}
 }
 const toolbar=document.createElement('div');toolbar.className='xi-inline-toolbar';toolbar.innerHTML=`<span>✎ Editando este apartado · Haz clic en los textos o arrastra imágenes</span>
 <label class="xi-inline-upload">＋ Imagen<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-xi-upload="${esc(section)}"></label>
 <button type="button" data-xi-save="${esc(section)}">Guardar textos</button><button type="button" data-xi-cancel>Salir</button>`;
 root.appendChild(toolbar);
 void platformInlineDrawImages();
}
async function platformInlineSaveText(section){
 if(!platformShopOwner||platformInlineEditSection!==section)return;
 const values={};
 for(const key of Object.keys(PLATFORM_INLINE_SECTIONS[section].fields)){
  const node=platformInlineTextNode(section,key);if(node){
   const text=node.textContent.trim();if(text.length>160)return toast('Los textos pueden tener como máximo 160 caracteres.','error');
   values[key]=text;
  }
 }
 const {error}=await supabase.rpc('xifre_admin_ui_inline_save',{p_section:section,p_values:values});
 if(error)return toast(friendlyError(error),'error');
 platformInlineEndEdit();await platformInlineLoad();toast('Textos guardados para todos los usuarios.','success');
}
async function platformInlineUpload(section,file){
 if(!platformShopOwner||platformInlineEditSection!==section)return;
 if(platformInlineData.images.filter(i=>i.section_key===section).length>=14)return toast('Máximo 14 imágenes por apartado.','error');
 let fresh='';
 try{
  fresh=await platformUploadImage(file,'ui');
  const {data,error}=await supabase.rpc('xifre_admin_ui_image_save',{p_id:null,p_section:section,p_path:fresh,p_x:12,p_y:14,p_width:20});
  if(error)throw error;
  const response={id:data,section_key:section,image_path:fresh,x_pct:12,y_pct:14,width_pct:20};
  platformInlineData.images.push(response);await platformInlineDrawImages();toast('Imagen añadida. Puedes arrastrarla a otra posición.','success');
 }catch(error){if(fresh)await platformDeleteImage(fresh);toast(friendlyError(error),'error');}
}
async function platformInlineDeleteImage(id){
 if(!platformShopOwner)return;
 const record=platformInlineData.images.find(row=>String(row.id)===String(id));if(!record)return;
 const {error}=await supabase.rpc('xifre_admin_ui_image_delete',{p_id:id});
 if(error)return toast(friendlyError(error),'error');
 platformInlineData.images=platformInlineData.images.filter(row=>String(row.id)!==String(id));
 await platformInlineDrawImages();toast('Imagen eliminada de la interfaz.','success');
}
function platformInlineMoveStart(event){
 if(!platformInlineEditSection || event.button!==0)return;
 const image=event.target.closest('.xi-overlay-image');
 if(!image||event.target.closest('[data-xi-image-delete]'))return;
 const record=platformInlineData.images.find(row=>String(row.id)===String(image.dataset.xiImage));
 const root=platformInlineRoot(platformInlineEditSection);if(!record||!root||!root.contains(image))return;
 const rect=root.getBoundingClientRect();if(rect.width<40||rect.height<40)return;
 event.preventDefault();image.setPointerCapture(event.pointerId);
 platformInlineDragging={id:record.id,image,record,section:platformInlineEditSection,rect,startX:event.clientX,startY:event.clientY,x:Number(record.x_pct),y:Number(record.y_pct)};
 image.classList.add('xi-dragging');
}
function platformInlineMove(event){
 const d=platformInlineDragging;if(!d||!d.image.hasPointerCapture(event.pointerId))return;
 const x=Math.max(0,Math.min(95-Number(d.record.width_pct),d.x+(event.clientX-d.startX)/d.rect.width*100));
 const y=Math.max(0,Math.min(90,d.y+(event.clientY-d.startY)/d.rect.height*100));
 d.image.style.left=`${x}%`;d.image.style.top=`${y}%`;d.nextX=x;d.nextY=y;
}
async function platformInlineMoveEnd(event){
 const d=platformInlineDragging;if(!d)return;
 if(event.pointerId!=null && d.image.hasPointerCapture(event.pointerId))d.image.releasePointerCapture(event.pointerId);
 platformInlineDragging=null;d.image.classList.remove('xi-dragging');
 if(d.nextX==null)return;
 try{
  const {error}=await supabase.rpc('xifre_admin_ui_image_save',{
   p_id:d.id,p_section:d.section,p_path:d.record.image_path,p_x:Number(d.nextX.toFixed(2)),p_y:Number(d.nextY.toFixed(2)),p_width:Number(d.record.width_pct)});
  if(error)throw error;
  d.record.x_pct=d.nextX;d.record.y_pct=d.nextY;
 }catch(error){toast('No se pudo guardar la posición: '+friendlyError(error),'error');void platformInlineDrawImages();}
}
function platformInlineBind(){
 document.addEventListener('click',event=>{
  const pencil=event.target.closest('[data-xi-edit]');if(pencil){event.preventDefault();platformInlineStart(pencil.dataset.xiEdit);return;}
  const save=event.target.closest('[data-xi-save]');if(save){void platformInlineSaveText(save.dataset.xiSave);return;}
  if(event.target.closest('[data-xi-cancel]')){platformInlineEndEdit(true);return;}
  const remove=event.target.closest('[data-xi-image-delete]');if(remove){void platformInlineDeleteImage(remove.dataset.xiImageDelete);return;}
 },true);
 document.addEventListener('change',event=>{
  const input=event.target.closest('[data-xi-upload]');if(input?.files?.[0])void platformInlineUpload(input.dataset.xiUpload,input.files[0]);
 });
 // Prevent text editing from accidentally opening group/people buttons.
 document.addEventListener('click',event=>{
  if(platformInlineEditSection && event.target.closest('[contenteditable="plaintext-only"]')){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 document.addEventListener('pointerdown',platformInlineMoveStart,true);
 document.addEventListener('pointermove',platformInlineMove,true);
 document.addEventListener('pointerup',event=>{void platformInlineMoveEnd(event);},true);
 document.addEventListener('pointercancel',event=>{void platformInlineMoveEnd(event);},true);
}

function platformAlpha14Bind(){
  platformInlineBind();
  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-market-tab]');if(tab){platformSetMarketTab(tab.dataset.marketTab);return;}
    const pick=event.target.closest('[data-market-select]');if(pick){platformSelectMarketItem(pick.dataset.marketSelect);return;}
    const buy=event.target.closest('[data-market-buy]');if(buy){void platformMarketBuy(buy.dataset.marketBuy);return;}
    const cancel=event.target.closest('[data-market-cancel]');if(cancel){void platformMarketCancelListing(cancel.dataset.marketCancel);return;}
    const giftPick=event.target.closest('[data-gift-pick]');if(giftPick){void platformSendChatGift(giftPick.dataset.giftPick);return;}
    const giftClaim=event.target.closest('[data-gift-claim]');if(giftClaim){void platformActionChatGift(giftClaim.dataset.giftClaim,'claim');return;}
    const giftCancel=event.target.closest('[data-gift-cancel]');if(giftCancel){void platformActionChatGift(giftCancel.dataset.giftCancel,'cancel');return;}
    const sellDetail=event.target.closest('#item-instant-sell');if(sellDetail?.dataset.sellInstance){void platformMarketInstantSell(sellDetail.dataset.sellInstance);return;}
    const upgrade=event.target.closest('[data-upgrade-item]');if(upgrade){void platformUpgradeItem(upgrade.dataset.upgradeItem,Number(upgrade.dataset.upgradeTarget));return;}
    const edit=event.target.closest('[data-editor-open]');if(edit){platformUiOpenEditor(edit.dataset.editorOpen);return;}
    const remove=event.target.closest('[data-admin-remove-instance]');if(remove){void platformAdminRemoveInstance(remove.dataset.adminRemoveInstance);return;}
  });
  $('#composer-gift-button')?.addEventListener('click',platformOpenGiftPicker);
  $('#market-list-form')?.addEventListener('submit',event=>void platformMarketCreateListing(event));
  $('#market-instant-button')?.addEventListener('click',()=>void platformMarketInstantSell());
  $('#market-refresh')?.addEventListener('click',()=>{void platformLoadMarket(true);void platformLoadWallet(false);});
  $('#market-search')?.addEventListener('input',platformRenderMarket);
  $('#market-filter-rarity')?.addEventListener('change',platformRenderMarket);
  $('#admin-assets-money-form')?.addEventListener('submit',event=>void platformAdminAdjustMoney(event));
  $('#xifre-editor-key')?.addEventListener('change',platformUiFillEditor);
  $('#xifre-editor-form')?.addEventListener('submit',event=>void platformUiSave(event));
}

function platformBindEvents() {
  platformAlpha14Bind();
  document.addEventListener('click', event => {
    const appButton = event.target.closest('[data-platform-app]');
    if (appButton) {
      event.preventDefault();
      platformSetApp(appButton.dataset.platformApp);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'open-updates') {
      event.preventDefault();
      void platformOpenUpdates();
      return;
    }
    if (action?.dataset.action === 'open-inventory-admin') {
      event.preventDefault();
      if (!isXifreAdmin) return toast('No tienes permisos de administrador.', 'error');
      platformSetApp('inventory', true);
      return;
    }
    const inventoryTab = event.target.closest('[data-inventory-tab]');
    if (inventoryTab) {
      platformSetInventoryTab(inventoryTab.dataset.inventoryTab);
      return;
    }
    const itemDetails = event.target.closest('[data-open-item]');
    if (itemDetails) {
      event.preventDefault();
      platformOpenItemDetails(itemDetails.dataset.openItem, itemDetails.dataset.itemSource || 'collection');
      return;
    }
    const tradeRemove=event.target.closest('[data-trade-remove-group]');
    if(tradeRemove){event.preventDefault();platformToggleTradeItem(tradeRemove.dataset.tradeRemoveGroup,true);return;}
    const shopBuy=event.target.closest('[data-shop-buy]');
    if(shopBuy){event.preventDefault();void platformBuyShopItem(shopBuy.dataset.shopBuy);return;}
    const shopEdit=event.target.closest('[data-shop-edit]');
    if(shopEdit){event.preventDefault();platformEditShopListing(shopEdit.dataset.shopEdit);return;}
    const shopDisable=event.target.closest('[data-shop-disable]');
    if(shopDisable){event.preventDefault();void platformDisableShopListing(shopDisable.dataset.shopDisable);return;}
    const moneyUser=event.target.closest('[data-shop-user]');
    if(moneyUser){event.preventDefault();platformSelectShopMoneyUser(moneyUser.dataset.shopUser);return;}
    const boxRemove=event.target.closest('[data-box-drop-remove]');
    if(boxRemove){event.preventDefault();boxRemove.closest('.admin-box-drop-row')?.remove();platformUpdateBoxPercent();return;}
    const tradeToggle = event.target.closest('[data-trade-toggle]');
    if (tradeToggle) {
      event.preventDefault();
      platformToggleTradeItem(tradeToggle.dataset.tradeToggle);
      return;
    }
    const editItem = event.target.closest('[data-admin-edit-item]');
    if (editItem) { platformEditItem(editItem.dataset.adminEditItem); return; }
    const toggleItem = event.target.closest('[data-admin-toggle-item]');
    if (toggleItem) { void platformToggleItem(toggleItem.dataset.adminToggleItem, toggleItem.dataset.enabled === 'true'); return; }
    const toggleApp = event.target.closest('[data-admin-app-toggle]');
    if (toggleApp) { void platformToggleSystemApp(toggleApp.dataset.adminAppToggle, toggleApp.dataset.enabled === 'true'); return; }
    const targetUser = event.target.closest('[data-admin-user-id]');
    if (targetUser) { platformSelectAdminUser(targetUser.dataset.adminUserId); return; }
    const response = event.target.closest('[data-trade-response]');
    if (response) { void platformRespondTrade(response.dataset.tradeId, response.dataset.tradeResponse === 'accept'); return; }
    const openTrade = event.target.closest('[data-open-trade]');
    if (openTrade) { void platformOpenTradeWorkspace(openTrade.dataset.openTrade); return; }
    const cancelTrade = event.target.closest('[data-cancel-trade]');
    if (cancelTrade) { void platformCancelTrade(cancelTrade.dataset.cancelTrade); return; }
    const editRelease = event.target.closest('[data-edit-release]');
    if (editRelease) { platformEditRelease(editRelease.dataset.editRelease); return; }
  });

  $('#inventory-refresh-button')?.addEventListener('click', () => {
    void platformRefreshInventory();
    void platformLoadTrades(false);
  });
  $('#trade-request-form')?.addEventListener('submit', event => void platformCreateTradeRequest(event));
  $('#trade-back-button')?.addEventListener('click', platformBackToTradeList);
  $('#trade-cancel-button')?.addEventListener('click', () => { if (platformActiveTradeId) void platformCancelTrade(platformActiveTradeId); });
  $('#trade-save-offer-button')?.addEventListener('click', () => void platformSaveTradeOffer());
  $('#trade-confirm-button')?.addEventListener('click', () => void platformConfirmTrade());
  $('#admin-item-form')?.addEventListener('submit', event => void platformSaveItem(event));
  $('#admin-item-reset')?.addEventListener('click', platformResetItemForm);
  $('#admin-item-image')?.addEventListener('change', event => platformSetPreview('admin-item-image-preview', event.target.files?.[0] || null, platformAdminEditingItemImagePath || ''));
  $('#admin-user-search')?.addEventListener('input', event => void platformSearchAdminUsers(event.target.value));
  $('#admin-grant-form')?.addEventListener('submit', event => void platformGrantItem(event));
  $('#shop-refresh')?.addEventListener('click',()=>{void platformLoadShop();void platformLoadWallet(false);});
  $('#shop-admin-form')?.addEventListener('submit',event=>void platformSaveShopListing(event));
  $('#shop-admin-reset')?.addEventListener('click',platformResetShopForm);
  $('#shop-money-search')?.addEventListener('input',event=>platformSearchShopMoneyUsers(event.target.value));
  $('#shop-money-form')?.addEventListener('submit',event=>void platformGiveShopMoney(event));
  $('#admin-item-is-box')?.addEventListener('change',platformToggleBoxFields);
  $('#admin-box-add-drop')?.addEventListener('click',()=>platformAddBoxDropRow());
  $('#admin-box-drops')?.addEventListener('input',platformUpdateBoxPercent);
  $('#admin-box-drops')?.addEventListener('change',platformUpdateBoxPercent);
  $('#item-open-box-button')?.addEventListener('click',()=>{const id=$('#item-open-box-button')?.dataset.boxInstance;if(id)void platformOpenBox(id);});
  $('#box-opening-done')?.addEventListener('click',platformFinishBoxOpening);
  $('#box-opening-close')?.addEventListener('click',()=>{if(!platformBoxOpeningBusy)platformFinishBoxOpening();});
  $('#platform-version-form')?.addEventListener('submit' , event => void platformSaveDisplayVersion(event));
  $('#release-admin-form')?.addEventListener('submit', event => void platformSaveRelease(event));
  $('#release-editor-reset')?.addEventListener('click', platformResetReleaseEditor);
  $('#release-image')?.addEventListener('change', event => platformSetPreview('release-image-preview', event.target.files?.[0] || null, platformReleaseImagePath || ''));
}



async function init() {
bind();
applyTheme(currentTheme());

if (!window.supabase?.createClient) {
showScreen('landing');
return;
}

try {
supabase = window.supabase.createClient(CONFIG.url, CONFIG.key, {
auth: {
persistSession: true,
autoRefreshToken: true,
detectSessionInUrl: true,
storageKey: 'xifre-auth-v9'
}
});

supabase.auth.onAuthStateChange((event, session) => {
setTimeout(() => {
if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session) {
if (session.access_token) void supabase.realtime.setAuth(session.access_token).catch(error => console.warn('REALTIME AUTH REFRESH', error));
void startApplication(session);
return;
}
if (event === 'SIGNED_OUT') {
stopPresenceTracking();
platformStop();
xifreSendTimes.length=0;xifreRecentlySent.clear();xifreMessageLoads.clear();xifreChatOpenRetries.clear();
currentUser = null;
currentProfile = null;
appStarted = false;
resetChatView();
closeAllModals();
if (domainSessionSignOut) {
  domainSessionSignOut = false;
  showScreen('login');
  setMessage('login-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
  return;
}
showScreen('landing');
}
}, 0);
});

const { data, error } = await supabase.auth.getSession();
if (error) throw error;

if (data?.session?.user) {
await startApplication(data.session);
} else if (!appStarted) {
showScreen('landing');
}
} catch (error) {
console.error('INIT', error);
// Nunca navegamos a landing por un error secundario de la app.
// Si la librería/cliente falla de verdad, mostramos login con el error.
showScreen('login');
setMessage('login-message', `No se pudo conectar con XIFRE: ${friendlyError(error)}`, 'error');
}
}

window.XIFRE = { showScreen, login, register, logout };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
})();
