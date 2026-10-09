(() => {
'use strict';

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

const screens = ['landing', 'login', 'register', 'email'];

function normalizeUsername(value) {
return String(value || '').trim().toLowerCase();
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
if (lower.includes('rate limit') || lower.includes('too many requests') || Number(error?.status) === 429) return 'Se ha alcanzado temporalmente el límite de peticiones de Supabase. Espera un poco antes de volver a intentarlo.';
return message || 'No se pudo completar la operación.';
}

function formatTime(timestamp) {
if (!timestamp) return '';
return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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
const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color').eq('id', currentUser.id).maybeSingle();
if (error) console.warn('PROFILE LOAD', error);
currentProfile = data || {
id: currentUser.id,
username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
display_name: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
avatar_url: null,
avatar_color: 'avatar-blue'
};
currentProfile.display_name = currentProfile.username;
syncProfileUI();
}

function syncProfileUI() {
const username = currentProfile?.username || 'usuario';
setText('profile-name', username);
setText('profile-username', `@${username}`);
setText('bottom-profile-name', username);
setText('bottom-profile-username', `@${username}`);
setText('settings-nav-name', username);
setText('settings-nav-username', `@${username}`);
setText('settings-preview-username', `@${username}`);
avatarInto($('#profile-avatar'), username, currentProfile?.avatar_url);
avatarInto($('#bottom-profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
avatarInto($('#settings-nav-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
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

currentUser = sessionUser;
appStarted = true;
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

if (conversationListPoll) clearInterval(conversationListPoll);
conversationListPoll = setInterval(() => { if (document.visibilityState === 'visible' && currentUser) loadConversations().catch(() => {}); }, 4000);

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
try {
await supabase.auth.signOut();
} catch (error) {
console.error('LOGOUT', error);
} finally {
stopChatRealtime();
if (conversationListPoll) clearInterval(conversationListPoll);
conversationListPoll = null;
currentUser = null;
currentProfile = null;
currentConversation = null;
currentConversationData = null;
currentMembers = [];
appStarted = false;
sessionStorage.removeItem('xifre_current_conversation');
closeAllModals();
$('#settings-modal')?.classList.add('hidden');
showScreen('landing');
}
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
const { data, error } = await supabase.from('friendships').select('user1_id,user2_id').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
if (error) { console.warn('FRIENDS', error); friendCache = []; return; }
const ids = [...new Set((data || []).map(row => String(row.user1_id) === String(currentUser.id) ? row.user2_id : row.user1_id).filter(Boolean))];
if (!ids.length) { friendCache = []; return; }
const result = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color').in('id', ids);
if (!result.error) friendCache = result.data || [];
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
if (clean.length < 2) {
list.innerHTML = '<div class="empty-sidebar">Escribe al menos 2 caracteres.</div>';
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
const relationship = person.relationship || 'none';
const row = document.createElement('div');
row.className = 'search-result';
row.innerHTML = `
<span class="search-avatar">${avatarHTML(person.username, person.avatar_url, 'private', '', person.avatar_color)}</span>
<div class="result-copy"><strong>${esc(person.username)}</strong><small>${relationship === 'friend' ? 'Amigo' : relationship === 'outgoing_pending' ? 'Solicitud enviada' : relationship === 'incoming_pending' ? 'Solicitud recibida' : 'No conectado'}</small></div>`;
const action = document.createElement('button');
action.type = 'button';
action.className = `result-action ${relationship === 'friend' ? '' : 'secondary'}`;
if (relationship === 'friend') {
action.textContent = 'Abrir';
action.addEventListener('click', async () => { closeModal('friend-modal'); await openPrivateChat(person.id); });
} else if (relationship === 'outgoing_pending' || relationship === 'incoming_pending') {
action.textContent = 'Pendiente';
action.disabled = true;
} else {
action.textContent = 'Añadir';
action.addEventListener('click', async () => {
action.disabled = true;
try {
const { error } = await supabase.rpc('xifre_send_friend_request', { p_target_user: person.id });
if (error) throw error;
action.textContent = 'Pendiente';
toast('Solicitud enviada.', 'success');
} catch (error) {
action.disabled = false;
action.textContent = 'Añadir';
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
row.innerHTML = `${avatarHTML(friend.username, friend.avatar_url, 'private', 'friend-avatar', friend.avatar_color)}<div class="friend-copy"><strong>${esc(friend.username)}</strong><small>@${esc(friend.username)}</small></div><button class="open-chat" type="button">Abrir</button>`;
row.querySelector('button').addEventListener('click', async () => { closeModal('friends-modal'); await openPrivateChat(friend.id); });
list.appendChild(row);
});
}

async function loadFriendRequests() {
if (!currentUser) return;
const base = await supabase.from('friend_requests').select('id,sender_id,receiver_id,created_at').eq('receiver_id', currentUser.id).order('created_at', { ascending: false });
if (base.error) return renderRequests([]);
const ids = [...new Set((base.data || []).map(x => x.sender_id))];
let profiles = [];
if (ids.length) {
const result = await supabase.from('profiles').select('id,username,avatar_url,avatar_color').in('id', ids);
if (!result.error) profiles = result.data || [];
}
const map = new Map(profiles.map(p => [p.id, p]));
renderRequests((base.data || []).map(req => ({ ...req, sender: map.get(req.sender_id) || {} })));
}

function renderRequests(requests) {
const list = $('#friend-requests-list');
if (!list) return;
list.innerHTML = '';
if (!requests.length) { list.innerHTML = '<div class="empty-sidebar">No tienes solicitudes pendientes.</div>'; return; }
requests.forEach(req => {
const row = document.createElement('div');
row.className = 'request-item';
row.innerHTML = `${avatarHTML(req.sender.username || 'Usuario', req.sender.avatar_url, 'private', 'request-avatar')}<div class="request-copy"><strong>${esc(req.sender.username || 'Usuario')}</strong><small>Quiere añadirte como amigo</small></div><div class="request-actions"><button class="request-accept" type="button">Aceptar</button><button class="request-reject" type="button">Rechazar</button></div>`;
const [accept, reject] = $$('.request-actions button', row);
accept.addEventListener('click', () => acceptRequest(req, row));
reject.addEventListener('click', () => rejectRequest(req, row));
list.appendChild(row);
});
}

async function acceptRequest(req, row) {
$$('.request-actions button', row).forEach(b => b.disabled = true);
try {
const first = String(currentUser.id) < String(req.sender_id) ? currentUser.id : req.sender_id;
const second = String(currentUser.id) < String(req.sender_id) ? req.sender_id : currentUser.id;
const exists = await supabase.from('friendships').select('user1_id,user2_id').eq('user1_id', first).eq('user2_id', second).maybeSingle();
if (exists.error) throw exists.error;
if (!exists.data) {
const insert = await supabase.from('friendships').insert({ user1_id: first, user2_id: second });
if (insert.error) throw insert.error;
}
const remove = await supabase.from('friend_requests').delete().eq('id', req.id).eq('receiver_id', currentUser.id);
if (remove.error) throw remove.error;
row.remove();
await loadFriends();
toast('Ahora sois amigos.', 'success');
} catch (error) {
$$('.request-actions button', row).forEach(b => b.disabled = false);
toast(friendlyError(error), 'error');
}
}

async function rejectRequest(req, row) {
const button = $('.request-reject', row);
button.disabled = true;
try {
const { error } = await supabase.from('friend_requests').delete().eq('id', req.id).eq('receiver_id', currentUser.id);
if (error) throw error;
row.remove();
} catch (error) {
button.disabled = false;
toast(friendlyError(error), 'error');
}
}

/* ------------------------------------------------------------------------ */
/* Conversations */
/* ------------------------------------------------------------------------ */
async function loadConversations() {
if (!currentUser) return [];
const { data, error } = await supabase.rpc('xifre_get_my_conversations');
if (error) { console.warn('CONVERSATIONS', error); return conversationCache; }
conversationCache = (data || []).map(row => ({ ...row, displayName: row.display_name || row.name || (row.type === 'group' ? 'Grupo' : 'Chat privado') }));
conversationCache.sort((a,b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
renderConversations();
return conversationCache;
}

function renderConversations(filter = '') {
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
row.className = `conversation${String(currentConversation)===String(conversation.id)?' active':''}${unread?' unread':''}`;
row.innerHTML = `${avatarHTML(label, conversation.avatar_url, isGroup?'group':'private','conversation-avatar-image',conversation.avatar_color)}<span class="conversation-copy"><span class="conversation-name">${esc(label)}</span><span class="conversation-preview ${conversation.message_type==='system'?'conversation-system':''}">${esc(conversation.last_message || (isGroup ? `${conversation.member_count||0} miembros` : 'Conversación'))}</span></span><span class="conversation-tail">${mentioned?'<span class="conversation-mention-badge">@</span>':''}${unread?`<span class="conversation-unread-badge">${unread>99?'99+':unread}</span>`:''}<span class="conversation-meta">${esc(formatListTime(conversation.last_message_at))}</span></span>`;
row.addEventListener('click',()=>openConversation(conversation.id,conversation));
row.addEventListener('contextmenu',e=>{e.preventDefault(); openConversationMenu(conversation,e.clientX,e.clientY);});
list.appendChild(row);
});
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
matches.forEach(c=>{const row=document.createElement('button');row.type='button';row.className='friend-item';const group=c.type==='group';row.innerHTML=`${avatarHTML(c.displayName,c.avatar_url,group?'group':'private','friend-avatar')}<div class="friend-copy"><strong>${esc(c.displayName)}</strong><small>${group?'Grupo':'@'+esc(c.username||'')}</small></div><span class="open-chat">Abrir</span>`;row.addEventListener('click',()=>{closeModal('conversation-search-modal');openConversation(c.id,c);});list.appendChild(row);});
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

async function openConversation(id, cached = null) {
if (!id || !currentUser) return false;
const conversationId = String(id);
const isAlreadyOpen = String(currentConversation || '') === conversationId;
let conversation = cached || conversationCache.find(c => String(c.id) === conversationId);
if (!conversation) {
await loadConversations();
conversation = conversationCache.find(c => String(c.id) === conversationId);
}
if (!conversation) return false;

try {
currentConversation = conversationId;
currentConversationData = conversation;
sessionStorage.setItem('xifre_current_conversation', conversationId);
const { data: members, error } = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: conversationId });
if (error) throw error;
currentMembers = members || [];
memberCache.set(conversationId, currentMembers);

updateChatHeader();
renderRightPane();
renderConversations();
await loadMessages(conversationId, !isAlreadyOpen);
await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId });
const readRow = conversationCache.find(c => String(c.id) === conversationId); if (readRow) { readRow.unread_count = 0; readRow.has_mention = false; }
renderConversations();
setupTypingChannel(conversationId);
setupMessageChannel(conversationId);
$('#message-input').disabled = false;
$('#send-button').disabled = true;
$('#message-input').focus();
return true;
} catch (error) {
console.error('OPEN CONVERSATION', error);
currentConversation = conversationId;
currentConversationData = conversation;
showChatError(error?.message || 'No se pudo abrir esta conversación.');
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

async function loadMessages(conversationId, scrollToBottom = false) {
  const requestedId = String(conversationId || '');
  if (!requestedId) return;
  const { data, error } = await supabase.rpc('xifre_get_messages', {
    p_conversation_id: requestedId,
    p_limit: 500
  });
  if (error) throw error;
  // An earlier request may finish after the user has switched to another chat.
  if (String(currentConversation || '') !== requestedId) return;
  renderMessages((data || []).map(messageObject), scrollToBottom);
}

function renderMessageContent(content, message) {
  const source = String(content || '');
  const mentionedIds = new Set((message?.mentions || []).map(id => String(id)));
  const hasMentionData = Array.isArray(message?.mentions);
  const membersByName = new Map();
  for (const member of [...(currentMembers || [])].sort((a, b) => String(b.username || '').length - String(a.username || '').length)) {
    const username = String(member.username || '').trim();
    if (username) membersByName.set(username.toLowerCase(), member);
  }

  // Parse tokens from the original plain text, then escape every untouched part.
  // This prevents nested HTML when one username happens to be another username's prefix.
  const tokenRegex = /(^|[^a-z0-9_])@([a-z0-9_]+)/gi;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(source)) !== null) {
    const prefix = match[1] || '';
    const name = match[2] || '';
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
  return html;
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
    const timeDiff = new Date(a.created_at || 0) - new Date(b.created_at || 0);
    return timeDiff || String(a.id || '').localeCompare(String(b.id || ''));
  });
  const incomingIds = new Set(ordered.map(message => String(message.id || '')).filter(Boolean));
  const existingNodes = new Map(
    [...box.querySelectorAll('[data-message-id]')].map(node => [String(node.dataset.messageId), node])
  );
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const originalScrollTop = box.scrollTop;
  const boxTop = box.getBoundingClientRect().top;
  const anchor = [...existingNodes.values()].find(node => node.getBoundingClientRect().bottom > boxTop + 1);
  const anchorId = anchor?.dataset.messageId || '';
  const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
  let changed = false;

  if (!ordered.length) {
    if (existingNodes.size || !box.querySelector('.chat-welcome')) {
      box.innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
      if (forceBottom) box.scrollTop = box.scrollHeight;
    }
    return;
  }

  // Prune only messages that really disappeared; keep existing DOM nodes alive
  // so text selection, focus, hover menus and scroll position do not flicker.
  for (const [id, node] of existingNodes) {
    if (!incomingIds.has(id)) {
      node.remove();
      existingNodes.delete(id);
      changed = true;
    }
  }
  const welcome = box.querySelector('.chat-welcome');
  if (welcome) { welcome.remove(); changed = true; }

  const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
  let addedAny = false;
  for (const message of ordered) {
    const id = String(message.id || '');
    if (!id || existingNodes.has(id)) continue;
    const node = renderOneMessage(message, profiles);
    if (node) {
      existingNodes.set(id, node);
      const messageIndex = ordered.findIndex(item => String(item.id || '') === id);
      const nextExisting = ordered.slice(messageIndex + 1)
        .map(item => existingNodes.get(String(item.id || '')))
        .find(Boolean);
      if (nextExisting && nextExisting !== node) box.insertBefore(node, nextExisting);
    }
    changed = true;
    addedAny = true;
  }

  // Opening a conversation intentionally starts at its latest message. Polling
  // does not: it only follows new messages if the viewer was already at bottom.
  if (forceBottom || (wasNearBottom && addedAny)) {
    box.scrollTop = box.scrollHeight;
  } else if (changed && anchorId) {
    const anchorAfter = box.querySelector(`[data-message-id="${CSS.escape(anchorId)}"]`);
    if (anchorAfter) {
      const delta = anchorAfter.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > 0.5) box.scrollTop = Math.max(0, originalScrollTop + delta);
    } else {
      box.scrollTop = originalScrollTop;
    }
  } else if (!changed) {
    // Crucial: do not touch scrollTop on a no-op 2.5-second refresh.
    return;
  }
}

function renderOneMessage(message, profiles=new Map()) {
const box=$('#messages'); if(!box||!message?.id)return;
const existing = box.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`); if (existing) return existing;
$('.chat-welcome',box)?.remove();
if(message.message_type==='system'){
const row=document.createElement('div');row.className='system-message-row';row.dataset.messageId=String(message.id);row.innerHTML=`<span>${esc(message.content||'')}</span>`;box.appendChild(row);return row;
}
const mine=String(message.sender_id)===String(currentUser.id); const cached=profiles.get(String(message.sender_id))||currentMembers.find(m => getMemberId(m) === String(message.sender_id))||{};
const sender={username:message.sender_username||cached.username||'Usuario',avatar_url:message.sender_avatar_url||cached.avatar_url||null};
const mentioned = !mine && messageMentionsMe(message);
const row=document.createElement('article');row.className=`message-row${mine?' mine':''}${mentioned?' mentioned':''}`;row.dataset.messageId=String(message.id);
row.innerHTML=`<span class="message-avatar">${avatarHTML(sender.username,sender.avatar_url,'private','',cached.avatar_color || message.sender_avatar_color || '')}</span><div class="message-body">${message.reply_to?`<div class="message-reply-preview" data-reply-target="${esc(message.reply_to)}"><span class="reply-line"></span><span class="reply-avatar">${avatarHTML(message.reply_sender_username||'Usuario',message.reply_sender_avatar_url,'private','',message.reply_sender_avatar_color||'')}</span><div class="message-reply-copy"><strong>${esc(message.reply_sender_username||'Usuario')}</strong><span>${esc(message.reply_content||'')}</span></div></div>`:''}<div class="message-meta"><span class="message-author">${esc(sender.username)}</span><span class="message-username">@${esc(sender.username)}</span><span class="message-time">${esc(formatTime(message.created_at))}</span></div><div class="message-content">${renderMessageContent(message.content,message)}</div></div><div class="message-actions"><button class="message-action" type="button" data-message-action="reply" title="Responder">↩</button><button class="message-action more" type="button" data-message-action="more" title="Más">•••</button></div>`;
row.querySelector('[data-message-action="reply"]').addEventListener('click',e=>{e.stopPropagation();setReplyTo(message);highlightMessage(message.id);});
row.querySelector('[data-message-action="more"]').addEventListener('click',e=>{e.stopPropagation();openMessageMenu(message,e.currentTarget);});
row.querySelector('.message-reply-preview')?.addEventListener('click',()=>highlightMessage(message.reply_to));
row.addEventListener('contextmenu',e=>{e.preventDefault();openMessageMenu(message,row);});
box.appendChild(row);
return row;
}

function highlightMessage(id){
$$('.message-row', $('#messages')).forEach(r=>r.classList.remove('reply-target'));
const row=$(`[data-message-id="${CSS.escape(String(id))}"]`,$('#messages')); if(!row)return; row.classList.add('reply-target'); row.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>row.classList.remove('reply-target'),1600);
}

function setReplyTo(message) {
replyTarget = message;
setText('replying-name', `@${message.sender_username || 'usuario'}`);
setText('replying-content', message.content || '');
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
  const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
  if (!currentConversation || !match) {
    picker.classList.add('hidden');
    return;
  }

  const query = match[2].toLowerCase();
  const people = (currentMembers || []).filter(member => {
    const id = getMemberId(member);
    return id && id !== String(currentUser?.id) && isValidUuid(id) &&
      String(member.username || '').toLowerCase().startsWith(query);
  }).slice(0, 8);

  // @everyone stays a manually typed mention; it is not a picker suggestion.
  picker.innerHTML = '';
  mentionPickerIndex = 0;
  if (!people.length) {
    picker.classList.add('hidden');
    return;
  }

  people.forEach((person, index) => {
    const row = document.createElement('div');
    row.className = `mention-item${index === 0 ? ' active' : ''}`;
    row.innerHTML = `${avatarHTML(person.username, person.avatar_url, 'private', 'mention-avatar', person.avatar_color)}<span class="mention-item-copy"><strong>${esc(person.username)}</strong><small>@${esc(person.username)}</small></span>`;
    row.addEventListener('mousedown', event => {
      event.preventDefault();
      selectMention(person);
    });
    picker.appendChild(row);
  });
  picker.classList.remove('hidden');
}

function selectMention(person) {
  const input = $('#message-input');
  const value = input?.value || '';
  if (!input || !person) return;
  const id = getMemberId(person);
  const username = String(person.username || '').trim();
  if (!username || !isValidUuid(id)) {
    $('#mention-picker')?.classList.add('hidden');
    toast('No se pudo identificar correctamente a ese miembro. Actualiza el chat e inténtalo otra vez.', 'error');
    return;
  }

  const position = input.selectionStart ?? value.length;
  const before = value.slice(0, position);
  const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
  if (!match) return;
  const start = position - match[2].length - 1;
  const token = `@${username} `;
  input.value = value.slice(0, start) + token + value.slice(position);
  const cursor = start + token.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  currentMentionIds.add(id); // Optional hint; sendMessage validates against text before sending.
  mentionEverywhere = false;
  $('#mention-picker')?.classList.add('hidden');
  updateSendState();
  scheduleTyping();
}

function updateSendState() {
  const input = $('#message-input');
  const button = $('#send-button');
  if (!button) return;
  button.disabled = !currentConversation || !String(input?.value || '').trim();
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
  const everyone = currentConversationData?.type === 'group' && /(^|\s)@everyone(?![a-z0-9_])/i.test(text);
  return { ids: [...ids], everyone };
}

async function sendMessage() {
  if (!currentUser || !currentConversation) return;
  const input = $('#message-input');
  const content = String(input?.value || '').trim();
  if (!content) return;

  const button = $('#send-button');
  if (button) button.disabled = true;
  const conversationId = String(currentConversation);
  try {
    const derived = deriveMentions(content);
    const safeMentions = derived.ids.filter(isValidUuid);
    const { data, error } = await supabase.rpc('xifre_send_message', {
      p_conversation_id: conversationId,
      p_content: content,
      p_reply_to: replyTarget?.id || null,
      p_mentions: safeMentions,
      p_mention_everyone: !!derived.everyone
    });
    if (error) throw error;
    if (String(currentConversation) !== conversationId) return;
    const sent = Array.isArray(data) ? data[0] : data;
    if (sent?.id) {
      const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
      renderOneMessage(sent, profiles);
    }
    input.value = '';
    clearReply();
    currentMentionIds.clear();
    mentionEverywhere = false;
    $('#mention-picker')?.classList.add('hidden');
    stopTypingBroadcast();
    const box = $('#messages');
    if (box) box.scrollTop = box.scrollHeight;
    await loadConversations();
    await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId });
  } catch (error) {
    toast(friendlyError(error), 'error');
  } finally {
    updateSendState();
    input?.focus();
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
setTypingVisible(false);
}

function setupMessageChannel(conversationId) {
if (messageChannel) supabase.removeChannel(messageChannel);
messageChannel = supabase.channel(`xifre:messages:${conversationId}:${Date.now()}`)
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
if (String(payload.new?.sender_id) === String(currentUser.id)) return;
if (String(currentConversation) !== String(conversationId)) return;
await loadMessages(conversationId).catch(() => {});
await loadConversations().catch(() => {});
const box=$('#messages'); if(box && box.scrollHeight-box.scrollTop-box.clientHeight<80) { await supabase.rpc('xifre_mark_read',{p_conversation_id:conversationId}).catch(()=>{}); const c=conversationCache.find(x=>String(x.id)===String(conversationId)); if(c){c.unread_count=0;c.has_mention=false;} renderConversations(); }
})
.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async () => {
if (String(currentConversation) !== String(conversationId)) return;
await loadMessages(conversationId).catch(() => {});
await loadConversations().catch(() => {});
})
.subscribe();
if (messagePoll) clearInterval(messagePoll);
messagePoll = setInterval(() => {
if (document.visibilityState === 'visible' && String(currentConversation) === String(conversationId)) {
loadMessages(conversationId).catch(() => {});
}
}, 2500);
}

function setupTypingChannel(conversationId) {
if (typingChannel) supabase.removeChannel(typingChannel);
setTypingVisible(false);
typingChannel = supabase.channel(`xifre:typing:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
.on('broadcast', { event: 'typing' }, payload => {
const senderId = String(payload.payload?.user_id || '');
if (!senderId || senderId === String(currentUser.id)) return;
if (payload.payload?.typing) {
const sender = currentMembers.find(m => String(m.user_id) === senderId);
setTypingVisible(true, sender?.username || payload.payload?.username || 'Alguien');
setTimeout(() => setTypingVisible(false, sender?.username || ''), 3500);
} else {
setTypingVisible(false);
}
})
.subscribe(status => {
if (status === 'SUBSCRIBED') stopTypingBroadcast();
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

function scheduleTyping() {
if (!currentConversation) return;
void broadcastTyping(true);
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
if (visible) setText('typing-text', `${username} está escribiendo...`);
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
setText('right-profile-name', name);
} else {
const name = currentConversationData?.name || 'Grupo';
avatarInto($('#right-group-avatar'), name, currentConversationData?.avatar_url, 'group');
setText('right-group-name', name);
setText('right-group-count', `${currentMembers.length} miembro${currentMembers.length === 1 ? '' : 's'}`);
const list = $('#right-group-members');
list.innerHTML = '';
currentMembers.forEach(member => {
const row = document.createElement('div');
row.className = 'right-member';
row.innerHTML = `${avatarHTML(member.username, member.avatar_url, 'private', 'member-avatar', member.avatar_color)}<span class="right-member-name">${esc(member.username || 'Usuario')}</span>${member.is_owner?'<span class="member-role-crown crown-owner" title="Creador">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin" title="Administrador">♛</span>':''}`;
row.addEventListener('click',e=>{if(e.defaultPrevented)return;showMemberProfile(member,row);});
row.addEventListener('contextmenu',e=>{e.preventDefault();openMemberMenu(member,e.clientX,e.clientY);});
list.appendChild(row);
});
}
}

function showMemberProfile(member, anchor) {
  const popover = $('#member-profile-popover');
  if (!popover || !member) return;
  selectedMember = member;
  avatarInto($('#member-profile-avatar'), member.username, member.avatar_url, 'private', member.avatar_color || '');
  setText('member-profile-name', member.username || 'Usuario');
  setText('member-profile-username', `@${member.username || 'usuario'}`);
  setText('member-profile-role', member.is_owner ? 'Creador del grupo' : member.is_admin ? 'Administrador' : 'Miembro del grupo');

  popover.classList.remove('hidden');
  const anchorRect = anchor?.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 12;
  let left = anchorRect ? anchorRect.left : (window.innerWidth - popRect.width) / 2;
  let top = anchorRect ? anchorRect.bottom + 8 : margin;
  if (left + popRect.width > window.innerWidth - margin) left = window.innerWidth - popRect.width - margin;
  if (left < margin) left = margin;
  if (top + popRect.height > window.innerHeight - margin) {
    top = anchorRect ? anchorRect.top - popRect.height - 8 : window.innerHeight - popRect.height - margin;
  }
  if (top < margin) top = margin;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function closeMemberProfile(){ $('#member-profile-popover')?.classList.add('hidden'); selectedMember=null; }
function openMemberMenu(member,x,y){
selectedMember=member; const menu=$('#member-menu'); if(!menu)return; const me=currentMembers.find(m=>String(m.user_id)===String(currentUser.id)); const creator=!!me?.is_owner, admin=!!me?.is_admin;
const canManage=creator||admin; const targetIsAdmin=!!member.is_admin||!!member.is_owner; $('#member-menu [data-member-menu="kick"]')?.classList.toggle('hidden',!canManage||member.is_owner||(!creator&&targetIsAdmin)); $('#member-menu [data-member-menu="grant"]')?.classList.toggle('hidden',!creator||member.is_owner||member.is_admin); $('#member-menu [data-member-menu="revoke"]')?.classList.toggle('hidden',!creator||!member.is_admin); menu.classList.remove('hidden'); menu.style.left=`${Math.min(x,window.innerWidth-205)}px`; menu.style.top=`${Math.min(y,window.innerHeight-150)}px`;
}
function closeMemberMenu(){ $('#member-menu')?.classList.add('hidden'); selectedMember=null; }
async function memberAction(action){
const member=selectedMember; closeMemberMenu(); if(!member||!currentConversation)return;
let fn='',args={p_conversation_id:currentConversation,p_user_id:member.user_id}; if(action==='kick')fn='xifre_remove_group_member'; if(action==='grant')fn='xifre_grant_group_admin'; if(action==='revoke')fn='xifre_revoke_group_admin'; if(!fn)return;
const {error}=await supabase.rpc(fn,args); if(error)return toast(friendlyError(error),'error'); memberCache.delete(currentConversation); const r=await supabase.rpc('xifre_get_conversation_members',{p_conversation_id:currentConversation}); if(r.error)return toast(friendlyError(r.error),'error'); currentMembers=r.data||[]; memberCache.set(currentConversation,currentMembers); renderRightPane(); await openChatInfo(); await loadMessages(currentConversation); await loadConversations(); toast(action==='kick'?'Persona expulsada.':action==='grant'?'Administrador añadido.':'Administrador retirado.','success');
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
row.innerHTML = `<input type="checkbox" class="group-friend-check" value="${esc(friend.id)}"><span>${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.username)}</small></span>`;
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
row.innerHTML = `${avatarHTML(member.username, member.avatar_url, 'private', 'friend-avatar', member.avatar_color)}<div class="friend-copy"><strong>${esc(member.username || 'Usuario')}</strong><small>${member.is_owner ? 'Creador' : member.is_admin ? 'Administrador' : '@'+esc(member.username||'usuario')}</small></div><span>${member.is_owner?'<span class="member-role-crown crown-owner">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin">♛</span>':''}</span>`;
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
row.innerHTML = `<input type="checkbox" class="group-add-check" value="${esc(friend.id)}"><span>${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.username)}</small></span>`;
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
currentMembers = result.data || [];
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
const button = $('#save-group-settings');
const name = String($('#group-edit-name').value || '').trim();
if (!name) return setModalMessage('group-settings-message', 'El nombre es obligatorio.', 'error');
setLoading(button, true);
try {
let avatarUrl = null;
if (pendingGroupAvatarFile) {
const path = `${currentUser.id}/groups/${currentConversation}/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingGroupAvatarFile)}`;
avatarUrl = await uploadAvatar(pendingGroupAvatarFile, path);
}
const { data, error } = await supabase.rpc('xifre_update_group', { p_conversation_id: currentConversation, p_name: name, p_avatar_url: avatarUrl });
if (error) throw error;
const updated = Array.isArray(data) ? data[0] : data;
currentConversationData.name = updated?.name || name;
currentConversationData.displayName = currentConversationData.name;
if (updated?.avatar_url) currentConversationData.avatar_url = updated.avatar_url;
const local = conversationCache.find(c => String(c.id) === String(currentConversation));
if (local) { local.name = currentConversationData.name; local.displayName = currentConversationData.name; local.avatar_url = currentConversationData.avatar_url || null; }
pendingGroupAvatarFile = null;
pendingGroupAvatarURL = null;
updateChatHeader();
renderRightPane();
renderConversations();
avatarInto($('#group-edit-avatar-preview'), currentConversationData.name, currentConversationData.avatar_url, 'group');
setModalMessage('group-settings-message', 'Cambios guardados.', 'success');
} catch (error) {
setModalMessage('group-settings-message', friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
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
const username = normalizeUsername($('#settings-username').value);
if (!/^[a-z0-9_]{3,20}$/.test(username)) return setModalMessage('profile-settings-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
setLoading(button, true);
try {
let avatarUrl = null;
if (pendingProfileAvatarFile) {
const path = `${currentUser.id}/profile/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingProfileAvatarFile)}`;
avatarUrl = await uploadAvatar(pendingProfileAvatarFile, path);
}
const { data, error } = await supabase.rpc('xifre_update_profile', { p_username: username, p_display_name: username, p_avatar_url: avatarUrl });
if (error) throw error;
currentProfile = Array.isArray(data) ? data[0] : data;
pendingProfileAvatarFile = null;
pendingProfileAvatarURL = null;
syncProfileUI();
memberCache.clear();
await loadFriends();
await loadConversations();
if (currentConversation) await openConversation(currentConversation);
setModalMessage('profile-settings-message', 'Cambios guardados.', 'success');
} catch (error) {
setModalMessage('profile-settings-message', friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
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

function resetChatView() {
stopChatRealtime();
setText('chat-title', 'XIFRE');
setText('chat-subtitle', 'Selecciona una conversación');
avatarInto($('#chat-avatar'), 'XIFRE', null, 'private');
$('#chat-info-button')?.classList.add('hidden');
$('#message-input').disabled = true;
$('#message-input').value = '';
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
else if (type === 'save-group-settings') void saveGroupSettings();
else if (type === 'add-group-members') void addGroupMembers();
else if (type === 'request-delete-group') void deleteGroup();
else if (type === 'save-profile-settings') void saveProfileSettings();
else if (type === 'composer-placeholder') return;
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
}, true);

$('#friend-search')?.addEventListener('input', e => searchPeople(e.target.value));
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
previewFile(file, $('#settings-avatar-preview'), currentProfile?.username || 'Usuario', 'private');
});

$('#group-avatar-file')?.addEventListener('change', event => {
const file = event.target.files?.[0];
if (!file) return;
try { validateImage(file); } catch (error) { event.target.value = ''; toast(error.message, 'error'); return; }
pendingGroupAvatarFile = file;
previewFile(file, $('#group-edit-avatar-preview'), currentConversationData?.name || 'Grupo', 'group');
});

$('#message-form')?.addEventListener('submit', event => { event.preventDefault(); void sendMessage(); });
$('#message-input')?.addEventListener('input', () => {
const value = String($('#message-input').value || '').trim();
currentMentionIds.clear(); // mentions are recalculated from current text on send
mentionEverywhere = false;
updateMentionPicker();
updateSendState();
if (value) scheduleTyping(); else stopTypingBroadcast();
});
$('#message-input')?.addEventListener('keydown', event => {
const picker=$('#mention-picker');
if(!picker.classList.contains('hidden')){
const items=$$('.mention-item',picker);
if(event.key==='ArrowDown'){event.preventDefault();mentionPickerIndex=Math.min(mentionPickerIndex+1,items.length-1);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
if(event.key==='ArrowUp'){event.preventDefault();mentionPickerIndex=Math.max(mentionPickerIndex-1,0);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
if(event.key==='Enter'&&items.length){event.preventDefault();items[mentionPickerIndex]?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return;}
if(event.key==='Escape'){picker.classList.add('hidden');return;}
}
if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
});
$('#message-input')?.addEventListener('blur', () => stopTypingBroadcast());
$('#messages')?.addEventListener('scroll',()=>{const box=$('#messages');if(!currentConversation||!box)return;if(box.scrollHeight-box.scrollTop-box.clientHeight<12){const c=conversationCache.find(x=>String(x.id)===String(currentConversation));if(c&&(Number(c.unread_count)||c.has_mention)){void supabase.rpc('xifre_mark_read',{p_conversation_id:currentConversation}).then(()=>{c.unread_count=0;c.has_mention=false;renderConversations();});}}});

document.addEventListener('keydown', event => {
if (event.key === 'Escape') {
if (!$('#message-menu').classList.contains('hidden')) return closeMessageMenu();
if (!$('#confirm-modal').classList.contains('hidden')) return finishConfirm(false);
if (!$('#settings-modal').classList.contains('hidden')) return $('#settings-modal').classList.add('hidden');
$$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
}
});

document.addEventListener('visibilitychange', () => {
if (document.visibilityState !== 'visible' || !currentUser) return;
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
void startApplication(session);
return;
}
if (event === 'SIGNED_OUT') {
currentUser = null;
currentProfile = null;
appStarted = false;
resetChatView();
closeAllModals();
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
