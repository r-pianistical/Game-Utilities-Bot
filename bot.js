require('dotenv').config();

const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder
} = require('discord.js');
const axios = require('axios');

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  ROBLOX_API_KEY: process.env.ROBLOX_API_KEY,
  BLOXLINK_API_KEY: process.env.BLOXLINK_API_KEY,
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
  UNIVERSE_IDS: process.env.UNIVERSE_IDS ? process.env.UNIVERSE_IDS.split(',') : ["10764397084"],
  GROUP_ID: process.env.GROUP_ID,
  COMMAND_ROLES: {
    panel: ["1536706129780936776"],
    ccu: [],
    ban: ["1551246665292185610"],
    unban: ["1551246665292185610"],
    checkban: ["1551246665292185610"],
    setrank: ["1534229441142587563"]
  }
};

const RANKS = [
  { name: "Member", rank: 1 },
  { name: "Intern", rank: 96 },
  { name: "Staff", rank: 97 },
  { name: "Supervisor", rank: 98 },
  { name: "Manager", rank: 99 }
];

let deployedPanel = {
  channelId: null,
  messageId: null,
  lastPostedAt: 0
};

const IS_COMPONENTS_V2 = 32768;
const EPHEMERAL_FLAG = 64;

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
});

const robloxApi = axios.create({
  baseURL: 'https://apis.roblox.com/cloud/v2',
  headers: {
    'x-api-key': CONFIG.ROBLOX_API_KEY,
    'Content-Type': 'application/json'
  }
});

function createCardResponse({ accentColor, title, bodyContent, footerText, buttons = [], thumbnailUrl = null, isEphemeral = false }) {
  const containerComponents = [];

  if (thumbnailUrl) {
    containerComponents.push({
      type: 9,
      components: [
        {
          type: 10,
          content: `# ${title}`
        }
      ],
      accessory: {
        type: 11,
        media: { url: thumbnailUrl }
      }
    });
  } else {
    containerComponents.push({
      type: 10,
      content: `# ${title}`
    });
  }

  containerComponents.push(
    {
      type: 14,
      divider: true,
      spacing: 1
    },
    {
      type: 10,
      content: bodyContent
    }
  );

  if (footerText) {
    containerComponents.push(
      {
        type: 14,
        divider: false,
        spacing: 1
      },
      {
        type: 10,
        content: `-# ${footerText}`
      }
    );
  }

  if (buttons && buttons.length > 0) {
    containerComponents.push({
      type: 1,
      components: buttons
    });
  }

  let flags = IS_COMPONENTS_V2;
  if (isEphemeral) {
    flags |= EPHEMERAL_FLAG;
  }

  return {
    flags: flags,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: accentColor,
        components: containerComponents
      }
    ]
  };
}

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Deploy player station panel'),

  new SlashCommandBuilder()
    .setName('ccu')
    .setDescription('Check online player counts across all games'),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user across all games')
    .addStringOption(option => 
      option.setName('username')
        .setDescription('The Roblox Username or Discord User ID')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('duration_hours')
        .setDescription('Ban duration in hours'))
    .addBooleanOption(option => 
      option.setName('appealable')
        .setDescription('Is this ban appealable?'))
    .addBooleanOption(option => 
      option.setName('exclude_alts')
        .setDescription('Exclude alt account detection?')),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user across all games')
    .addStringOption(option => 
      option.setName('username')
        .setDescription('The Roblox Username or Discord User ID')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('checkban')
    .setDescription('Check user ban status across all games')
    .addStringOption(option => 
      option.setName('username')
        .setDescription('The Roblox Username or Discord User ID')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('setrank')
    .setDescription('Set user group rank')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('The Roblox Username or Discord User ID')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('rank')
        .setDescription('Select rank to assign')
        .setRequired(true)
        .addChoices(
          ...RANKS.map(r => ({ name: `${r.name} (Rank ${r.rank})`, value: r.rank }))
        ))
].map(command => command.toJSON());

function hasCommandPermission(member, commandKey) {
  const allowedRoles = CONFIG.COMMAND_ROLES[commandKey];
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!member || !member.roles) return false;
  return member.roles.cache.some(role => allowedRoles.includes(role.id));
}

