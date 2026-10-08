(() => {
'use strict';

const CONFIG = {
  url: 'https://doppekualeyvrlbtumze.supabase.co',
  key: 'sb_publishable_96LHpw9bFMWX6tAl6p_6qA__ZANADwE'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let supabase = null;
let currentUser = null;
let currentProfile = null;
let currentConversation = null;
let currentConversationData = null;
let messageChannel = null;
let requestChannel = null;
let messagePoll = null;
let appStarted = false;
let startPromise = null;
let pendingEmail = sessionStorage.getItem('xifre_pending_email') || '';
let conversationCache = [];
let friendCache = [];
let memberCache = new Map();
let lastRenderedMessageId = null;

const screens = ['landing', 'login', 'register', 'email'];

function showScreen(name) {
  if (!screens.includes(name)) name = 'landing';
  screens.forEach(k => document.getElementById(`${k}-screen`)?.classList.toggle('active', k === name));
  if (name === 'login') setTimeout(() => $('#login-email')?.focus(), 250);
  if (name === 'register') setTimeout(() => $('#register-username')?.focus(), 250);
}

function showMain() {
  screens.forEach(k => document.getElementById(`${k}-screen`)?.classList.remove('active'));
  $('#main-screen')?.classList.add('active');
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function avatarMarkup(name, url, className = '') {
  const safeName = String(name || 'Usuario').trim() || 'Usuario';
  const initial = escapeHTML(safeName.charAt(0).toUpperCase() || 'X');
  const safeUrl = escapeHTML(String(url || '').trim());
  return `<div class="avatar ${escapeHTML(className)}">${safeUrl ? `<img src="${safeUrl}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : ''}<span>${initial}</span></div>`;
}

function avatarText(name) {
  return String(name || 'X').trim().charAt(0).toUpperCase() || 'X';
}

function setMessage(id, text = '', type = '') {
  const element = $(`#${id}`);
  if (element) {
    element.textContent = text;
    element.className = `auth-message${type ? ` ${type}` : ''}`;
  }
}

function setModalMessage(id, text = '', type = '') {
  const element = $(`#${id}`);
  if (element) {
    element.textContent = text;
    element.className = `modal-message${type ? ` ${type}` : ''}`;
  }
}

function setLoading(button, value) {
  if (!button) return;
  button.disabled = value;
  button.classList.toggle('loading', value);
  button.setAttribute('aria-busy', value ? 'true' : 'false');
}

function toast(text, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toastElement = document.createElement('div');
  toastElement.className = `toast toast-${type}`;
  toastElement.textContent = text;
  container.appendChild(toastElement);
  requestAnimationFrame(() => toastElement.classList.add('show'));
  setTimeout(() => {
    toastElement.classList.remove('show');
    setTimeout(() => toastElement.remove(), 300);
  }, 3300);
}

function friendlyAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('email not confirmed')) return 'Primero tienes que confirmar tu correo electrónico.';
  if (message.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos.';
  if (message.includes('user already registered')) return 'Ese correo ya está registrado.';
  if (message.includes('password should be at least')) return 'La contraseña es demasiado corta.';
  if (message.includes('rate limit')) return 'Demasiados intentos. Espera un poco y vuelve a intentarlo.';
  return error?.message || 'Ha ocurrido un error.';
}

function redirectURL() {
  return window.location.origin + window.location.pathname;
}

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatConversationDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatTime(timestamp);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

async function checkUsername(username) {
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1);
  if (error) throw error;
  return !(data || []).length;
}

async function register() {
  const button = $('#register-button');
  const username = normalizeUsername($('#register-username')?.value);
  const email = String($('#register-email')?.value || '').trim();
  const password = String($('#register-password')?.value || '');
  setMessage('register-message', '');

  if (!supabase) return setMessage('register-message', 'Supabase no se ha cargado.', 'error');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return setMessage('register-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
  if (!email) return setMessage('register-message', 'Escribe tu correo.', 'error');
  if (password.length < 6) return setMessage('register-message', 'La contraseña debe tener al menos 6 caracteres.', 'error');

  setLoading(button, true);
  try {
    if (!(await checkUsername(username))) {
      setMessage('register-message', 'Ese username ya está ocupado.', 'error');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: redirectURL()
      }
    });
    if (error) throw error;

    pendingEmail = email;
    sessionStorage.setItem('xifre_pending_email', email);
    if (data?.session) await startApplication(data.session);
    else {
      $('#confirmation-email').textContent = email;
      showScreen('email');
    }
  } catch (error) {
    console.error('REGISTER', error);
    setMessage('register-message', friendlyAuthError(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function login() {
  const button = $('#login-button');
  const email = String($('#login-email')?.value || '').trim();
  const password = String($('#login-password')?.value || '');
  setMessage('login-message', '');

  if (!supabase) return setMessage('login-message', 'Supabase no se ha cargado.', 'error');
  if (!email || !password) return setMessage('login-message', 'Introduce el correo y la contraseña.', 'error');

  setLoading(button, true);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.session) throw new Error('No se recibió una sesión válida.');
    sessionStorage.removeItem('xifre_pending_email');
    pendingEmail = '';
    await startApplication(data.session);
  } catch (error) {
    console.error('LOGIN', error);
    setMessage('login-message', friendlyAuthError(error), 'error');
    if (String(error?.message || '').toLowerCase().includes('email not confirmed')) {
      $('#confirmation-email').textContent = email;
      pendingEmail = email;
      sessionStorage.setItem('xifre_pending_email', email);
      showScreen('email');
    }
  } finally {
    setLoading(button, false);
  }
}

async function resendConfirmation() {
  if (!pendingEmail) {
    showScreen('register');
    return;
  }
  const button = $('#resend-confirmation');
  setLoading(button, true);
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: redirectURL() }
    });
    if (error) throw error;
    toast('Correo de confirmación reenviado.', 'success');
  } catch (error) {
    toast(friendlyAuthError(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,display_name,avatar_url')
    .eq('id', currentUser.id)
    .maybeSingle();

  currentProfile = data || {
    id: currentUser.id,
    username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
    display_name: currentUser.user_metadata?.username || 'Usuario',
    avatar_url: null
  };

  if (error) console.warn('PROFILE', error);

  const name = currentProfile.display_name || currentProfile.username || 'Usuario';
  const username = currentProfile.username || 'usuario';
  const profileAvatar = $('#profile-avatar');
  if (profileAvatar) profileAvatar.innerHTML = avatarMarkup(name, currentProfile.avatar_url);
  $('#profile-name').textContent = name;
  $('#profile-username').textContent = `@${username}`;
}

async function startApplication(session = null) {
  if (!supabase) throw new Error('Supabase no está inicializado.');

  const sessionUser = session?.user || null;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    try {
      let user = sessionUser;

      if (!user) {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        user = data?.session?.user || null;
      }

      if (!user) throw new Error('No hay una sesión autenticada.');

      currentUser = user;

      // La cuenta autenticada es suficiente para entrar a la aplicación.
      // Un problema al cargar perfiles/chats NO debe devolver al usuario
      // a la pantalla de login ni hacerle perder la sesión.
      try {
        await loadProfile();
      } catch (profileError) {
        console.warn('PROFILE STARTUP', profileError);
      }

      appStarted = true;
      showMain();
      resetChatView();

      const results = await Promise.allSettled([
        loadFriends(),
        loadConversations(),
        loadFriendRequests()
      ]);
      results.forEach(result => {
        if (result.status === 'rejected') console.error('START LOAD', result.reason);
      });

      try {
        setupRequestRealtime();
      } catch (realtimeError) {
        console.warn('REQUEST REALTIME', realtimeError);
      }

      return true;
    } catch (error) {
      console.error('START', error);

      // Solo volvemos al login si realmente no existe una sesión válida.
      // Un fallo de perfiles, chats o Realtime no debe expulsar al usuario.
      let validSession = null;
      try {
        const { data } = await supabase.auth.getSession();
        validSession = data?.session || null;
      } catch (sessionError) {
        console.warn('SESSION CHECK AFTER START ERROR', sessionError);
      }

      if (validSession?.user) {
        currentUser = validSession.user;
        appStarted = true;
        showMain();
        resetChatView();
        toast('Sesión iniciada. Algunas partes de Xifre todavía están cargando.', 'info');
        return true;
      }

      appStarted = false;
      currentUser = null;
      showScreen('login');
      setMessage('login-message', `No se pudo cargar tu cuenta: ${error?.message || 'error'}`, 'error');
      return false;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

async function logout() {
  if (supabase) await supabase.auth.signOut();
}

function stopMessageSystems() {
  if (messageChannel) supabase.removeChannel(messageChannel);
  if (requestChannel) supabase.removeChannel(requestChannel);
  messageChannel = null;
  requestChannel = null;
  if (messagePoll) clearInterval(messagePoll);
  messagePoll = null;
}

function closeApplication() {
  stopMessageSystems();
  currentUser = null;
  currentProfile = null;
  currentConversation = null;
  currentConversationData = null;
  conversationCache = [];
  friendCache = [];
  memberCache.clear();
  lastRenderedMessageId = null;
  appStarted = false;
  if ($('#message-input')) $('#message-input').disabled = true;
  if ($('#send-button')) $('#send-button').disabled = true;
  showScreen('landing');
}

function resetChatView() {
  currentConversation = null;
  currentConversationData = null;
  lastRenderedMessageId = null;
  memberCache.clear();
  if (messageChannel) supabase.removeChannel(messageChannel);
  messageChannel = null;
  if (messagePoll) clearInterval(messagePoll);
  messagePoll = null;
  $('#chat-title').textContent = 'Xifre';
  $('#chat-subtitle').textContent = 'Selecciona una conversación';
  $('#chat-avatar').innerHTML = avatarMarkup('Xifre');
  $('#chat-info-button')?.classList.add('hidden');
  $('#message-input').disabled = true;
  $('#send-button').disabled = true;
  $('#messages').innerHTML = '<div class="empty-chat"><div class="empty-chat-logo">X</div><h3>Bienvenido a Xifre</h3><p>Abre un chat desde la izquierda para empezar a hablar.</p></div>';
}

// ---------------------------------------------------------------------------
// Amigos / solicitudes
// ---------------------------------------------------------------------------

async function loadFriends() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('friendships')
    .select('user1_id,user2_id')
    .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);

  if (error) {
    console.error('FRIENDS', error);
    friendCache = [];
    renderFriendsModal();
    return;
  }

  const ids = [...new Set((data || [])
    .map(row => row.user1_id === currentUser.id ? row.user2_id : row.user1_id)
    .filter(Boolean))];

  if (!ids.length) {
    friendCache = [];
    renderFriendsModal();
    renderNewChatFriends();
    renderGroupFriends();
    return;
  }

  const profiles = await supabase
    .from('profiles')
    .select('id,username,display_name,avatar_url')
    .in('id', ids);

  if (profiles.error) {
    console.error('FRIEND PROFILES', profiles.error);
    return;
  }

  friendCache = profiles.data || [];
  renderFriendsModal();
  renderNewChatFriends();
  renderGroupFriends();
}

function renderFriendsModal() {
  const list = $('#friends-modal-list');
  if (!list) return;
  list.innerHTML = '';

  if (!friendCache.length) {
    list.innerHTML = '<div class="requests-empty"><strong>Aún no tienes amigos</strong><span>Acepta una solicitud para poder abrir un chat privado.</span></div>';
    return;
  }

  friendCache.forEach(friend => {
    const row = document.createElement('div');
    row.className = 'friend-modal-item';
    const name = friend.display_name || friend.username || 'Usuario';
    row.innerHTML = `
      <div class="friend-modal-user">
        ${avatarMarkup(name, friend.avatar_url, 'small-avatar')}
        <div class="friend-modal-copy">
          <div class="friend-modal-name">${escapeHTML(name)}</div>
          <div class="friend-modal-username">@${escapeHTML(friend.username || 'usuario')}</div>
        </div>
      </div>
      <button class="open-chat-button" type="button">Abrir chat</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      closeModal('friends-modal');
      await openPrivateChat(friend.id);
    });
    list.appendChild(row);
  });
}

function renderNewChatFriends() {
  const list = $('#new-chat-friends');
  if (!list) return;
  const search = normalizeUsername($('#friend-search')?.value);
  list.innerHTML = '';

  const friends = friendCache.filter(friend => {
    if (!search) return true;
    return normalizeUsername(friend.username).includes(search) || normalizeUsername(friend.display_name).includes(search);
  });

  if (!friends.length) {
    list.innerHTML = '<div class="requests-empty compact-empty"><strong>No hay resultados</strong><span>Si aún no sois amigos, usa el formulario de username de abajo.</span></div>';
    return;
  }

  friends.forEach(friend => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'new-chat-friend';
    const name = friend.display_name || friend.username || 'Usuario';
    row.innerHTML = `
      ${avatarMarkup(name, friend.avatar_url, 'small-avatar')}
      <span class="new-chat-friend-copy"><strong>${escapeHTML(name)}</strong><small>@${escapeHTML(friend.username || 'usuario')}</small></span>
      <span class="new-chat-arrow">→</span>`;
    row.addEventListener('click', () => {
      closeModal('friend-modal');
      openPrivateChat(friend.id);
    });
    list.appendChild(row);
  });
}

async function sendFriendRequest() {
  if (!currentUser) return;
  const input = $('#friend-username');
  const username = normalizeUsername(input?.value);
  if (!username) return setModalMessage('friend-message', 'Escribe un username.', 'error');
  if (username === currentProfile?.username) return setModalMessage('friend-message', 'No puedes añadirte a ti mismo.', 'error');

  const profile = await supabase.from('profiles').select('id,username').eq('username', username).maybeSingle();
  if (profile.error) return setModalMessage('friend-message', profile.error.message, 'error');
  if (!profile.data) return setModalMessage('friend-message', 'No existe ese username.', 'error');

  const friendship = await supabase
    .from('friendships')
    .select('id')
    .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${profile.data.id}),and(user1_id.eq.${profile.data.id},user2_id.eq.${currentUser.id})`)
    .maybeSingle();
  if (friendship.error) return setModalMessage('friend-message', friendship.error.message, 'error');
  if (friendship.data) return setModalMessage('friend-message', 'Ya sois amigos.', 'success');

  const existing = await supabase
    .from('friend_requests')
    .select('id,sender_id,receiver_id')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${profile.data.id}),and(sender_id.eq.${profile.data.id},receiver_id.eq.${currentUser.id})`)
    .maybeSingle();
  if (existing.error) return setModalMessage('friend-message', existing.error.message, 'error');
  if (existing.data) return setModalMessage('friend-message', 'Ya existe una solicitud pendiente.', 'error');

  const insert = await supabase.from('friend_requests').insert({ sender_id: currentUser.id, receiver_id: profile.data.id });
  if (insert.error) return setModalMessage('friend-message', insert.error.message, 'error');

  input.value = '';
  setModalMessage('friend-message', 'Solicitud enviada.', 'success');
}

async function loadFriendRequests() {
  if (!currentUser) return;
  const base = await supabase
    .from('friend_requests')
    .select('id,sender_id,receiver_id,created_at')
    .eq('receiver_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (base.error) {
    console.error('REQUESTS', base.error);
    renderFriendRequests([]);
    return;
  }

  const ids = [...new Set((base.data || []).map(request => request.sender_id))];
  let profiles = [];
  if (ids.length) {
    const response = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids);
    if (!response.error) profiles = response.data || [];
  }

  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  renderFriendRequests((base.data || []).map(request => ({ ...request, sender: profileMap.get(request.sender_id) || {} })));
}

function renderFriendRequests(requests) {
  const list = $('#friend-requests-list');
  if (!list) return;
  list.innerHTML = '';

  if (!requests.length) {
    list.innerHTML = '<div class="requests-empty"><strong>No tienes solicitudes pendientes</strong><span>Cuando alguien quiera ser tu amigo aparecerá aquí.</span></div>';
    return;
  }

  requests.forEach(request => {
    const sender = request.sender || {};
    const row = document.createElement('div');
    row.className = 'friend-request-item';
    const name = sender.display_name || sender.username || 'Usuario';
    row.innerHTML = `
      <div class="request-user">
        ${avatarMarkup(name, sender.avatar_url, 'small-avatar')}
        <div class="request-copy"><div class="request-name">${escapeHTML(name)}</div><div class="request-username">@${escapeHTML(sender.username || 'usuario')}</div></div>
      </div>
      <div class="request-actions"><button class="request-action request-accept" type="button">Aceptar</button><button class="request-action request-reject" type="button">Rechazar</button></div>`;

    const [acceptButton, rejectButton] = row.querySelectorAll('button');
    acceptButton.addEventListener('click', () => acceptFriendRequest(request.id, request.sender_id, row, acceptButton));
    rejectButton.addEventListener('click', () => rejectFriendRequest(request.id, row, rejectButton));
    list.appendChild(row);
  });
}

async function acceptFriendRequest(requestId, senderId, row, button) {
  if (!currentUser) return;
  const controls = $$('button', row);
  controls.forEach(control => { control.disabled = true; });
  button.textContent = 'Aceptando…';

  try {
    const first = String(currentUser.id) < String(senderId) ? currentUser.id : senderId;
    const second = String(currentUser.id) < String(senderId) ? senderId : currentUser.id;
    const existing = await supabase.from('friendships').select('id').eq('user1_id', first).eq('user2_id', second).maybeSingle();
    if (existing.error) throw existing.error;

    if (!existing.data) {
      const insert = await supabase.from('friendships').insert({ user1_id: first, user2_id: second });
      if (insert.error) throw insert.error;
    }

    const remove = await supabase.from('friend_requests').delete().eq('id', requestId).eq('receiver_id', currentUser.id);
    if (remove.error) throw remove.error;

    row.remove();
    toast('Ahora sois amigos.', 'success');
    await Promise.allSettled([loadFriends(), loadFriendRequests()]);
  } catch (error) {
    console.error('ACCEPT', error);
    controls.forEach(control => { control.disabled = false; });
    button.textContent = 'Aceptar';
    setModalMessage('requests-message', `No se pudo aceptar: ${error?.message || 'error'}`, 'error');
  }
}

async function rejectFriendRequest(requestId, row, button) {
  button.disabled = true;
  try {
    const { error } = await supabase.from('friend_requests').delete().eq('id', requestId).eq('receiver_id', currentUser.id);
    if (error) throw error;
    row.remove();
    toast('Solicitud rechazada.', 'info');
  } catch (error) {
    console.error('REJECT', error);
    button.disabled = false;
    toast(`No se pudo rechazar: ${error?.message || 'error'}`, 'error');
  }
}

async function openFriendRequests() {
  openModal('requests-modal');
  await loadFriendRequests();
}

// ---------------------------------------------------------------------------
// CHAT — toda la lógica sensible pasa por RPC.
// ---------------------------------------------------------------------------

async function loadConversations() {
  if (!currentUser) return;

  const response = await supabase.rpc('xifre_get_my_conversations');
  if (response.error) {
    console.error('CONVERSATIONS RPC', response.error);
    renderConversations([]);
    throw response.error;
  }

  conversationCache = (response.data || []).map(row => ({
    ...row,
    displayName: row.display_name || row.name || (row.type === 'group' ? 'Grupo' : 'Chat privado')
  }));
  renderConversations(conversationCache);
  return conversationCache;
}

function renderConversations(conversations) {
  const list = $('#conversation-list');
  if (!list) return;
  list.innerHTML = '';
  $('#chat-count').textContent = String(conversations.length);

  if (!conversations.length) {
    list.innerHTML = '<div class="empty-sidebar">Todavía no tienes chats.<br>Haz clic en «Nuevo chat» para empezar.</div>';
    return;
  }

  conversations.forEach(conversation => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `conversation${currentConversation === conversation.id ? ' active' : ''}`;
    const label = conversation.displayName || conversation.name || (conversation.type === 'group' ? 'Grupo' : 'Chat privado');
    const preview = conversation.last_message ? conversation.last_message : (conversation.type === 'group' ? `${conversation.member_count || 0} miembros` : 'Chat privado');
    row.innerHTML = `
      ${avatarMarkup(label, conversation.avatar_url, 'conversation-avatar-image')}
      <span class="conversation-copy">
        <span class="conversation-name">${escapeHTML(label)}</span>
        <span class="conversation-preview">${escapeHTML(preview)}</span>
      </span>
      <span class="conversation-meta">${escapeHTML(formatConversationDate(conversation.last_message_at))}</span>`;
    row.addEventListener('click', () => openConversation(conversation.id, conversation));
    list.appendChild(row);
  });
}

async function openPrivateChat(friendId) {
  if (!currentUser || !friendId) return;

  try {
    const response = await supabase.rpc('create_private_chat', { other_user: friendId });
    if (response.error) throw response.error;
    const conversationId = String(response.data || '').trim();
    if (!conversationId) throw new Error('Supabase no devolvió el ID del chat.');

    await loadConversations();
    await openConversation(conversationId);
  } catch (error) {
    console.error('PRIVATE CHAT', error);
    toast(`No se pudo abrir el chat: ${error?.message || 'error de Supabase'}`, 'error');
  }
}

async function openConversation(id, cached = null) {
  if (!id || !currentUser) return;

  const conversationId = String(id);
  let conversation = cached || conversationCache.find(item => String(item.id) === conversationId);

  if (!conversation) {
    try {
      await loadConversations();
      conversation = conversationCache.find(item => String(item.id) === conversationId);
    } catch (error) {
      showChatError(`No se pudo cargar la lista de chats. ${error?.message || ''}`);
      return;
    }
  }

  if (!conversation) {
    showChatError('Supabase creó el chat, pero no devolvió la conversación al usuario. Ejecuta el SQL V6 completo.');
    return;
  }

  try {
    currentConversation = conversationId;
    const members = await loadConversationMembers(conversationId);
    if (!members.length) throw new Error('La conversación no tiene miembros visibles para tu usuario.');

    currentConversation = conversationId;
    currentConversationData = conversation;
    lastRenderedMessageId = null;

    const other = members.find(member => String(member.user_id) !== String(currentUser.id));
    const displayName = conversation.type === 'private'
      ? (other?.display_name || other?.username || conversation.displayName || 'Chat privado')
      : (conversation.name || conversation.displayName || 'Grupo');
    const avatarURL = conversation.type === 'private' ? other?.avatar_url : null;

    $('#chat-title').textContent = displayName;
    $('#chat-subtitle').textContent = conversation.type === 'group'
      ? `${members.length} miembros`
      : `@${other?.username || conversation.username || 'usuario'}`;
    $('#chat-avatar').innerHTML = avatarMarkup(displayName, avatarURL);
    $('#chat-info-button')?.classList.remove('hidden');
    $('#message-input').disabled = false;
    $('#send-button').disabled = false;
    $('#message-status').textContent = '';

    renderConversations(conversationCache);
    await loadMessages(conversationId, members);
    subscribeMessages(conversationId);
    $('#message-input').focus();
  } catch (error) {
    console.error('OPEN CONVERSATION', error);
    showChatError(`No se pudo abrir esta conversación. ${error?.message || ''}`);
  }
}

async function loadConversationMembers(conversationId) {
  const cached = memberCache.get(conversationId);
  if (cached?.length) return cached;

  const response = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: conversationId });
  if (response.error) throw response.error;

  const members = response.data || [];
  memberCache.set(conversationId, members);
  return members;
}

function messageFromRPC(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content,
    created_at: row.created_at,
    sender_username: row.sender_username,
    sender_display_name: row.sender_display_name,
    sender_avatar_url: row.sender_avatar_url
  };
}

async function loadMessages(conversationId, members = []) {
  const box = $('#messages');
  if (!box) return;

  box.innerHTML = '<div class="empty-chat loading-chat"><div class="loading-orb"></div><h3>Cargando mensajes</h3><p>Conectando con Xifre…</p></div>';

  const response = await supabase.rpc('xifre_get_messages', {
    p_conversation_id: conversationId,
    p_limit: 300
  });

  if (response.error) {
    console.error('MESSAGES RPC', response.error);
    showChatError(`No se pudieron cargar los mensajes. ${response.error.message}`);
    return;
  }

  box.innerHTML = '';
  const messages = (response.data || []).map(messageFromRPC);
  lastRenderedMessageId = messages.length ? messages[messages.length - 1].id : null;

  if (!messages.length) {
    box.innerHTML = '<div class="empty-chat"><div class="empty-chat-logo">✦</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
    return;
  }

  const profileMap = new Map(members.map(member => [member.user_id, {
    username: member.username,
    display_name: member.display_name,
    avatar_url: member.avatar_url
  }]));

  messages.forEach(message => renderMessage(message, profileMap, currentConversationData?.type === 'group'));
  scrollMessages();
}

function renderMessage(message, profileMap, isGroup) {
  const box = $('#messages');
  if (!box || !message?.id) return;
  if ($(`[data-message-id="${CSS.escape(String(message.id))}"]`, box)) return;

  $('.empty-chat', box)?.remove();

  const mine = String(message.sender_id) === String(currentUser?.id);
  const sender = profileMap?.get(message.sender_id) || {
    username: message.sender_username,
    display_name: message.sender_display_name,
    avatar_url: message.sender_avatar_url
  };
  const senderName = sender.display_name || sender.username || 'Usuario';

  const row = document.createElement('div');
  row.className = `message-row${mine ? ' mine' : ''}`;
  row.dataset.messageId = String(message.id);

  const showSender = isGroup && !mine;
  row.innerHTML = `
    ${!mine ? avatarMarkup(senderName, sender.avatar_url, 'message-avatar') : ''}
    <div class="message-bubble">
      ${showSender ? `<div class="message-sender">${escapeHTML(senderName)}</div>` : ''}
      <div class="message-content">${escapeHTML(message.content)}</div>
      <div class="message-time">${escapeHTML(formatTime(message.created_at))}</div>
    </div>`;

  box.appendChild(row);
  lastRenderedMessageId = message.id;
}

function subscribeMessages(conversationId) {
  if (messageChannel) supabase.removeChannel(messageChannel);
  if (messagePoll) clearInterval(messagePoll);

  // Realtime is used when available.
  messageChannel = supabase
    .channel(`xifre-messages-${conversationId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, async payload => {
      if (String(payload.new?.sender_id) === String(currentUser?.id)) return;
      if (String(currentConversation) !== String(conversationId)) return;
      await refreshMessagesSilently(conversationId);
    })
    .subscribe((status, error) => {
      if (error) console.error('REALTIME', error);
      $('#message-status').textContent = status === 'SUBSCRIBED' ? '● conectado' : '';
    });

  // Polling de respaldo. Así el chat sigue funcionando aunque Realtime esté
  // mal configurado o tarde en suscribirse. No muestra ninguna notificación.
  messagePoll = setInterval(() => {
    if (currentConversation === conversationId && document.visibilityState !== 'hidden') {
      refreshMessagesSilently(conversationId);
    }
  }, 1800);
}

async function refreshMessagesSilently(conversationId) {
  if (!currentUser || currentConversation !== conversationId) return;
  const response = await supabase.rpc('xifre_get_messages', {
    p_conversation_id: conversationId,
    p_limit: 300
  });
  if (response.error) {
    console.error('MESSAGE REFRESH', response.error);
    return;
  }

  const messages = (response.data || []).map(messageFromRPC);
  const newestId = messages.length ? messages[messages.length - 1].id : null;
  if (newestId === lastRenderedMessageId && messages.length === $$('.message-row', $('#messages')).length) return;

  const members = memberCache.get(conversationId) || [];
  const profileMap = new Map(members.map(member => [member.user_id, {
    username: member.username,
    display_name: member.display_name,
    avatar_url: member.avatar_url
  }]));
  const wasAtBottom = isMessagesNearBottom();
  const box = $('#messages');

  if (!messages.length) {
    box.innerHTML = '<div class="empty-chat"><div class="empty-chat-logo">✦</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
    lastRenderedMessageId = null;
    return;
  }

  messages.forEach(message => renderMessage(message, profileMap, currentConversationData?.type === 'group'));
  lastRenderedMessageId = newestId;
  if (wasAtBottom) scrollMessages();
}

async function sendMessage() {
  if (!currentUser || !currentConversation) return;

  const input = $('#message-input');
  const button = $('#send-button');
  const content = String(input.value || '').trim();
  if (!content) return;

  button.disabled = true;
  input.disabled = true;
  $('#message-status').textContent = 'enviando…';

  try {
    const response = await supabase.rpc('xifre_send_message', {
      p_conversation_id: currentConversation,
      p_content: content
    });
    if (response.error) throw response.error;

    const data = response.data;
    const message = Array.isArray(data) ? data[0] : data;
    if (!message?.id) throw new Error('Supabase no devolvió el mensaje enviado.');

    const members = memberCache.get(currentConversation) || [];
    const profileMap = new Map(members.map(member => [member.user_id, {
      username: member.username,
      display_name: member.display_name,
      avatar_url: member.avatar_url
    }]));
    renderMessage(messageFromRPC(message), profileMap, currentConversationData?.type === 'group');

    input.value = '';
    $('#message-status').textContent = 'enviado';
    scrollMessages();
    setTimeout(() => {
      if (currentConversation) $('#message-status').textContent = '';
    }, 1200);

    // Actualiza el preview del chat lateral inmediatamente.
    const conversation = conversationCache.find(item => String(item.id) === String(currentConversation));
    if (conversation) {
      conversation.last_message = content;
      conversation.last_message_at = message.created_at;
      conversationCache.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
      renderConversations(conversationCache);
    }
  } catch (error) {
    console.error('SEND MESSAGE', error);
    $('#message-status').textContent = '';
    toast(`No se pudo enviar: ${error?.message || 'error'}`, 'error');
  } finally {
    button.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

function renderGroupFriends() {
  const list = $('#group-friends-list');
  if (!list) return;
  list.innerHTML = '';
  $('#group-selected-count').textContent = '0 seleccionados';

  if (!friendCache.length) {
    list.innerHTML = '<div class="requests-empty"><strong>Necesitas amigos</strong><span>Acepta solicitudes antes de crear un grupo.</span></div>';
    return;
  }

  friendCache.forEach(friend => {
    const label = document.createElement('label');
    label.className = 'group-friend-option';
    const name = friend.display_name || friend.username || 'Usuario';
    label.innerHTML = `
      <input type="checkbox" value="${escapeHTML(friend.id)}" class="group-friend-check">
      ${avatarMarkup(name, friend.avatar_url, 'small-avatar')}
      <span class="group-friend-copy"><strong>${escapeHTML(name)}</strong><small>@${escapeHTML(friend.username || 'usuario')}</small></span>
      <span class="custom-check">✓</span>`;
    list.appendChild(label);
  });

  $$('.group-friend-check', list).forEach(check => check.addEventListener('change', updateGroupSelectedCount));
}

function updateGroupSelectedCount() {
  const count = $$('.group-friend-check:checked', $('#group-friends-list')).length;
  $('#group-selected-count').textContent = `${count} seleccionado${count === 1 ? '' : 's'}`;
}

async function createGroup() {
  const button = $('#create-group-submit');
  const name = String($('#group-name')?.value || '').trim();
  const selected = $$('.group-friend-check:checked', $('#group-friends-list')).map(input => input.value).filter(Boolean);

  setModalMessage('group-message', '');
  if (!name) return setModalMessage('group-message', 'Escribe un nombre para el grupo.', 'error');
  if (!selected.length) return setModalMessage('group-message', 'Selecciona al menos un amigo.', 'error');

  setLoading(button, true);
  try {
    const response = await supabase.rpc('create_group', {
      group_name: name,
      member_ids: selected
    });
    if (response.error) throw response.error;

    const conversationId = String(response.data || '').trim();
    if (!conversationId) throw new Error('Supabase no devolvió el ID del grupo.');

    $('#group-name').value = '';
    closeModal('group-modal');
    await loadConversations();
    await openConversation(conversationId);
  } catch (error) {
    console.error('GROUP', error);
    setModalMessage('group-message', error?.message || 'No se pudo crear el grupo.', 'error');
  } finally {
    setLoading(button, false);
  }
}

// ---------------------------------------------------------------------------
// Info / UI
// ---------------------------------------------------------------------------

async function openChatInfo() {
  if (!currentConversation || !currentConversationData) return;
  try {
    const members = await loadConversationMembers(currentConversation);
    const title = currentConversationData.type === 'group'
      ? (currentConversationData.name || 'Grupo')
      : (members.find(member => String(member.user_id) !== String(currentUser.id))?.display_name || 'Chat privado');

    $('#info-title').textContent = title;
    $('#info-subtitle').textContent = currentConversationData.type === 'group' ? `${members.length} miembros` : 'Conversación privada';
    const list = $('#chat-members');
    list.innerHTML = '';

    members.forEach(member => {
      const row = document.createElement('div');
      row.className = 'chat-member';
      const name = member.display_name || member.username || 'Usuario';
      const role = member.is_owner ? 'Administrador' : (String(member.user_id) === String(currentUser.id) ? 'Tú' : 'Miembro');
      row.innerHTML = `
        ${avatarMarkup(name, member.avatar_url, 'small-avatar')}
        <div class="chat-member-copy"><div class="chat-member-name">${escapeHTML(name)}</div><div class="chat-member-role">@${escapeHTML(member.username || 'usuario')} · ${escapeHTML(role)}</div></div>`;
      list.appendChild(row);
    });

    openModal('chat-info-modal');
  } catch (error) {
    console.error('CHAT INFO', error);
    toast(`No se pudo cargar la información: ${error?.message || 'error'}`, 'error');
  }
}

function showChatError(message) {
  $('#messages').innerHTML = `<div class="message-error"><strong>No se pudo abrir esta conversación</strong><div>${escapeHTML(message)}</div><button type="button" id="retry-current-chat">Reintentar</button></div>`;
  $('#retry-current-chat')?.addEventListener('click', () => {
    if (currentConversation) openConversation(currentConversation);
  });
  $('#message-input').disabled = true;
  $('#send-button').disabled = true;
}

function openModal(id) {
  $(`#${id}`)?.classList.remove('hidden');
}

function closeModal(id) {
  $(`#${id}`)?.classList.add('hidden');
}

function scrollMessages() {
  const box = $('#messages');
  if (box) box.scrollTop = box.scrollHeight;
}

function isMessagesNearBottom() {
  const box = $('#messages');
  if (!box) return true;
  return box.scrollHeight - box.scrollTop - box.clientHeight < 120;
}

async function setupRequestRealtime() {
  if (!currentUser) return;
  if (requestChannel) supabase.removeChannel(requestChannel);

  requestChannel = supabase
    .channel(`xifre-request-events-${currentUser.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'friend_requests',
      filter: `receiver_id=eq.${currentUser.id}`
    }, async () => {
      await loadFriendRequests();
    })
    .subscribe();
}

function bind() {
  document.addEventListener('click', event => {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;

    if (action === 'logout') logout();
    if (action === 'resend') resendConfirmation();
    if (action === 'close-modal') closeModal(actionElement.dataset.modal);
    if (action === 'open-friend') {
      openModal('friend-modal');
      renderNewChatFriends();
      $('#friend-username')?.focus();
    }
    if (action === 'focus-friend-request') $('#friend-username')?.focus();
    if (action === 'open-group') {
      openModal('group-modal');
      renderGroupFriends();
      $('#group-name')?.focus();
    }
    if (action === 'send-friend') sendFriendRequest();
    if (action === 'create-group') createGroup();
    if (action === 'open-requests') openFriendRequests();
    if (action === 'open-friends') {
      openModal('friends-modal');
      renderFriendsModal();
      void loadFriends();
    }
    if (action === 'open-chat-info') openChatInfo();
  });

  $('#friend-search')?.addEventListener('input', renderNewChatFriends);
  $('#login-form')?.addEventListener('submit', event => { event.preventDefault(); login(); });
  $('#register-form')?.addEventListener('submit', event => { event.preventDefault(); register(); });
  $('#message-form')?.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
  $('#message-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') $$('.modal:not(.hidden)').forEach(modal => modal.classList.add('hidden'));
    if (event.key === 'Enter' && event.target.matches('#friend-username')) {
      event.preventDefault();
      sendFriendRequest();
    }
  });
}

async function init() {
  bind();

  try {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('La librería de Supabase no se ha cargado.');
    }

    supabase = window.supabase.createClient(CONFIG.url, CONFIG.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'xifre-auth-v6'
      }
    });

    // Primero escuchamos los cambios de autenticación y después consultamos
    // la sesión actual. Así no se pierde un SIGNED_IN que llegue durante el arranque.
    supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (event === 'SIGNED_IN' && session) {
          void startApplication(session);
        } else if (event === 'TOKEN_REFRESHED' && session && !appStarted) {
          void startApplication(session);
        } else if (event === 'INITIAL_SESSION' && session && !appStarted) {
          void startApplication(session);
        } else if (event === 'SIGNED_OUT') {
          closeApplication();
        }
      }, 0);
    });

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (data?.session) {
      await startApplication(data.session);
    } else {
      showScreen('landing');
    }
  } catch (error) {
    console.error('SUPABASE INIT', error);
    supabase = null;
    showScreen('login');
    setMessage('login-message', `No se pudo iniciar Xifre: ${error?.message || 'error de inicialización'}`, 'error');
  }
}

// Exponemos solo las acciones necesarias para que el HTML pueda impedir
// cualquier submit/navegación nativa y delegar siempre en Xifre.
window.XIFRE = {
  login,
  register,
  showScreen,
  logout
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

})();
