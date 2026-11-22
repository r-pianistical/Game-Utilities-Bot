# GUB - Game Utilities Bot

A free, lightweight Node.js Discord bot built with `discord.js` v14 and **Discord Components V2** for managing Roblox group ranks, multi-universe bans, live CCU telemetry, and Bloxlink account lookups via the Roblox Open Cloud API.

---

## Features

- **Multi-Game Ban Sync (`/ban`, `/unban`, `/checkban`):** Issue temporary or permanent bans across multiple Roblox experiences simultaneously using the Open Cloud User Restrictions API, complete with alt-account detection toggles and appeal status formatting.
- **Roblox Group Ranking (`/setrank`):** Update user group ranks directly from Discord using Roblox Open Cloud Memberships API (with automatic fallback to Legacy Groups v1 API).
- **Live Network Dashboard (`/panel`):** Deploys an interactive Components V2 dashboard showing real-time active player counts (CCU) and total visits across all configured universes. Auto-refreshes every 60 seconds and reposts every 24 hours.
- **Player Self-Service Lookup:** Players can click the dashboard button to open a modal, auto-resolve their linked account via **Bloxlink**, and privately check their ban status across all network games.
- **Dual Account Resolution:** Every moderation and ranking command accepts either a **Roblox Username** or a **Discord User ID** (automatically resolved via Bloxlink v4 API).
- **Staff Audit Logging:** Automatically sends formatted Components V2 logs to a designated Discord channel whenever a ban, unban, or rank change occurs.

---

## Prerequisites

1. **Node.js** `v18.0.0` or higher.
2. **Discord Bot Application:** Created in the [Discord Developer Portal](https://discord.com/developers/applications) with `bot` and `applications.commands` scopes.
3. **Roblox Open Cloud API Key:** Created in the [Roblox Creator Hub](https://create.roblox.com/dashboard/credentials) with the following permissions:
   - `user.user-restriction:read` & `user.user-restriction:write` (for all target Universe IDs)
   - `group.membership:read` & `group.membership:write` (for your target Group ID)
4. **Bloxlink API Key (Optional):** Obtained from the [Bloxlink Developer Dashboard](https://blox.link/dashboard/user/developer) to enable Discord ID resolution.

---

## Installation

1. **Clone or download the repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-folder>
   ```

2. **Install dependencies:**
   ```bash
   npm install discord.js axios dotenv
   ```

3. **Create a `.env` file** in the root directory and configure your credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_application_client_id
   ROBLOX_API_KEY=your_roblox_open_cloud_api_key
   BLOXLINK_API_KEY=your_bloxlink_api_key
   LOG_CHANNEL_ID=your_discord_staff_log_channel_id
   UNIVERSE_IDS=10764397084,12345678901
   GROUP_ID=your_roblox_group_id
   ```
   *(Note: Separate multiple Universe IDs with commas in `UNIVERSE_IDS` without spaces.)*

4. **Configure Role Permissions & Group Ranks:**
   Open your main bot file (e.g., `index.js`) and edit `COMMAND_ROLES` and `RANKS` to match your Discord server role IDs and Roblox group hierarchy:
   ```js
   COMMAND_ROLES: {
     panel: ["ROLE_ID_HERE"],
     ccu: [], // Empty array allows everyone to use the command
     ban: ["ROLE_ID_HERE"],
     unban: ["ROLE_ID_HERE"],
     checkban: ["ROLE_ID_HERE"],
     setrank: ["ROLE_ID_HERE"]
   }
   ```
   ```js
   const RANKS = [
     { name: "Member", rank: 1 },
     { name: "Intern", rank: 96 },
     { name: "Staff", rank: 97 },
     { name: "Supervisor", rank: 98 },
     { name: "Manager", rank: 99 }
   ];
   ```

5. **Start the bot:**
   ```bash
   node index.js
   ```
   *(For 24/7 hosting, run with PM2: `pm2 start index.js --name roblox-bot`)*

---

## Commands

| Command | Description | Parameters |
| :--- | :--- | :--- |
| `/panel` | Deploys the live auto-updating network CCU & player lookup dashboard. | *None* |
| `/ccu` | Displays live concurrent player counts and total visits across all configured games. | *None* |
| `/ban` | Bans a user across all configured Roblox universes. | `username`, `reason`, `duration_hours` *(optional)*, `appealable` *(optional)*, `exclude_alts` *(optional)* |
| `/unban` | Lifts an active ban across all configured Roblox universes. | `username` |
| `/checkban` | Checks a user's active ban status, staff notes, and display reason per universe. | `username` |
| `/setrank` | Updates a user's rank in the configured Roblox group. | `username`, `rank` |

---

## Known Code Note Before Running

In your `clientReady` event handler, `CONFIG.CONFIG.DISCORD_TOKEN` will throw a `TypeError: Cannot read properties of undefined` on startup. Update that line to:
```js
const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);
```

---

## License

Free and open-source for community and studio use.