async function resolveBloxlinkUser(discordId, guildId = null) {
  if (!CONFIG.BLOXLINK_API_KEY || CONFIG.BLOXLINK_API_KEY === "YOUR_BLOXLINK_API_KEY") {
    return null;
  }
  try {
    const url = guildId 
      ? `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`
      : `https://api.blox.link/v4/public/discord/${discordId}`;

    const res = await axios.get(url, {
      headers: { 'Authorization': CONFIG.BLOXLINK_API_KEY }
    });

    if (res.data && res.data.robloxID) {
      return res.data.robloxID;
    }
    if (res.data && res.data.robloxId) {
      return res.data.robloxId;
    }
    return null;
  } catch (err) {
    console.error('Bloxlink API resolution error:', err.response?.data || err.message);
    return null;
  }
}

async function getRobloxUserByQuery(input, guildId = null) {
  if (/^\d{17,20}$/.test(input.trim())) {
    const bloxlinkRobloxId = await resolveBloxlinkUser(input.trim(), guildId);
    if (bloxlinkRobloxId) {
      try {
        const userRes = await axios.get(`https://users.roblox.com/v1/users/${bloxlinkRobloxId}`);
        if (userRes.data && userRes.data.id) {
          return { id: userRes.data.id.toString(), name: userRes.data.name };
        }
      } catch (err) {
        console.error('Failed to fetch Bloxlink resolved user:', err.message);
      }
    }
  }

  try {
    const res = await axios.post('https://users.roblox.com/v1/usernames/users', {
      usernames: [input.trim()],
      excludeBannedUsers: false
    });
    if (res.data.data && res.data.data.length > 0) {
      const user = res.data.data[0];
      return { id: user.id.toString(), name: user.name };
    }
    return null;
  } catch (err) {
    console.error('Failed to resolve username:', err.message);
    return null;
  }
}

