from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import httpx
from app.database.config import settings


class AIProvider(ABC):
    @abstractmethod
    async def chat(
        self, messages: List[Dict[str, Any]], context: Dict[str, Any] = None
    ) -> str:
        raise NotImplementedError


class ServiceProvider(AIProvider):
    """Service AI agent for KB-CHAT users. Provides help, how-to guides, troubleshooting, and proactive tips."""

    # Knowledge base: user-facing how-to guides and troubleshooting
    HELP_TOPICS = {
        "getting_started": {
            "keywords": ["start", "begin", "new", "first time", "setup", "onboard"],
            "response": (
                "Welcome to KB-CHAT! 🎉 Here's how to get started:\n\n"
                "1. **Create an account** — Sign up with your email and password\n"
                "2. **Add contacts** — Search for people by username or email\n"
                "3. **Start a chat** — Click the + button or select a contact\n"
                "4. **Explore features** — Try groups, calls, polls, stickers, and more\n\n"
                "💡 **Pro tip:** Enable notifications in Settings so you never miss a message!"
            ),
        },
        "create_group": {
            "keywords": [
                "group",
                "create group",
                "new group",
                "team",
                "channel",
                "add members",
            ],
            "response": (
                "**Creating a Group Chat**\n\n"
                "1. Click the **+** button in the sidebar\n"
                "2. Select **'New Group'**\n"
                "3. Add a group name and optional photo\n"
                "4. Search and select members to add\n"
                "5. Click **Create**\n\n"
                "📝 **As admin you can:**\n"
                "• Add/remove members anytime\n"
                "• Promote others to admin\n"
                "• Change group name/photo\n"
                "• Create polls, events, and shared notes\n\n"
                "💡 **Pro tip:** Use @mentions to get someone's attention in busy groups!"
            ),
        },
        "send_message": {
            "keywords": ["send", "message", "text", "chat", "type", "write"],
            "response": (
                "**Sending Messages**\n\n"
                "• **Text** — Type in the input box and press Enter\n"
                "• **Voice note** — Hold the 🎤 button to record\n"
                "• **Sticker** — Click the 😊 button to pick a sticker\n"
                "• **File/Image** — Drag & drop or click 📎 to attach\n"
                "• **Poll** — Click 📊 to create a quick poll\n\n"
                "**Message features:**\n"
                "• **Reply** — Swipe right on a message (mobile) or hover → Reply\n"
                "• **React** — Hover a message → 😊 to add an emoji reaction\n"
                "• **Forward** — Hover → Forward to another chat\n"
                "• **Save** — Hover → Bookmark for later in Saved Messages\n\n"
                "💡 **Pro tip:** Press Shift+Enter for a new line without sending!"
            ),
        },
        "voice_video_call": {
            "keywords": ["call", "video call", "voice call", "ring", "webrtc", "meet"],
            "response": (
                "**Making Calls**\n\n"
                "1. Open any 1:1 chat or group\n"
                "2. Click the 📞 **Voice** or 📹 **Video** button in the header\n"
                "3. Wait for the other person to accept\n\n"
                "**During a call you can:**\n"
                "• Toggle camera/microphone\n"
                "• Switch cameras\n"
                "• Share your screen\n"
                "• Send chat messages (opens side panel)\n"
                "• See call duration\n\n"
                "📋 **Call History** — View past calls in the Calls panel (📞 icon in sidebar)\n\n"
                "💡 **Pro tip:** Test your mic/camera first in Settings → Privacy!"
            ),
        },
        "polls": {
            "keywords": ["poll", "vote", "survey", "choice", "question", "decide"],
            "response": (
                "**Creating Polls**\n\n"
                "1. In any chat, click 📊 in the composer\n"
                "2. Enter your question\n"
                "3. Add answer options (minimum 2)\n"
                "4. Choose: single choice or multiple choice\n"
                "5. Set optional expiry time\n"
                "6. Send!\n\n"
                "**Everyone in the chat can:**\n"
                "• Vote anonymously or publicly\n"
                "• Change their vote before expiry\n"
                "• See real-time results\n\n"
                "💡 **Pro tip:** Great for group decisions — 'Where should we eat?' or 'Meeting time?'"
            ),
        },
        "stickers": {
            "keywords": ["sticker", "emoji pack", "sticker pack", "fun"],
            "response": (
                "**Using Stickers**\n\n"
                "1. Click 😊 in the message composer\n"
                "2. Browse installed packs or click **+** to get more\n"
                "3. Tap any sticker to send instantly\n\n"
                "**Managing packs:**\n"
                "• **Get new packs** — Sticker panel → Browse store → Install\n"
                "• **Reorder** — Drag packs to prioritize favorites\n"
                "• **Remove** — Long press a pack → Remove\n\n"
                "💡 **Pro tip:** Some packs are animated — they play once when sent!"
            ),
        },
        "scheduled_messages": {
            "keywords": [
                "schedule",
                "later",
                "send later",
                "delayed",
                "timed",
                "remind",
            ],
            "response": (
                "**Scheduling Messages**\n\n"
                "1. Compose your message\n"
                "2. Click the ⏰ clock icon next to send\n"
                "3. Pick date & time\n"
                "4. Confirm — message sends automatically\n\n"
                "**Manage scheduled messages:**\n"
                "• View/edit/cancel in the Scheduled panel (📅 in sidebar)\n"
                "• Messages send even if you're offline\n"
                "• Works in 1:1 and group chats\n\n"
                "💡 **Pro tip:** Perfect for birthday wishes, reminders, or crossing time zones!"
            ),
        },
        "saved_messages": {
            "keywords": ["save", "bookmark", "pin", "saved", "keep", "favorite"],
            "response": (
                "**Saved Messages** — Your personal bookmark space\n\n"
                "• **Save any message** — Hover → Bookmark icon (🔖)\n"
                "• **Access** — Click 📌 in sidebar → Saved Messages\n"
                "• **Organize** — Works like a private chat with yourself\n"
                "• **Search** — Filter saved items instantly\n\n"
                "💡 **Pro tip:** Forward important info to Saved Messages for quick reference later!"
            ),
        },
        "status_stories": {
            "keywords": [
                "status",
                "story",
                "stories",
                "temporary",
                "expire",
                "24 hours",
            ],
            "response": (
                "**Status Updates (Stories)**\n\n"
                "1. Click your avatar → **Add Status**\n"
                "2. Share text, photo, video, or voice note\n"
                "3. Choose who sees it: All contacts / Selected / Custom\n"
                "4. Expires automatically after 24 hours\n\n"
                "**Features:**\n"
                "• See who viewed your status\n"
                "• Reply privately to anyone's status\n"
                "• Add to Highlights to keep forever\n"
                "• Mute contacts' statuses you don't want to see\n\n"
                "💡 **Pro tip:** Great for quick updates — 'At the gym', 'Working on project', etc.!"
            ),
        },
        "notifications": {
            "keywords": [
                "notification",
                "alert",
                "sound",
                "mute",
                "push",
                "disturb",
                "silent",
            ],
            "response": (
                "**Notification Settings**\n\n"
                "**Global settings** (Settings → Notifications):\n"
                "• Message sounds on/off\n"
                "• Desktop push notifications\n"
                "• Vibration (mobile)\n\n"
                "**Per-chat control:**\n"
                "• Open chat → Header → Mute notifications\n"
                "• Choose: 1 hour, 8 hours, 2 days, Until turned on\n"
                "• Muted chats show a 🔕 icon\n\n"
                "**Do Not Disturb:**\n"
                "• Profile → Do Not Disturb mode\n"
                "• Set schedule (e.g., 10 PM – 7 AM)\n"
                "• Allow exceptions for favorites\n\n"
                "💡 **Pro tip:** Mute busy groups but keep mentions on!"
            ),
        },
        "privacy_settings": {
            "keywords": [
                "privacy",
                "private",
                "who can see",
                "last seen",
                "read receipt",
                "block",
            ],
            "response": (
                "**Privacy Controls** (Settings → Privacy Center)\n\n"
                "**Who can see:**\n"
                "• Last seen & online status\n"
                "• Profile photo\n"
                "• About/bio\n"
                "• Status updates\n\n"
                "**Options for each:** Everyone / My Contacts / Nobody / Custom\n\n"
                "**Other controls:**\n"
                "• Read receipts (blue checks) — toggle on/off\n"
                "• Groups — who can add you\n"
                "• Blocked contacts list\n"
                "• Fingerprint/Face ID lock for app\n\n"
                "💡 **Pro tip:** 'Nobody' for last seen = you also can't see others'!"
            ),
        },
        "profile_settings": {
            "keywords": [
                "profile",
                "avatar",
                "photo",
                "name",
                "display name",
                "username",
                "bio",
                "about",
            ],
            "response": (
                "**Editing Your Profile**\n\n"
                "1. Click your avatar → **Settings** → **Profile**\n"
                "2. **Display name** — What others see in chats\n"
                "3. **Username** — Your unique @handle for search\n"
                "4. **Profile photo** — Click to upload/crop\n"
                "5. **About** — Short bio (optional)\n\n"
                "💡 **Pro tip:** Set a username so people can find you without your phone number!"
            ),
        },
        "file_sharing": {
            "keywords": [
                "file",
                "image",
                "photo",
                "video",
                "document",
                "upload",
                "attach",
                "drag drop",
            ],
            "response": (
                "**Sharing Files & Media**\n\n"
                "**Drag & drop** or click 📎 in any chat:\n"
                "• **Images** — Auto-preview, swipe to browse multiples\n"
                "• **Videos** — Play inline, download option\n"
                "• **Documents** — PDF, DOC, TXT preview\n"
                "• **Any file** — Up to 100MB per file\n\n"
                "**Media gallery** — Click chat header → Media to see all shared files\n\n"
                "💡 **Pro tip:** Long-press an image → Save to device!"
            ),
        },
        "link_previews": {
            "keywords": ["link", "url", "preview", "website", "open graph"],
            "response": (
                "**Link Previews**\n\n"
                "Automatic! Just paste any URL in chat:\n"
                "• Article → Title, image, description\n"
                "• YouTube → Embedded player\n"
                "• Twitter/X → Tweet preview\n"
                "• GitHub → Repo info\n\n"
                "**To disable:** Settings → Privacy → Link Previews off\n\n"
                "💡 **Pro tip:** Previews load instantly — no need to leave the chat!"
            ),
        },
        "events": {
            "keywords": [
                "event",
                "meeting",
                "deadline",
                "calendar",
                "rsvp",
                "schedule event",
            ],
            "response": (
                "**Group Events** (admin only)\n\n"
                "1. Open group → 📅 Events → Create Event\n"
                "2. Title, description, date/time\n"
                "3. Optional: location, video call link\n"
                "4. Members get notified & can RSVP\n\n"
                "**Everyone sees:**\n"
                "• Upcoming events in group header\n"
                "• RSVP status: Going / Maybe / Can't go\n"
                "• Reminders 24h and 1h before\n\n"
                "💡 **Pro tip:** Add a video call link for virtual meetings!"
            ),
        },
        "highlights": {
            "keywords": ["highlight", "featured", "curate", "save status", "permanent"],
            "response": (
                "**Status Highlights**\n\n"
                "Turn temporary statuses into permanent collections:\n\n"
                "1. View your status → ⭐ Add to Highlight\n"
                "2. Create new highlight or add to existing\n"
                "3. Name it (e.g., 'Travel 2024', 'Work Projects')\n"
                "4. Appears on your profile for everyone to see\n\n"
                "💡 **Pro tip:** Great for portfolios, memories, or team updates!"
            ),
        },
        "saved_messages_search": {
            "keywords": ["search", "find", "look for", "where is", "locate"],
            "response": (
                "**Finding Things in KB-CHAT**\n\n"
                "🔍 **Global Search** (top of sidebar):\n"
                "• Search messages across all chats\n"
                "• Filter by: text, images, files, links\n"
                "• Search within a specific chat\n\n"
                "📌 **Saved Messages** — Your personal archive\n"
                "📅 **Scheduled** — Pending messages\n"
                "📞 **Calls** — Call history\n"
                "📊 **Insights** — Your chat statistics\n\n"
                "💡 **Pro tip:** Use 'from:@username' in search to find messages from someone!"
            ),
        },
        "account_security": {
            "keywords": [
                "security",
                "password",
                "2fa",
                "two factor",
                "login",
                "session",
                "device",
                "hack",
            ],
            "response": (
                "**Account Security**\n\n"
                "**Sessions** (Settings → Sessions):\n"
                "• See all logged-in devices\n"
                "• Revoke any suspicious session\n"
                "• Current session marked\n\n"
                "**Password:**\n"
                "• Change in Settings → Security\n"
                "• Use a strong, unique password\n\n"
                "**Extra protection:**\n"
                "• App lock (Fingerprint/Face ID)\n"
                "• Auto-lock timer\n\n"
                "🚨 **If compromised:**\n"
                "1. Revoke all sessions immediately\n"
                "2. Change password\n"
                "3. Check for unfamiliar devices\n\n"
                "💡 **Pro tip:** Review sessions monthly!"
            ),
        },
        "troubleshooting": {
            "keywords": [
                "not working",
                "broken",
                "error",
                "problem",
                "issue",
                "bug",
                "crash",
                "slow",
                "sync",
            ],
            "response": (
                "**Common Fixes**\n\n"
                "**Messages not sending?**\n"
                "• Check internet connection\n"
                "• Try refresh (pull down on mobile)\n"
                "• Log out → log back in\n\n"
                "**Calls failing?**\n"
                "• Grant camera/mic permissions\n"
                "• Try voice call first (less bandwidth)\n"
                "• Check firewall/VPN\n\n"
                "**Notifications not arriving?**\n"
                "• Check app notification permissions (OS settings)\n"
                "• Verify chat isn't muted\n"
                "• Check Do Not Disturb mode\n\n"
                "**Sync issues?**\n"
                "• Pull to refresh chat list\n"
                "• Log out from all devices → log in again\n\n"
                "**Still stuck?** Describe the issue and I'll help further!"
            ),
        },
        "keyboard_shortcuts": {
            "keywords": ["shortcut", "hotkey", "keyboard", "keys", "command"],
            "response": (
                "**Keyboard Shortcuts** (Desktop/Web)\n\n"
                "• **Ctrl/Cmd + N** — New chat\n"
                "• **Ctrl/Cmd + F** — Search\n"
                "• **Ctrl/Cmd + Shift + M** — Mute/unmute chat\n"
                "• **Ctrl/Cmd + ,** — Settings\n"
                "• **Ctrl/Cmd + Shift + N** — New group\n"
                "• **Esc** — Close modal/panel\n"
                "• **Arrow Up/Down** — Navigate chats\n"
                "• **Enter** — Open selected chat\n"
                "• **Shift + Enter** — New line in composer\n\n"
                "💡 **Pro tip:** Press **?** anywhere to see all shortcuts!"
            ),
        },
    }

    # Proactive tips based on context
    PROACTIVE_TIPS = [
        "💡 **Tip:** You can reply to a specific message by swiping right (mobile) or hovering → Reply (desktop). Keeps conversations organized!",
        "💡 **Tip:** Create a poll in a group to quickly decide on things — 'Where for lunch?' or 'Meeting time?'",
        "💡 **Tip:** Save important messages to 'Saved Messages' (📌 in sidebar) — it's your personal bookmark space.",
        "💡 **Tip:** Schedule messages to send later — perfect for reminders or crossing time zones (⏰ icon in composer).",
        "💡 **Tip:** Mute busy groups but keep mentions on — you'll still get notified when someone @'s you.",
        "💡 **Tip:** Press **?** anywhere to see all keyboard shortcuts. **Ctrl+N** for new chat, **Ctrl+F** to search.",
        "💡 **Tip:** Your status updates expire in 24h — add favorites to Highlights to keep them on your profile forever.",
        "💡 **Tip:** Drag & drop images/files directly into chat. Click the media gallery (chat header) to browse all shared files.",
        "💡 **Tip:** Set a username (@handle) in Profile so people can find you without your phone number.",
        "💡 **Tip:** Review active sessions monthly (Settings → Sessions) — revoke any you don't recognize.",
    ]

    def _match_topic(self, query: str) -> Optional[str]:
        """Find the best matching help topic for a user query."""
        query_lower = query.lower()
        best_match = None
        best_score = 0
        for topic, data in self.HELP_TOPICS.items():
            score = sum(1 for kw in data["keywords"] if kw in query_lower)
            if score > best_score:
                best_score = score
                best_match = topic
        return best_match if best_score > 0 else None

    def _get_greeting(self) -> str:
        import random

        greetings = [
            "Hey there! 👋 How can I help you with KB-CHAT today?",
            "Hi! 😊 What would you like to know about KB-CHAT?",
            "Hello! I'm your KB-CHAT assistant. Ask me anything!",
            "Welcome! Need help with a feature or having an issue?",
        ]
        return random.choice(greetings)

    def _get_proactive_tip(self) -> str:
        import random

        return random.choice(self.PROACTIVE_TIPS)

    def _is_greeting(self, query: str) -> bool:
        greetings = [
            "hi",
            "hello",
            "hey",
            "howdy",
            "greetings",
            "good morning",
            "good evening",
        ]
        return any(g in query.lower() for g in greetings)

    def _is_proactive_request(self, query: str) -> bool:
        keywords = [
            "tip",
            "tips",
            "suggestion",
            "suggest",
            "advice",
            "recommend",
            "what else",
            "feature",
            "discover",
            "hidden",
        ]
        return any(k in query.lower() for k in keywords)

    async def chat(
        self, messages: List[Dict[str, Any]], context: Dict[str, Any] = None
    ) -> str:
        if not messages:
            return self._get_greeting() + "\n\n" + self._get_proactive_tip()

        user_msg = messages[-1].get("content", "").strip()
        if not user_msg:
            return self._get_greeting()

        # Greeting handling
        if self._is_greeting(user_msg) and len(user_msg) < 20:
            return self._get_greeting() + "\n\n" + self._get_proactive_tip()

        # Proactive tip request
        if self._is_proactive_request(user_msg):
            tips = "\n\n".join(self.PROACTIVE_TIPS[:3])
            return f"Here are some KB-CHAT tips you might not know:\n\n{tips}"

        # Topic matching
        topic = self._match_topic(user_msg)
        if topic:
            response = self.HELP_TOPICS[topic]["response"]
            # Add a relevant proactive tip at the end
            return response + "\n\n" + self._get_proactive_tip()

        # General help
        return (
            "I'm here to help with KB-CHAT! 😊 You can ask me things like:\n\n"
            "• **'How do I create a group?'**\n"
            "• **'How do video calls work?'**\n"
            "• **'How do I mute notifications?'**\n"
            "• **'How do I change my profile photo?'**\n"
            "• **'How do polls work?'**\n"
            "• **'How do I schedule a message?'**\n"
            "• **'My messages aren't sending — help!'**\n\n"
            "Or ask for **'tips'** to discover hidden features!\n\n"
            + self._get_proactive_tip()
        )


