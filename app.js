/* =========================================================
   XIFRE
   Main application script
   ========================================================= */


/* =========================================================
   SUPABASE CONFIG
   ========================================================= */

const SUPABASE_URL = "https://doppekualeyvrlbtumze.supabase.co";
const SUPABASE_KEY = "sb_publishable_96LHpw9bFMWX6tAl6p_6qA__ZANADwE";

const { createClient } = window.supabase;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let currentConversation = null;
let realtimeChannel = null;

let conversations = [];
let friends = [];
let pendingRequests = [];


/* =========================================================
   DOM
   ========================================================= */

const authScreen =
    document.getElementById("auth-screen");

const mainScreen =
    document.getElementById("main-screen");

const loginForm =
    document.getElementById("login-form");

const registerForm =
    document.getElementById("register-form");

const authMessage =
    document.getElementById("auth-message");

const conversationList =
    document.getElementById("conversation-list");

const messagesContainer =
    document.getElementById("messages");

const messageForm =
    document.getElementById("message-form");

const messageInput =
    document.getElementById("message-input");

const chatTitle =
    document.getElementById("chat-title");

const chatSubtitle =
    document.getElementById("chat-subtitle");


/* =========================================================
   HELPERS
   ========================================================= */

function showAuthMessage(message, type = "error") {

    authMessage.textContent = message;

    if (type === "success") {
        authMessage.style.color = "#75e6a5";
    } else {
        authMessage.style.color = "#ff7c7c";
    }
}


function showFriendMessage(message, type = "error") {

    const element =
        document.getElementById("friend-message");

    if (!element) return;

    element.textContent = message;

    if (type === "success") {
        element.style.color = "#75e6a5";
    } else {
        element.style.color = "#ff7c7c";
    }
}


function showGroupMessage(message, type = "error") {

    const element =
        document.getElementById("group-message");

    if (!element) return;

    element.textContent = message;

    if (type === "success") {
        element.style.color = "#75e6a5";
    } else {
        element.style.color = "#ff7c7c";
    }
}


function normalizeUsername(username) {

    return username
        .trim()
        .toLowerCase();

}


function escapeHTML(value) {

    const div =
        document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;

}