async function setRobloxGroupRank(userId, targetRank) {
  try {
    const rolesRes = await axios.get(`https://groups.roblox.com/v1/groups/${CONFIG.GROUP_ID}/roles`);
    const targetRole = rolesRes.data.roles?.find(r => r.rank === targetRank);
    
    if (!targetRole) {
      throw new Error(`Role rank ${targetRank} not found in group ${CONFIG.GROUP_ID}`);
    }

    try {
      await axios.patch(
        `https://apis.roblox.com/cloud/v2/groups/${CONFIG.GROUP_ID}/memberships/${userId}`,
        { role: `groups/${CONFIG.GROUP_ID}/roles/${targetRole.id}` },
        {
          headers: {
            'x-api-key': CONFIG.ROBLOX_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      return targetRole.name;
    } catch (openCloudErr) {
      await axios.patch(
        `https://groups.roblox.com/v1/groups/${CONFIG.GROUP_ID}/users/${userId}`,
        { roleId: targetRole.id },
        {
          headers: {
            'x-api-key': CONFIG.ROBLOX_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      return targetRole.name;
    }
  } catch (err) {
    console.error('Failed to set rank:', err.response?.data || err.message);
    throw err;
  }
}

function getModalInputValue(interaction, customId) {
  if (!interaction || !interaction.components) return null;
  for (const item of interaction.components) {
    if (item.type === 18 && item.component && item.component.custom_id === customId) {
      return item.component.value;
    }
    if (item.components) {
      for (const child of item.components) {
        if (child.custom_id === customId) {
          return child.value;
        }
      }
    }
    if (item.custom_id === customId) {
      return item.value;
    }
  }
  try {
    return interaction.fields.getTextInputValue(customId);
  } catch (err) {
    return null;
  }
}

async function fetchCCUTotals() {
  try {
    const universeParam = Array.isArray(CONFIG.UNIVERSE_IDS) ? CONFIG.UNIVERSE_IDS.join(',') : CONFIG.UNIVERSE_IDS;
    const res = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeParam}`);
    
    if (res.data && Array.isArray(res.data.data)) {
      const gamesList = res.data.data;
      let totalPlaying = 0;
      let totalVisits = 0;

      const breakdown = gamesList.map(game => {
        const playing = game.playing || 0;
        const visits = game.visits || 0;
        totalPlaying += playing;
        totalVisits += visits;
        return {
          id: game.id,
          name: game.name || `Universe ${game.id}`,
          playing,
          visits
        };
      });

      return {
        totalPlaying,
        totalVisits,
        gameCount: breakdown.length,
        games: breakdown
      };
    }
    return { totalPlaying: 0, totalVisits: 0, gameCount: 0, games: [] };
  } catch (err) {
    console.error('Failed to fetch aggregate CCU:', err.message);
    return { totalPlaying: 0, totalVisits: 0, gameCount: 0, games: [] };
  }
}

async function buildPanelPayload() {
  const ccuData = await fetchCCUTotals();
  const timestamp = Math.floor(Date.now() / 1000);

  let gameBreakdownText = "";
  if (ccuData.games.length > 1) {
    gameBreakdownText = `\n### 🎮 Individual Game Breakdown\n` +
      ccuData.games.map(g => `• **${g.name}:** \`${g.playing.toLocaleString()}\` playing • \`${g.visits.toLocaleString()}\` visits`).join('\n') + `\n`;
  }

  const statsBody = `### 📊 Network Experience Overview\n` +
                    `Live telemetry active across **${ccuData.gameCount}** experiences:\n\n` +
                    `• **Total Online Players (CCU):** \`${ccuData.totalPlaying.toLocaleString()}\` active in-game\n` +
                    `• **Total Network Visits:** \`${ccuData.totalVisits.toLocaleString()}\` visits\n` +
                    `${gameBreakdownText}\n` +
                    `Click the button below to verify your Bloxlink identity or check your ban status!`;

  const actionButtons = [
    {
      type: 2,
      style: 1,
      custom_id: "open_lookup_modal",
      label: "🔍 Check My Stats & Ban Status"
    }
  ];

  return createCardResponse({
    accentColor: 0x5865F2,
    title: "🌐 Network Live Dashboard & Player Hub",
    bodyContent: statsBody,
    footerText: `Auto-refreshes every 60s • Resends daily • Last updated <t:${timestamp}:R>`,
    buttons: actionButtons
  });
}

async function updatePanelMessage() {
  if (!deployedPanel.channelId) return;

  try {
    const channel = await client.channels.fetch(deployedPanel.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const shouldResendDaily = !deployedPanel.lastPostedAt || (now - deployedPanel.lastPostedAt >= ONE_DAY_MS);

    let message = null;
    if (deployedPanel.messageId && !shouldResendDaily) {
      message = await channel.messages.fetch(deployedPanel.messageId).catch(() => null);
    }

    const panelPayload = await buildPanelPayload();

    if (!message || shouldResendDaily) {
      if (deployedPanel.messageId) {
        const oldMsg = await channel.messages.fetch(deployedPanel.messageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }

      const freshMsg = await channel.send(panelPayload);
      deployedPanel.messageId = freshMsg.id;
      deployedPanel.lastPostedAt = now;
    } else {
      await message.edit(panelPayload);
    }
  } catch (error) {
    console.error('Error updating live panel message:', error.message);
  }
}

function buildRobloxDisplayReason(reason, durationHours, isAppealable) {
  let timeText = "permanently";
  if (durationHours) {
    const expirationDate = new Date(Date.now() + durationHours * 3600 * 1000);
    const utcString = expirationDate.toUTCString().replace("GMT", "UTC");
    timeText = `until ${utcString}`;
  }
  const appealText = isAppealable 
    ? "🎫 This ban may be appealed via a ticket."
    : "🚫 This ban is unappealable.";
  return `🔐 Our moderation team determined that your behavior violated our community rules for: ${reason} (${timeText}).\n\n${appealText}`;
}

client.once('clientReady', async () => {
  console.log(`[Logged in as ${client.user.tag}]`);
  
  const rest = new REST({ version: '10' }).setToken(CONFIG.CONFIG.DISCORD_TOKEN || CONFIG.DISCORD_TOKEN);
  try {
    console.log('Registering global slash commands...');
    await rest.put(
      Routes.applicationCommands(CONFIG.CLIENT_ID),
      { body: commands }
    );
    console.log('Successfully registered slash commands!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }

  setInterval(async () => {
    await updatePanelMessage();
  }, 60000);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === 'open_lookup_modal') {
      const linkedRobloxId = await resolveBloxlinkUser(interaction.user.id, interaction.guildId);

      await interaction.showModal({
        custom_id: 'lookup_modal',
        title: 'Player Stats & Ban Lookup',
        components: [
          {
            type: 18,
            label: "Roblox Username or Discord ID",
            description: linkedRobloxId ? "Bloxlink auto-detected! Press submit or enter another user." : "Enter Roblox username or Discord User ID",
            component: {
              type: 4,
              custom_id: "username_input",
              style: 1,
              min_length: 3,
              max_length: 30,
              placeholder: linkedRobloxId ? linkedRobloxId : "e.g. Builderman or Discord ID",
              value: linkedRobloxId ? linkedRobloxId : "",
              required: true
            }
          }
        ]
      });
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'lookup_modal') {
      try {
        const usernameInput = getModalInputValue(interaction, 'username_input');
        if (!usernameInput) {
          return interaction.reply(createCardResponse({
            accentColor: 0xED4245,
            title: "⚠️ Missing Input",
            bodyContent: "Please enter a valid Roblox username or Discord User ID to check.",
            isEphemeral: true
          }));
        }

        await interaction.deferReply({ flags: EPHEMERAL_FLAG });

        const robloxUser = await getRobloxUserByQuery(usernameInput, interaction.guildId);
        if (!robloxUser) {
          return interaction.editReply(createCardResponse({
            accentColor: 0xED4245,
            title: "🔍 User Not Found",
            bodyContent: `We couldn't resolve **${usernameInput}** to a Roblox account via Bloxlink or Roblox API.`,
            isEphemeral: true
          }));
        }

        const { id: userId, name: canonicalUsername } = robloxUser;

        const banResults = [];
        let overallBanned = false;

        for (const universeId of CONFIG.UNIVERSE_IDS) {
          try {
            const res = await robloxApi.get(`/universes/${universeId}/user-restrictions/${userId}`);
            const restriction = res.data.gameJoinRestriction;
            const isBanned = restriction && restriction.active;
            if (isBanned) overallBanned = true;

            banResults.push({
              universeId,
              isBanned,
              reason: isBanned ? (restriction.displayReason || 'No display reason provided.') : 'Clean'
            });
          } catch (err) {
            banResults.push({ universeId, isBanned: false, reason: 'Status check unavailable' });
          }
        }

        let banStatusBody = "";
        if (overallBanned) {
          banStatusBody = `⛔ **Active Bans Detected**\n` +
            banResults.map(b => `• **Universe \`${b.universeId}\`:** ${b.isBanned ? `Banned\n  > ${b.reason}` : 'Clean'}`).join('\n');
        } else {
          banStatusBody = `✅ **Clean / No Active Bans across all network games**`;
        }

        const timestamp = Math.floor(Date.now() / 1000);

        const responsePayload = createCardResponse({
          accentColor: overallBanned ? 0xED4245 : 0x57F287,
          title: `👤 Account Summary for ${canonicalUsername}`,
          bodyContent: `Here is the current network record for **${canonicalUsername}** (ID: \`${userId}\`):\n\n` +
                      `### 🛡️ Multi-Game Ban Status\n` +
                      `${banStatusBody}`,
          footerText: `Verified via Bloxlink & Roblox API • <t:${timestamp}:f>`,
          thumbnailUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`,
          isEphemeral: true
        });

        return interaction.editReply(responsePayload);
      } catch (error) {
        console.error('Modal error:', error.message);
        return interaction.editReply(createCardResponse({
          accentColor: 0xED4245,
          title: "⚠️ Something went wrong",
          bodyContent: "We hit a snag connecting to Bloxlink/Roblox API. Please try again shortly!",
          isEphemeral: true
        }));
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member } = interaction;
  if (!hasCommandPermission(member, commandName)) {
    return interaction.reply(createCardResponse({
      accentColor: 0xED4245,
      title: "⛔ Access Denied",
      bodyContent: `You don't have permission to use **/${commandName}**.`,
      isEphemeral: true
    }));
  }

  if (commandName === 'panel') {
    const initialPanelPayload = await buildPanelPayload();
    const standaloneMessage = await interaction.channel.send(initialPanelPayload);

    deployedPanel = {
      channelId: standaloneMessage.channelId,
      messageId: standaloneMessage.id,
      lastPostedAt: Date.now()
    };

    await interaction.reply({
      content: "✅ Player station panel deployed! It will auto-update every 60 seconds and re-send daily.",
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (commandName === 'ccu') {
    await interaction.deferReply();
    const ccuData = await fetchCCUTotals();
    const timestamp = Math.floor(Date.now() / 1000);

    let breakdownText = "";
    if (ccuData.games.length > 0) {
      breakdownText = `\n\n### 🕹️ Experience Breakdown\n` +
        ccuData.games.map(g => `• **${g.name}:** \`${g.playing.toLocaleString()}\` playing (${g.visits.toLocaleString()} visits)`).join('\n');
    }

    return interaction.editReply(createCardResponse({
      accentColor: 0x57F287,
      title: "🎮 Network Active Players & Visits",
      bodyContent: `There are currently **${ccuData.totalPlaying.toLocaleString()}** active players across **${ccuData.gameCount}** experiences with **${ccuData.totalVisits.toLocaleString()}** total network visits.` + breakdownText,
      footerText: `Checked at <t:${timestamp}:f>`
    }));
  }

  const targetInput = options.getString('username');
  await interaction.deferReply();

  const robloxUser = await getRobloxUserByQuery(targetInput, interaction.guildId);
  if (!robloxUser) {
    return interaction.editReply(createCardResponse({
      accentColor: 0xED4245,
      title: "🔍 User Not Found",
      bodyContent: `We couldn't find any Roblox account matching **${targetInput}** via Bloxlink or Roblox API.`
    }));
  }

  const { id: userId, name: canonicalUsername } = robloxUser;

  try {
    if (commandName === 'setrank') {
      const targetRankNum = options.getInteger('rank');
      const assignedRoleName = await setRobloxGroupRank(userId, targetRankNum);
      const timestamp = Math.floor(Date.now() / 1000);

      const userReply = createCardResponse({
        accentColor: 0x57F287,
        title: "🎖️ Rank Updated",
        bodyContent: `Successfully updated **${canonicalUsername}**'s group rank!\n\n` +
                    `• **Player:** \`${canonicalUsername}\` (ID: \`${userId}\`)\n` +
                    `• **New Rank:** **${assignedRoleName}** (Rank \`${targetRankNum}\`)\n` +
                    `• **Updated By:** <@${interaction.user.id}>`,
        footerText: `Updated at <t:${timestamp}:f>`
      });

      await interaction.editReply(userReply);

      const logChannel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logPayload = createCardResponse({
          accentColor: 0x57F287,
          title: "📋 Staff Log: Group Rank Set",
          bodyContent: `<@${interaction.user.id}> set **${canonicalUsername}** (\`${userId}\`) to **${assignedRoleName}** (Rank \`${targetRankNum}\`).`,
          footerText: `Log generated at <t:${timestamp}:f>`
        });
        await logChannel.send(logPayload);
      }
      return;
    }

    if (commandName === 'ban') {
      const reason = options.getString('reason');
      const durationHours = options.getInteger('duration_hours');
      const isAppealable = options.getBoolean('appealable') ?? true;
      const excludeAlts = options.getBoolean('exclude_alts') ?? false;

      const displayReason = buildRobloxDisplayReason(reason, durationHours, isAppealable);

      const restrictionPayload = {
        gameJoinRestriction: {
          active: true,
          duration: durationHours ? `${durationHours * 3600}s` : undefined,
          privateReason: `Banned via Discord by ${interaction.user.tag}: ${reason}`,
          displayReason: displayReason,
          excludeAltAccounts: excludeAlts
        }
      };

      for (const universeId of CONFIG.UNIVERSE_IDS) {
        await robloxApi.patch(`/universes/${universeId}/user-restrictions/${userId}`, restrictionPayload);
      }

      const timestamp = Math.floor(Date.now() / 1000);

      const userReply = createCardResponse({
        accentColor: 0xED4245,
        title: "🔨 User Network Banned",
        bodyContent: `Banned **${canonicalUsername}** across **${CONFIG.UNIVERSE_IDS.length}** experience(s).\n\n` +
                    `• **Player:** \`${canonicalUsername}\` (ID: \`${userId}\`)\n` +
                    `• **Duration:** ${durationHours ? `${durationHours} Hours` : 'Permanent'}\n` +
                    `• **Reason:** ${reason}\n` +
                    `• **Action By:** <@${interaction.user.id}>`,
        footerText: `Banned at <t:${timestamp}:f>`
      });

      await interaction.editReply(userReply);

      const logChannel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logPayload = createCardResponse({
          accentColor: 0xED4245,
          title: "📋 Staff Log: Network Ban Issued",
          bodyContent: `<@${interaction.user.id}> banned **${canonicalUsername}** (\`${userId}\`) across all experiences.\n\n` +
                      `• **Duration:** ${durationHours ? `${durationHours} Hours` : 'Permanent'}\n` +
                      `• **Reason:** ${reason}`,
          footerText: `Log generated at <t:${timestamp}:f>`
        });
        await logChannel.send(logPayload);
      }
      return;
    }

    if (commandName === 'unban') {
      for (const universeId of CONFIG.UNIVERSE_IDS) {
        await robloxApi.patch(`/universes/${universeId}/user-restrictions/${userId}`, {
          gameJoinRestriction: { active: false }
        });
      }

      const timestamp = Math.floor(Date.now() / 1000);

      const userReply = createCardResponse({
        accentColor: 0x57F287,
        title: "🔓 Ban Lifted",
        bodyContent: `Unbanned **${canonicalUsername}** across all games. They can join again!\n\n` +
                    `• **Player:** \`${canonicalUsername}\` (ID: \`${userId}\`)\n` +
                    `• **Lifted By:** <@${interaction.user.id}>`,
        footerText: `Unbanned at <t:${timestamp}:f>`
      });

      await interaction.editReply(userReply);

      const logChannel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logPayload = createCardResponse({
          accentColor: 0x57F287,
          title: "📋 Staff Log: Ban Lifted",
          bodyContent: `<@${interaction.user.id}> unbanned **${canonicalUsername}** (\`${userId}\`).`,
          footerText: `Log generated at <t:${timestamp}:f>`
        });
        await logChannel.send(logPayload);
      }
      return;
    }

    if (commandName === 'checkban') {
      const banCheckResults = [];
      let isBannedAny = false;

      for (const universeId of CONFIG.UNIVERSE_IDS) {
        try {
          const res = await robloxApi.get(`/universes/${universeId}/user-restrictions/${userId}`);
          const restriction = res.data.gameJoinRestriction;
          const active = restriction && restriction.active;
          if (active) isBannedAny = true;

          banCheckResults.push({
            universeId,
            active,
            privateReason: restriction?.privateReason || 'None',
            displayReason: restriction?.displayReason || 'None'
          });
        } catch (err) {
          banCheckResults.push({ universeId, active: false, privateReason: 'Check failed', displayReason: 'Check failed' });
        }
      }

      let bodyText = `• **Player:** \`${canonicalUsername}\` (ID: \`${userId}\`)\n` +
                     `• **Network Status:** ${isBannedAny ? "⛔ **Banned in 1+ experiences**" : "✅ **Clean / No Active Bans**"}\n\n`;

      banCheckResults.forEach(r => {
        bodyText += `### Game Universe \`${r.universeId}\`\n` +
                    `• Status: ${r.active ? "⛔ Banned" : "✅ Clean"}\n`;
        if (r.active) {
          bodyText += `> **Staff Note:** ${r.privateReason}\n` +
                      `> **Display Reason:** ${r.displayReason}\n`;
        }
      });

      const actionButtons = [
        {
          type: 2,
          style: 5,
          label: "View Roblox Profile",
          url: `https://www.roblox.com/users/${userId}/profile`
        }
      ];

      return interaction.editReply(createCardResponse({
        accentColor: isBannedAny ? 0xED4245 : 0x57F287,
        title: `🔍 Ban Status: ${canonicalUsername}`,
        bodyContent: bodyText,
        buttons: actionButtons,
        thumbnailUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`
      }));
    }

  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    return interaction.editReply(createCardResponse({
      accentColor: 0xED4245,
      title: "⚠️ Action Failed",
      bodyContent: "An error occurred while communicating with Roblox servers. Please verify your API permissions and try again."
    }));
  }
});

client.login(CONFIG.DISCORD_TOKEN);
