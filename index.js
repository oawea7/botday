/**
 * Adalea Support Bot - final fixed
 * All features preserved
 * Message prefix changed to ?
 * Ensures permissions, ticket creation, claim, close, transcripts work
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  PermissionFlagsBits,
  ChannelType,
  REST,
  Routes,
  AttachmentBuilder
} from 'discord.js';

const BOT_TOKEN = process.env.BOT_TOKEN_1;
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN_1 environment variable.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ---------------- CONFIG ----------------
const CONFIG = {
  guildId: '1402400197040013322',
  ticketCategoryId: '1437139682361344030',
  roles: {
    pr: '1402416210779312249',
    sm: '1402416194354544753',
    mod: '1402411949593202800',
    leadership: '1402400285674049576',
    support: '1402417889826443356',
    specialUser: '1107787991444881408'
  },
  transcriptsChannelId: '1437112357787533436',
  supportImage: 'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png',
  emojis: {
    general: '<:c_flower:1437125663231315988>',
    pr: '<:flower_yellow:1437121213796188221>',
    sm: '<:flower_pink:1437121075086622903>',
    mod: '<:flower_blue:1415086940306276424>',
    leadership: '<:flower_green:1437121005821759688>'
  },
  bloxlinkGroupId: '250548768'
};

const DEPARTMENTS = {
  general: { label: 'General Support', role: CONFIG.roles.support, subtopics: ['General'] },
  pr: { label: 'Public Relations', role: CONFIG.roles.pr, subtopics: ['Event Claim', 'Affiliation Enquiry'] },
  sm: { label: 'Staff Management', role: CONFIG.roles.sm, subtopics: ['Reporting a member of staff', 'Middle Rank Applications'] },
  mod: { label: 'Moderation', role: CONFIG.roles.mod, subtopics: ['Appealing a warning/mute/kick/ban'] },
  leadership: { label: 'Leadership', role: CONFIG.roles.leadership, subtopics: ['Report an Executive', 'Developer Portfolios', 'Other'] }
};

// ---------------- DATA ----------------
const DATA_PATH = path.join(process.cwd(), 'ticketData.json');
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };

function ensureData() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
  else {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      ticketData = JSON.parse(raw);
      ticketData.ticketCounter ||= 1;
      ticketData.pausedCategories ||= {};
      ticketData.pausedSubtopics ||= {};
      ticketData.activeTickets ||= {};
    } catch {
      fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
    }
  }
}
function saveData() { fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2)); }
ensureData();

// initialize paused categories
for (const key of Object.keys(DEPARTMENTS)) if (ticketData.pausedCategories[key] === undefined) ticketData.pausedCategories[key] = false;
saveData();

// ---------------- HELPERS ----------------
async function fetchRobloxForDiscordUser(discordId) {
  try {
    const res = await fetch(`https://v3.blox.link/developer/discord/${discordId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.username) return { username: data.username, headshot: data.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${data.userId}&width=420&height=420&format=png` };
    }
    const r1 = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    if (r1.ok) {
      const d1 = await r1.json();
      if (d1.status === 'ok') return { username: d1.username, headshot: d1.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${d1.id}&width=420&height=420&format=png` };
    }
  } catch {}
  return { username: 'Unknown', headshot: 'https://cdn.discordapp.com/embed/avatars/0.png' };
}

function buildSupportPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('<:verified:1406645489381806090> Adalea Support Panel')
    .setDescription(`Welcome to Adalea's Support Panel! This channel is designed to help you connect with the right team efficiently. Please select the category that best fits your needs before opening a ticket: Staff Management, Public Relations, Moderation, General, or Leadership. Choosing the correct category ensures your request is directed to the team most capable of assisting you quickly and effectively.

Once you select a category, you will have the opportunity to provide more details about your issue so that the appropriate team can respond accurately. We value your patience, respect, and collaboration while we work to resolve your concerns. Our goal is to provide clear and timely support to everyone in the Adalea community.`)
    .setImage(CONFIG.supportImage)
    .setColor(0xFFA500);
}

function buildSupportButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_general').setLabel('General').setEmoji(CONFIG.emojis.general).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_pr').setLabel('Public Relations').setEmoji(CONFIG.emojis.pr).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_sm').setLabel('Staff Management').setEmoji(CONFIG.emojis.sm).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_mod').setLabel('Moderation').setEmoji(CONFIG.emojis.mod).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_leadership').setLabel('Leadership').setEmoji(CONFIG.emojis.leadership).setStyle(ButtonStyle.Success)
  );
}

function buildSubtopicMenu(deptKey) {
  const dept = DEPARTMENTS[deptKey];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`subtopic_${deptKey}`)
      .setPlaceholder('Select a subtopic...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(dept.subtopics.map((s, i) => ({ label: s, value: `${deptKey}::${i}` })))
  );
}

// create ticket with proper permissions
async function createTicket(creator, deptKey, subtopicLabel) {
  const guild = client.guilds.cache.get(CONFIG.guildId);
  if (!guild) throw new Error('Guild not cached');

  const dept = DEPARTMENTS[deptKey];
  const channelName = `${creator.username.toLowerCase().replace(/[^a-z0-9-_]/g, '')}-${String(ticketData.ticketCounter).padStart(4,'0')}`;
  const everyone = guild.roles.everyone;

  const overwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: creator.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: dept.role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: CONFIG.roles.leadership, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: CONFIG.roles.specialUser, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: CONFIG.ticketCategoryId,
    permissionOverwrites: overwrites
  });

  const roblox = await fetchRobloxForDiscordUser(creator.id);

  ticketData.activeTickets[channel.id] = {
    channelId: channel.id,
    creatorId: creator.id,
    department: deptKey,
    subtopic: subtopicLabel,
    createdAt: new Date().toISOString(),
    claimedBy: null
  };
  ticketData.ticketCounter++;
  saveData();

  const ping = deptKey === 'leadership' ? `<@&${CONFIG.roles.leadership}>` : `<@&${dept.role}>`;

  const embed = new EmbedBuilder()
    .setTitle(`Ticket - ${dept.label}`)
    .setDescription(`**Why did you open this ticket?**\n${subtopicLabel}\n\nThank you for opening a ticket with Adalea Support. A member of the ${dept.label} will be with you shortly.`)
    .addFields(
      { name: 'Username', value: `${creator.tag} / ${roblox.username}`, inline: true },
      { name: 'Date', value: new Date().toLocaleString(), inline: true }
    )
    .setThumbnail(roblox.headshot)
    .setColor(0xFFA500)
    .setFooter({ text: `${creator.username} • ${dept.label}` });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close with reason').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: ping, embeds: [embed], components: [buttons] });
  return channel;
}

// compile transcript
async function compileTranscript(channel) {
  const lines = [];
  lines.push(`Transcript for #${channel.name}`);
  lines.push(`Channel ID: ${channel.id}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('----------------------------------------');

  let before;
  while (true) {
    const options = { limit: 100 };
    if (before) options.before = before;
    const batch = await channel.messages.fetch(options);
    if (!batch.size) break;
    const sorted = Array.from(batch.values()).sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
    for (const m of sorted) {
      const time = new Date(m.createdTimestamp).toLocaleString();
      const author = `${m.author.tag} (${m.author.id})`;
      lines.push(`[${time}] ${author}: ${m.content}`);
      if (m.attachments.size) m.attachments.forEach(att=>lines.push(`    [attachment] ${att.url}`));
    }
    before = sorted[0].id;
    if (batch.size < 100) break;
  }
  return lines.join('\n');
}

// ---------------- MESSAGE COMMANDS ----------------
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();

  // ?supportpanel
  if (content === '?supportpanel') {
    const member = message.member;
    const isAllowed = member.roles.cache.has(CONFIG.roles.leadership) || message.author.id === CONFIG.roles.specialUser;
    if (!isAllowed) return;

    await message.delete().catch(()=>{});
    const embed = buildSupportPanelEmbed();
    const buttons = buildSupportButtons();
    await message.channel.send({ embeds: [embed], components: [buttons] });
    return;
  }

  // pause/start category/subtopic commands
  if (content.startsWith('?stopcat') || content.startsWith('?startcat') || content.startsWith('?stopticket') || content.startsWith('?startticket')) {
    const member = message.member;
    const isAllowed = member.roles.cache.has(CONFIG.roles.leadership) || message.author.id === CONFIG.roles.specialUser;
    if (!isAllowed) return message.reply({ content: 'You do not have permission.', ephemeral: true });

    if (content.startsWith('?stopcat')) {
      const key = content.slice('?stopcat'.length).trim();
      if (!DEPARTMENTS[key]) return message.reply({ content: `Unknown category key: ${key}`, ephemeral: true });
      ticketData.pausedCategories[key] = true;
      saveData();
      return message.reply(`Category ${key} paused.`);
    }
    if (content.startsWith('?startcat')) {
      const key = content.slice('?startcat'.length).trim();
      if (!DEPARTMENTS[key]) return message.reply({ content: `Unknown category key: ${key}`, ephemeral: true });
      ticketData.pausedCategories[key] = false;
      saveData();
      return message.reply(`Category ${key} started.`);
    }
    if (content.startsWith('?stopticket')) {
      const sub = content.slice('?stopticket'.length).trim();
      if (!sub) return message.reply('Provide a subtopic key.');
      ticketData.pausedSubtopics[sub] = true;
      saveData();
      return message.reply(`Subtopic ${sub} paused.`);
    }
    if (content.startsWith('?startticket')) {
      const sub = content.slice('?startticket'.length).trim();
      ticketData.pausedSubtopics[sub] = false;
      saveData();
      return message.reply(`Subtopic ${sub} started.`);
    }
  }
});

// ---------------- INTERACTIONS (buttons, modals, select menus, slash commands) ----------------
client.on(Events.InteractionCreate, async interaction => {
  try {
    // PANEL BUTTONS
    if (interaction.isButton()) {
      const cid = interaction.customId;

      if (cid.startsWith('panel_')) {
        const key = cid.split('_')[1];
        if (!DEPARTMENTS[key]) return interaction.reply({ content: 'Unknown department.', ephemeral: true });
        if (ticketData.pausedCategories[key]) return interaction.reply({ content: '<a:Zcheck:1437064263570292906> Sorry, tickets for this category are paused.', ephemeral: true });
        const subs = DEPARTMENTS[key].subtopics;
        if (subs.length > 1) {
          const menuRow = buildSubtopicMenu(key);
          return interaction.reply({ content: `Select a subtopic for ${DEPARTMENTS[key].label}:`, components: [menuRow], ephemeral: true });
        } else {
          const sublabel = subs[0] || 'General';
          const ch = await createTicket(interaction.user, key, sublabel);
          return interaction.reply({ content: `Ticket created: <#${ch.id}>`, ephemeral: true });
        }
      }

      // TICKET BUTTONS
      if (cid === 'ticket_claim') {
        const channel = interaction.channel;
        const ticket = ticketData.activeTickets[channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        const member = interaction.member;
        const canClaim = member.roles.cache.has(DEPARTMENTS[ticket.department].role) || member.roles.cache.has(CONFIG.roles.leadership) || interaction.user.id === CONFIG.roles.specialUser;
        if (!canClaim) return interaction.reply({ content: 'You do not have permission to claim this ticket.', ephemeral: true });

        ticket.claimedBy = interaction.user.id;
        saveData();
        await channel.send({ embeds: [new EmbedBuilder().setDescription(`**Claimed by** <@${interaction.user.id}>`).setColor(0xFFD580)] });

        try {
          const creator = await client.users.fetch(ticket.creatorId);
          await creator.send({ embeds: [new EmbedBuilder().setTitle('Your ticket has been claimed').setDescription(`<@${interaction.user.id}> has claimed your ticket. Please wait for their response.`).setColor(0xFFA500).setTimestamp()] });
        } catch {}
        return interaction.reply({ content: 'Ticket claimed.', ephemeral: true });
      }

      if (cid === 'ticket_close') {
        const channel = interaction.channel;
        const ticket = ticketData.activeTickets[channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        const member = interaction.member;
        const canClose = member.roles.cache.has(DEPARTMENTS[ticket.department].role) || member.roles.cache.has(CONFIG.roles.leadership) || interaction.user.id === CONFIG.roles.specialUser;
        if (!canClose) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`close_modal::${channel.id}`).setTitle('Close Ticket - Reason');
        const reasonInput = new TextInputBuilder().setCustomId('close_reason').setLabel('Reason for closing').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Enter the reason why this ticket is being closed.');
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
      }
    }

    // SELECT MENUS
    if (interaction.isStringSelectMenu()) {
      const cid = interaction.customId;
      if (cid.startsWith('subtopic_')) {
        const [deptKey, idxStr] = interaction.values[0].split('::');
        const idx = parseInt(idxStr,10);
        const selected = DEPARTMENTS[deptKey].subtopics[idx];
        const subKey = `${deptKey}::${selected}`;
        if (ticketData.pausedSubtopics[subKey]) return interaction.reply({ content: '<a:Zcheck:1437064263570292906> Sorry, this subtopic is paused.', ephemeral: true });
        const ch = await createTicket(interaction.user, deptKey, selected);
        return interaction.reply({ content: `Ticket created: <#${ch.id}>`, ephemeral: true });
      }
    }

    // MODALS
    if (interaction.isModalSubmit()) {
      const cid = interaction.customId;
      if (cid.startsWith('close_modal::')) {
        const channelId = cid.split('::')[1];
        const ticket = ticketData.activeTickets[channelId];
        if (!ticket) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });

        const reason = interaction.fields.getTextInputValue('close_reason');
        const channel = client.channels.cache.get(channelId);
        const transcript = await compileTranscript(channel);

        const attachment = new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), { name: `transcript-${channel.name}.txt` });
        const tChannel = client.channels.cache.get(CONFIG.transcriptsChannelId);
        await tChannel.send({ content: `Ticket closed by <@${interaction.user.id}>. Reason: ${reason}`, files: [attachment] });

        try { const creator = await client.users.fetch(ticket.creatorId); await creator.send({ content: `Your ticket <#${channel.id}> has been closed. Reason: ${reason}`, files: [attachment] }); } catch {}

        await channel.delete().catch(()=>{});
        delete ticketData.activeTickets[channelId];
        saveData();
        return interaction.reply({ content: 'Ticket closed successfully.', ephemeral: true });
      }
    }

    // SLASH COMMANDS (register if needed)
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') return interaction.reply({ content: 'Pong!', ephemeral: true });
    }

  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) interaction.followUp({ content: 'Error processing interaction.', ephemeral: true });
    else interaction.reply({ content: 'Error processing interaction.', ephemeral: true });
  }
});

// ---------------- READY ----------------
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Bot is ready!');
});

client.login(BOT_TOKEN);

// ---------------- LOGIN ----------------
client.login(BOT_TOKEN).catch(err => { console.error('Failed to login:', err); process.exit(1); });