class OpenAICompatibleProvider(AIProvider):
    """Calls any OpenAI-compatible /v1/chat/completions endpoint for service agent."""

    def __init__(self):
        self.base_url = settings.AI_BASE_URL.rstrip("/")
        self.api_key = settings.AI_API_KEY
        self.model = settings.AI_MODEL

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _chat_completion(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.6,
    ) -> str:
        url = f"{self.base_url}/chat/completions"
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=self._headers(), json=payload)
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"]

    async def chat(
        self, messages: List[Dict[str, Any]], context: Dict[str, Any] = None
    ) -> str:
        if not self.api_key:
            return await ServiceProvider().chat(messages, context)
        try:
            system = (
                "You are KB-CHAT's friendly support assistant. Help users with the app — "
                "answer how-to questions, troubleshoot issues, suggest features. "
                "Be warm, concise (2-4 sentences), and practical. "
                "If you don't know something, say so and offer to help with what you do know."
            )
            msgs = [{"role": "system", "content": system}] + messages
            return await self._chat_completion(msgs)
        except Exception as e:
            print(f"[ai] chat fallback: {e}")
            return await ServiceProvider().chat(messages, context)


def get_ai_provider() -> AIProvider:
    name = (settings.AI_PROVIDER or "mock").lower()
    if name in ("openai", "openai-compatible", "openai_compatible"):
        return OpenAICompatibleProvider()
    return ServiceProvider()