function formatMessageTime(dateString) {

    const date =
        new Date(dateString);

    return date.toLocaleTimeString(
        "es-ES",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


function formatConversationName(conversation) {

    if (conversation.type === "group") {
        return conversation.name || "Grupo";
    }

    return "Chat privado";
}


/* =========================================================
   AUTH SCREEN SWITCHING
   ========================================================= */

document
    .getElementById("show-register")
    .addEventListener("click", () => {

        loginForm.classList.add("hidden");

        registerForm.classList.remove("hidden");

        showAuthMessage("");

    });


document
    .getElementById("show-login")
    .addEventListener("click", () => {

        registerForm.classList.add("hidden");

        loginForm.classList.remove("hidden");

        showAuthMessage("");

    });


/* =========================================================
   REGISTER
   ========================================================= */

document
    .getElementById("register-button")
    .addEventListener("click", registerUser);


async function registerUser() {

    const usernameInput =
        document.getElementById(
            "register-username"
        );

    const emailInput =
        document.getElementById(
            "register-email"
        );

    const passwordInput =
        document.getElementById(
            "register-password"
        );


    const username =
        normalizeUsername(
            usernameInput.value
        );

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;


    /* -----------------------------
       VALIDATION
       ----------------------------- */

    if (!username || !email || !password) {

        showAuthMessage(
            "Completa todos los campos."
        );

        return;
    }


    if (!/^[a-z0-9_]+$/.test(username)) {

        showAuthMessage(
            "El username solo puede contener letras, números y _."
        );

        return;
    }


    if (username.length < 3) {

        showAuthMessage(
            "El username debe tener al menos 3 caracteres."
        );

        return;
    }


    if (username.length > 20) {

        showAuthMessage(
            "El username puede tener como máximo 20 caracteres."
        );

        return;
    }


    if (password.length < 6) {

        showAuthMessage(
            "La contraseña debe tener al menos 6 caracteres."
        );

        return;
    }


    /* -----------------------------
       CHECK USERNAME
       ----------------------------- */

    showAuthMessage(
        "Comprobando username...",
        "success"
    );


    const {
        data: existingProfile,
        error: usernameError
    } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();


    if (usernameError) {

        console.error(
            "Username check error:",
            usernameError
        );

        showAuthMessage(
            "No se pudo comprobar el username."
        );

        return;
    }


    if (existingProfile) {

        showAuthMessage(
            "Ese username ya está ocupado."
        );

        return;
    }


    /* -----------------------------
       CREATE AUTH USER
       ----------------------------- */

    showAuthMessage(
        "Creando cuenta...",
        "success"
    );


    /*
       IMPORTANT:

       Because Confirm Email is enabled,
       Supabase will create the account but
       will NOT create an authenticated session
       until the user confirms the email.

       We explicitly tell Supabase where to
       return after confirmation.
    */

    const redirectURL =
        window.location.origin +
        window.location.pathname;


    const {
        data,
        error
    } = await supabase.auth.signUp({

        email: email,

        password: password,

        options: {

            emailRedirectTo: redirectURL,

            data: {

                username: username

            }

        }

    });


    if (error) {

        console.error(
            "Registration error:",
            error
        );

        showAuthMessage(
            error.message
        );

        return;
    }


    /* -----------------------------
       ACCOUNT CREATED
       ----------------------------- */

    /*
       With Confirm Email enabled,
       data.session should be null.
    */

    if (!data.session) {

        showAuthMessage(
            "Cuenta creada. Revisa tu correo y confirma tu email antes de iniciar sesión.",
            "success"
        );


        registerForm
            .querySelectorAll("input")
            .forEach(input => {

                if (
                    input.id !==
                    "register-email"
                ) {
                    input.value = "";
                }

            });


        return;
    }


    /*
       This should normally not happen
       while Confirm Email is enabled,
       but we support it anyway.
    */

    await openApplication();

}


/* =========================================================
   LOGIN
   ========================================================= */

document
    .getElementById("login-button")
    .addEventListener("click", loginUser);


async function loginUser() {

    const email =
        document
            .getElementById("login-email")
            .value
            .trim();

    const password =
        document
            .getElementById("login-password")
            .value;


    if (!email || !password) {

        showAuthMessage(
            "Introduce el correo y la contraseña."
        );

        return;
    }


    showAuthMessage(
        "Iniciando sesión...",
        "success"
    );


    const {
        data,
        error
    } = await supabase.auth.signInWithPassword({

        email: email,

        password: password

    });


    if (error) {

        console.error(
            "Login error:",
            error
        );


        /*
           If the email hasn't been confirmed,
           Supabase normally prevents the login.
        */

        if (
            error.message
                .toLowerCase()
                .includes("email not confirmed")
        ) {

            showAuthMessage(
                "Primero tienes que confirmar tu correo electrónico."
            );

            return;
        }


        showAuthMessage(
            "Correo o contraseña incorrectos."
        );

        return;
    }


    if (!data.session) {

        showAuthMessage(
            "No se pudo crear la sesión."
        );

        return;
    }


    await openApplication();

}


/* =========================================================
   AUTH STATE
   ========================================================= */

supabase.auth.onAuthStateChange(
    async (event, session) => {

        console.log(
            "Auth event:",
            event
        );


        if (
            event === "SIGNED_IN" &&
            session
        ) {

            await openApplication();

        }


        if (
            event === "SIGNED_OUT"
        ) {

            closeApplication();

        }

    }
);


/* =========================================================
   INITIAL LOAD
   ========================================================= */

async function initializeXifre() {

    /*
       getSession() is fine here to determine
       whether a local session exists.

       We then use getUser() when we actually
       need the authenticated user.
    */

    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();


    if (!session) {

        authScreen.classList.remove(
            "hidden"
        );

        mainScreen.classList.add(
            "hidden"
        );

        return;
    }


    await openApplication();

}


/* =========================================================
   OPEN APPLICATION
   ========================================================= */

async function openApplication() {

    const {
        data: {
            user
        },
        error
    } = await supabase.auth.getUser();


    if (error || !user) {

        console.error(
            "Could not get user:",
            error
        );

        return;
    }


    currentUser = user;


    authScreen.classList.add(
        "hidden"
    );

    mainScreen.classList.remove(
        "hidden"
    );


    await loadProfile();

    await loadFriends();

    await loadPendingRequests();

    await loadConversations();

    setupRealtimeRequests();

}


/* =========================================================
   CLOSE APPLICATION
   ========================================================= */

function closeApplication() {

    currentUser = null;

    currentProfile = null;

    currentConversation = null;

    conversations = [];

    friends = [];

    pendingRequests = [];


    if (realtimeChannel) {

        supabase.removeChannel(
            realtimeChannel
        );

        realtimeChannel = null;

    }


    conversationList.innerHTML = "";

    messagesContainer.innerHTML = "";

    chatTitle.textContent =
        "Selecciona una conversación";

    chatSubtitle.textContent =
        "";


    mainScreen.classList.add(
        "hidden"
    );

    authScreen.classList.remove(
        "hidden"
    );

}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

async function loadProfile() {

    if (!currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();


    if (error) {

        console.error(
            "Profile error:",
            error
        );

        return;
    }


    currentProfile = data;


    const usernameElement =
        document.getElementById(
            "my-username"
        );


    const avatarElement =
        document.getElementById(
            "my-avatar"
        );


    usernameElement.textContent =
        "@" + data.username;


    avatarElement.textContent =
        data.username
            .charAt(0)
            .toUpperCase();

}


/* =========================================================
   LOGOUT
   ========================================================= */

document
    .getElementById("logout-button")
    .addEventListener(
        "click",
        async () => {

            await supabase.auth.signOut();

        }
    );


/* =========================================================
   FRIEND SYSTEM
   ========================================================= */


/* -----------------------------
   OPEN FRIEND MODAL
   ----------------------------- */

document
    .getElementById("add-friend-button")
    .addEventListener("click", () => {

        document
            .getElementById("friend-modal")
            .classList.remove(
                "hidden"
            );

        document
            .getElementById("friend-username")
            .value = "";

        showFriendMessage("");

    });


/* -----------------------------
   CLOSE FRIEND MODAL
   ----------------------------- */

document
    .getElementById("close-friend-modal")
    .addEventListener("click", () => {

        document
            .getElementById("friend-modal")
            .classList.add(
                "hidden"
            );

    });


/* -----------------------------
   SEND FRIEND REQUEST
   ----------------------------- */

document
    .getElementById("send-friend-button")
    .addEventListener(
        "click",
        sendFriendRequest
    );


async function sendFriendRequest() {

    if (!currentUser) return;


    const input =
        document.getElementById(
            "friend-username"
        );


    const username =
        normalizeUsername(
            input.value
        );


    if (!username) {

        showFriendMessage(
            "Escribe un username."
        );

        return;
    }


    if (
        currentProfile &&
        username ===
        currentProfile.username
    ) {

        showFriendMessage(
            "No puedes añadirte a ti mismo."
        );

        return;
    }


    showFriendMessage(
        "Buscando usuario...",
        "success"
    );


    const {
        data: profile,
        error
    } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("username", username)
        .maybeSingle();


    if (error) {

        console.error(
            "Find user error:",
            error
        );

        showFriendMessage(
            "No se pudo buscar el usuario."
        );

        return;
    }


    if (!profile) {

        showFriendMessage(
            "No existe ese username."
        );

        return;
    }


    /* -----------------------------
       CHECK EXISTING FRIENDSHIP
       ----------------------------- */

    const {
        data: existingFriendship
    } = await supabase
        .from("friendships")
        .select("id")
        .or(
            `and(user1_id.eq.${currentUser.id},user2_id.eq.${profile.id}),and(user1_id.eq.${profile.id},user2_id.eq.${currentUser.id})`
        )
        .maybeSingle();


    if (existingFriendship) {

        showFriendMessage(
            "Ya sois amigos."
        );

        return;
    }


    /* -----------------------------
       CHECK EXISTING REQUEST
       ----------------------------- */

    const {
        data: existingRequest
    } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status")
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${currentUser.id})`
        )
        .eq("status", "pending")
        .maybeSingle();


    if (existingRequest) {

        showFriendMessage(
            "Ya existe una solicitud pendiente."
        );

        return;
    }


    /* -----------------------------
       CREATE REQUEST
       ----------------------------- */

    const {
        error: insertError
    } = await supabase
        .from("friend_requests")
        .insert({

            sender_id:
                currentUser.id,

            receiver_id:
                profile.id

        });


    if (insertError) {

        console.error(
            "Friend request error:",
            insertError
        );

        showFriendMessage(
            "No se pudo enviar la solicitud."
        );

        return;
    }


    showFriendMessage(
        "Solicitud enviada correctamente.",
        "success"
    );


    await loadPendingRequests();

}


/* =========================================================
   LOAD FRIENDS
   ========================================================= */

async function loadFriends() {

    if (!currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("friendships")
        .select("user1_id, user2_id")
        .or(
            `user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`
        );


    if (error) {

        console.error(
            "Friends error:",
            error
        );

        return;
    }


    const friendIds = data.map(
        friendship => {

            if (
                friendship.user1_id ===
                currentUser.id
            ) {

                return friendship.user2_id;

            }

            return friendship.user1_id;

        }
    );


    if (friendIds.length === 0) {

        friends = [];

        renderFriends();

        return;
    }


    const {
        data: profiles,
        error: profileError
    } = await supabase
        .from("profiles")
        .select(
            "id, username, display_name, avatar_url"
        )
        .in(
            "id",
            friendIds
        );


    if (profileError) {

        console.error(
            "Friend profiles error:",
            profileError
        );

        return;
    }


    friends = profiles || [];


    renderFriends();

}


/* =========================================================
   RENDER FRIENDS
   ========================================================= */

function renderFriends() {

    let section =
        document.getElementById(
            "friends-section"
        );


    if (!section) {

        section =
            document.createElement(
                "div"
            );

        section.id =
            "friends-section";


        const title =
            document.createElement(
                "div"
            );

        title.className =
            "section-title";

        title.textContent =
            "Amigos";


        const list =
            document.createElement(
                "div"
            );

        list.id =
            "friends-list";


        section.appendChild(title);

        section.appendChild(list);


        conversationList
            .parentElement
            .insertBefore(
                section,
                conversationList
            );

    }


    const list =
        document.getElementById(
            "friends-list"
        );


    list.innerHTML = "";


    if (friends.length === 0) {

        const empty =
            document.createElement(
                "div"
            );

        empty.style.padding =
            "10px 17px";

        empty.style.color =
            "#737b86";

        empty.style.fontSize =
            "13px";

        empty.textContent =
            "Todavía no tienes amigos.";


        list.appendChild(empty);

        return;
    }


    friends.forEach(friend => {

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "conversation";


        const name =
            document.createElement(
                "div"
            );

        name.className =
            "conversation-name";

        name.textContent =
            "@" + friend.username;


        const type =
            document.createElement(
                "div"
            );

        type.className =
            "conversation-type";

        type.textContent =
            "Abrir chat";


        item.appendChild(name);

        item.appendChild(type);


        item.addEventListener(
            "click",
            async () => {

                await openPrivateChat(
                    friend.id
                );

            }
        );


        list.appendChild(item);

    });

}


/* =========================================================
   LOAD PENDING FRIEND REQUESTS
   ========================================================= */

async function loadPendingRequests() {

    if (!currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("friend_requests")
        .select(`
            id,
            sender_id,
            receiver_id,
            status,
            created_at,
            sender:profiles!friend_requests_sender_id_fkey(
                id,
                username,
                display_name
            )
        `)
        .eq(
            "receiver_id",
            currentUser.id
        )
        .eq(
            "status",
            "pending"
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );


    if (error) {

        console.error(
            "Friend requests error:",
            error
        );

        return;
    }


    pendingRequests =
        data || [];


    renderFriendRequests();

}


/* =========================================================
   RENDER FRIEND REQUESTS
   ========================================================= */

function renderFriendRequests() {

    let section =
        document.getElementById(
            "requests-section"
        );


    if (!section) {

        section =
            document.createElement(
                "div"
            );

        section.id =
            "requests-section";


        const title =
            document.createElement(
                "div"
            );

        title.className =
            "section-title";

        title.textContent =
            "Solicitudes";


        const list =
            document.createElement(
                "div"
            );

        list.id =
            "requests-list";


        section.appendChild(title);

        section.appendChild(list);


        conversationList
            .parentElement
            .insertBefore(
                section,
                conversationList
            );

    }


    const list =
        document.getElementById(
            "requests-list"
        );


    list.innerHTML = "";


    if (pendingRequests.length === 0) {

        section.classList.add(
            "hidden"
        );

        return;
    }


    section.classList.remove(
        "hidden"
    );


    pendingRequests.forEach(
        request => {

            const item =
                document.createElement(
                    "div"
                );

            item.style.padding =
                "10px 15px";


            const username =
                document.createElement(
                    "div"
                );

            username.style.marginBottom =
                "7px";

            username.style.fontWeight =
                "600";


            username.textContent =
                "@" +
                request.sender.username;


            const accept =
                document.createElement(
                    "button"
                );

            accept.textContent =
                "Aceptar";

            accept.style.margin =
                "0 5px 0 0";

            accept.style.padding =
                "7px 9px";


            const reject =
                document.createElement(
                    "button"
                );

            reject.textContent =
                "Rechazar";

            reject.className =
                "secondary-button";

            reject.style.padding =
                "7px 9px";


            accept.addEventListener(
                "click",
                async () => {

                    await acceptFriendRequest(
                        request.id
                    );

                }
            );


            reject.addEventListener(
                "click",
                async () => {

                    await rejectFriendRequest(
                        request.id
                    );

                }
            );


            item.appendChild(
                username
            );

            item.appendChild(
                accept
            );

            item.appendChild(
                reject
            );


            list.appendChild(item);

        }
    );

}


/* =========================================================
   ACCEPT FRIEND REQUEST
   ========================================================= */

async function acceptFriendRequest(
    requestId
) {

    const {
        data,
        error
    } = await supabase.rpc(
        "accept_friend_request",
        {
            request_id:
                requestId
        }
    );


    if (error) {

        console.error(
            "Accept friend error:",
            error
        );

        alert(
            "No se pudo aceptar la solicitud."
        );

        return;
    }


    if (!data) {

        alert(
            "La solicitud ya no está disponible."
        );

        return;
    }


    await loadFriends();

    await loadPendingRequests();

}


/* =========================================================
   REJECT FRIEND REQUEST
   ========================================================= */

async function rejectFriendRequest(
    requestId
) {

    const {
        error
    } = await supabase
        .from("friend_requests")
        .update({
            status: "rejected"
        })
        .eq(
            "id",
            requestId
        )
        .eq(
            "receiver_id",
            currentUser.id
        );


    if (error) {

        console.error(
            "Reject friend error:",
            error
        );

        alert(
            "No se pudo rechazar la solicitud."
        );

        return;
    }


    await loadPendingRequests();

}


/* =========================================================
   CONVERSATIONS
   ========================================================= */

async function loadConversations() {

    if (!currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("conversation_members")
        .select(`
            conversation_id,
            conversations (
                id,
                type,
                name,
                owner_id,
                created_at
            )
        `)
        .eq(
            "user_id",
            currentUser.id
        );


    if (error) {

        console.error(
            "Conversations error:",
            error
        );

        return;
    }


    conversations =
        (data || [])
            .map(row =>
                row.conversations
            )
            .filter(Boolean);


    /*
       Remove duplicates.
    */

    const map =
        new Map();


    conversations.forEach(
        conversation => {

            map.set(
                conversation.id,
                conversation
            );

        }
    );


    conversations =
        Array.from(
            map.values()
        );


    renderConversations();

}


/* =========================================================
   RENDER CONVERSATIONS
   ========================================================= */

function renderConversations() {

    conversationList.innerHTML = "";


    if (conversations.length === 0) {

        const empty =
            document.createElement(
                "div"
            );

        empty.style.padding =
            "15px 17px";

        empty.style.color =
            "#737b86";

        empty.style.fontSize =
            "13px";

        empty.textContent =
            "No tienes conversaciones.";


        conversationList.appendChild(
            empty
        );

        return;
    }


    conversations.forEach(
        conversation => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "conversation";


            if (
                currentConversation ===
                conversation.id
            ) {

                item.classList.add(
                    "active"
                );

            }


            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "conversation-name";

            name.textContent =
                formatConversationName(
                    conversation
                );


            const type =
                document.createElement(
                    "div"
                );

            type.className =
                "conversation-type";

            type.textContent =
                conversation.type ===
                "group"
                    ? "Grupo"
                    : "Privado";


            item.appendChild(name);

            item.appendChild(type);


            item.addEventListener(
                "click",
                async () => {

                    await openConversation(
                        conversation.id
                    );

                }
            );


            conversationList.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   CREATE / OPEN PRIVATE CHAT
   ========================================================= */

async function openPrivateChat(
    friendId
) {

    if (!currentUser) return;


    const {
        data: conversationId,
        error
    } = await supabase.rpc(
        "create_private_chat",
        {
            other_user:
                friendId
        }
    );


    if (error) {

        console.error(
            "Private chat error:",
            error
        );

        alert(
            "No se pudo crear el chat privado."
        );

        return;
    }


    await loadConversations();

    await openConversation(
        conversationId
    );

}


/* =========================================================
   OPEN CONVERSATION
   ========================================================= */

async function openConversation(
    conversationId
) {

    if (!currentUser) return;


    currentConversation =
        conversationId;


    renderConversations();


    const conversation =
        conversations.find(
            item =>
                item.id ===
                conversationId
        );


    if (!conversation) {

        console.error(
            "Conversation not found."
        );

        return;
    }


    chatTitle.textContent =
        formatConversationName(
            conversation
        );


    chatSubtitle.textContent =
        conversation.type === "group"
            ? "Grupo"
            : "Chat privado";


    messagesContainer.innerHTML =
        "";


    await loadMessages(
        conversationId
    );


    subscribeToMessages(
        conversationId
    );


    messageInput.focus();

}


/* =========================================================
   LOAD MESSAGES
   ========================================================= */

async function loadMessages(
    conversationId
) {

    const {
        data,
        error
    } = await supabase
        .from("messages")
        .select(`
            id,
            conversation_id,
            sender_id,
            content,
            created_at,
            sender:profiles!messages_sender_id_fkey(
                username,
                display_name
            )
        `)
        .eq(
            "conversation_id",
            conversationId
        )
        .order(
            "created_at",
            {
                ascending: true
            }
        );


    if (error) {

        console.error(
            "Messages error:",
            error
        );

        messagesContainer.innerHTML =
            "<p>No se pudieron cargar los mensajes.</p>";

        return;
    }


    messagesContainer.innerHTML =
        "";


    (data || []).forEach(
        message => {

            renderMessage(
                message,
                false
            );

        }
    );


    scrollMessagesToBottom();

}


/* =========================================================
   RENDER MESSAGE
   ========================================================= */

function renderMessage(
    message,
    scroll = true
) {

    /*
       Avoid duplicate messages.
    */

    if (
        document.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {

        return;
    }


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "message";


    wrapper.dataset.messageId =
        message.id;


    if (
        message.sender_id ===
        currentUser.id
    ) {

        wrapper.classList.add(
            "mine"
        );

    }


    const bubble =
        document.createElement(
            "div"
        );

    bubble.className =
        "message-bubble";


    /*
       textContent instead of innerHTML
       prevents message content from
       becoming executable HTML.
    */

    bubble.textContent =
        message.content;


    const meta =
        document.createElement(
            "div"
        );

    meta.className =
        "message-meta";


    const senderName =
        message.sender &&
        message.sender.username
            ? "@" +
              message.sender.username
            : "Usuario";


    meta.textContent =
        senderName +
        " · " +
        formatMessageTime(
            message.created_at
        );


    wrapper.appendChild(
        bubble
    );

    wrapper.appendChild(
        meta
    );


    messagesContainer.appendChild(
        wrapper
    );


    if (scroll) {

        scrollMessagesToBottom();

    }

}


/* =========================================================
   SCROLL
   ========================================================= */

function scrollMessagesToBottom() {

    messagesContainer.scrollTop =
        messagesContainer.scrollHeight;

}


/* =========================================================
   REALTIME MESSAGES
   ========================================================= */

function subscribeToMessages(
    conversationId
) {

    /*
       Remove previous conversation
       subscription.
    */

    if (realtimeChannel) {

        supabase.removeChannel(
            realtimeChannel
        );

        realtimeChannel = null;

    }


    realtimeChannel =
        supabase
            .channel(
                "messages-" +
                conversationId +
                "-" +
                Date.now()
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter:
                        "conversation_id=eq." +
                        conversationId
                },
                async payload => {

                    /*
                       The Realtime payload does
                       not contain the joined sender
                       profile, so fetch it.
                    */

                    const {
                        data: sender
                    } = await supabase
                        .from("profiles")
                        .select(
                            "username, display_name"
                        )
                        .eq(
                            "id",
                            payload.new.sender_id
                        )
                        .maybeSingle();


                    const message = {

                        ...payload.new,

                        sender:
                            sender || null

                    };


                    renderMessage(
                        message
                    );

                }
            )
            .subscribe(
                status => {

                    console.log(
                        "Message realtime:",
                        status
                    );

                }
            );

}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

messageForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        if (!currentUser) return;

        if (!currentConversation) {

            return;
        }


        const content =
            messageInput.value.trim();


        if (!content) return;


        /*
           Clear input immediately.
        */

        messageInput.value = "";


        const {
            error
        } = await supabase
            .from("messages")
            .insert({

                conversation_id:
                    currentConversation,

                sender_id:
                    currentUser.id,

                content:
                    content

            });


        if (error) {

            console.error(
                "Send message error:",
                error
            );


            messageInput.value =
                content;


            alert(
                "No se pudo enviar el mensaje."
            );

        }

    }
);


/* =========================================================
   GROUP SYSTEM
   ========================================================= */


/* -----------------------------
   OPEN GROUP MODAL
   ----------------------------- */

document
    .getElementById("create-group-button")
    .addEventListener("click", () => {

        document
            .getElementById("group-modal")
            .classList.remove(
                "hidden"
            );

        document
            .getElementById("group-name")
            .value = "";

        document
            .getElementById("group-members")
            .value = "";

        showGroupMessage("");

    });


/* -----------------------------
   CLOSE GROUP MODAL
   ----------------------------- */

document
    .getElementById("close-group-modal")
    .addEventListener("click", () => {

        document
            .getElementById("group-modal")
            .classList.add(
                "hidden"
            );

    });


/* -----------------------------
   CREATE GROUP
   ----------------------------- */

document
    .getElementById("create-group-submit")
    .addEventListener(
        "click",
        createGroup
    );


async function createGroup() {

    if (!currentUser) return;


    const groupName =
        document
            .getElementById(
                "group-name"
            )
            .value
            .trim();


    const memberText =
        document
            .getElementById(
                "group-members"
            )
            .value
            .trim();


    if (!groupName) {

        showGroupMessage(
            "Escribe un nombre para el grupo."
        );

        return;
    }


    let usernames = [];


    if (memberText) {

        usernames =
            memberText
                .split(",")
                .map(
                    username =>
                        normalizeUsername(
                            username
                        )
                )
                .filter(Boolean);

    }


    /*
       Remove duplicates.
    */

    usernames =
        [...new Set(usernames)];


    /*
       The creator does not need
       to enter their own username.
    */

    usernames =
        usernames.filter(
            username =>
                !currentProfile ||
                username !==
                currentProfile.username
        );


    let memberIds = [];


    if (usernames.length > 0) {

        const {
            data: profiles,
            error
        } = await supabase
            .from("profiles")
            .select(
                "id, username"
            )
            .in(
                "username",
                usernames
            );


        if (error) {

            console.error(
                "Group members error:",
                error
            );

            showGroupMessage(
                "No se pudieron buscar los miembros."
            );

            return;
        }


        const foundUsernames =
            new Set(
                (profiles || [])
                    .map(
                        profile =>
                            profile.username
                    )
            );


        const missing =
            usernames.filter(
                username =>
                    !foundUsernames.has(
                        username
                    )
            );


        if (missing.length > 0) {

            showGroupMessage(
                "No existe: @" +
                missing.join(", @")
            );

            return;
        }


        memberIds =
            (profiles || [])
                .map(
                    profile =>
                        profile.id
                );

    }


    showGroupMessage(
        "Creando grupo...",
        "success"
    );


    const {
        data: conversationId,
        error
    } = await supabase.rpc(
        "create_group",
        {
            group_name:
                groupName,

            member_ids:
                memberIds
        }
    );


    if (error) {

        console.error(
            "Create group error:",
            error
        );

        showGroupMessage(
            "No se pudo crear el grupo."
        );

        return;
    }


    showGroupMessage(
        "Grupo creado.",
        "success"
    );


    document
        .getElementById(
            "group-modal"
        )
        .classList.add(
            "hidden"
        );


    await loadConversations();

    await openConversation(
        conversationId
    );

}


/* =========================================================
   REALTIME FRIEND REQUESTS
   ========================================================= */

let requestRealtimeChannel = null;


function setupRealtimeRequests() {

    if (!currentUser) return;


    if (requestRealtimeChannel) {

        supabase.removeChannel(
            requestRealtimeChannel
        );

    }


    requestRealtimeChannel =
        supabase
            .channel(
                "friend-requests-" +
                currentUser.id
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "friend_requests",
                    filter:
                        "receiver_id=eq." +
                        currentUser.id
                },
                async () => {

                    await loadPendingRequests();

                }
            )
            .subscribe(
                status => {

                    console.log(
                        "Friend request realtime:",
                        status
                    );

                }
            );

}


/* =========================================================
   HANDLE AUTH REDIRECT / EMAIL CONFIRMATION
   ========================================================= */

function handleAuthURL() {

    /*
       Supabase automatically processes the
       authentication URL when the client
       initializes.

       We only check whether an auth error
       was returned in the URL.
    */

    const hash =
        window.location.hash;


    if (!hash) return;


    const params =
        new URLSearchParams(
            hash.substring(1)
        );


    const error =
        params.get(
            "error_description"
        );


    if (error) {

        showAuthMessage(
            decodeURIComponent(
                error.replace(
                    /\+/g,
                    " "
                )
            )
        );

    }

}


/* =========================================================
   CLEAN URL AFTER AUTH
   ========================================================= */

function cleanAuthURL() {

    /*
       Keep the page URL clean after
       Supabase has processed the
       confirmation session.
    */

    if (
        window.location.hash &&
        (
            window.location.hash.includes(
                "access_token"
            ) ||
            window.location.hash.includes(
                "refresh_token"
            )
        )
    ) {

        window.history.replaceState(
            {},
            document.title,
            window.location.pathname +
            window.location.search
        );

    }

}


/* =========================================================
   START XIFRE
   ========================================================= */

handleAuthURL();

initializeXifre();
