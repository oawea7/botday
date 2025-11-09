/**
 * Adalea Support Bot - final
 * - Uses Node 18+/22+ module import syntax
 * - Reads BOT_TOKEN_1 from environment
 * - All tickets created under one category (ID you provided earlier)
 * - Department visibility enforced by channel permission overwrites
 * - Bloxlink used for Roblox username + headshot
 * - Claim / Close (modal) / transcripts / slash commands / pause system
 *
 * Required: set environment variable BOT_TOKEN_1
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';
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
  console.error('Missing BOT_TOKEN_1 environment variable. Set it before running.');
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

// ---------------- CONFIG (from your values) ----------------
const CONFIG = {
  guildId: '1402400197040013322',
  // SINGLE category where all tickets will be created:
  ticketCategoryId: '1437139682361344030', // you provided this
  // department role IDs (who may VIEW their tickets)
  roles: {
    pr: '1402416210779312249',
    sm: '1402416194354544753',
    mod: '1402411949593202800',
    leadership: '1402400285674049576',
    support: '1402417889826443356', // general support role
    specialUser: '1107787991444881408'
  },
  // transcripts channel
  transcriptsChannelId: '1437112357787533436',
  // support image & emojis
  supportImage: 'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png',
  emojis: {
    general: '<:c_flower:1437125663231315988>',
    pr: '<:flower_yellow:1437121213796188221>',
    sm: '<:flower_pink:1437121075086622903>',
    mod: '<:flower_blue:1415086940306276424>',
    leadership: '<:flower_green:1437121005821759688>'
  },
  // Bloxlink group id (for potential rank if needed)
  bloxlinkGroupId: '250548768'
};

// mapping of UI keys to department labels & role to ping/view
const DEPARTMENTS = {
  general: { label: 'General Support', role: CONFIG.roles.support, subtopics: ['General'] },
  pr: { label: 'Public Relations', role: CONFIG.roles.pr, subtopics: ['Event Claim', 'Affiliation Enquiry'] },
  sm: { label: 'Staff Management', role: CONFIG.roles.sm, subtopics: ['Reporting a member of staff', 'Middle Rank Applications'] },
  mod: { label: 'Moderation', role: CONFIG.roles.mod, subtopics: ['Appealing a warning/mute/kick/ban'] },
  leadership: { label: 'Leadership', role: CONFIG.roles.leadership, subtopics: ['Report an Executive', 'Developer Portfolios', 'Other'] }
};

// ---------------- Data file ----------------
const DATA_PATH = path.join(process.cwd(), 'ticketData.json');
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };

function ensureData() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
  } else {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      ticketData = JSON.parse(raw);
      // ensure keys
      ticketData.ticketCounter = ticketData.ticketCounter || 1;
      ticketData.pausedCategories = ticketData.pausedCategories || {};
      ticketData.pausedSubtopics = ticketData.pausedSubtopics || {};
      ticketData.activeTickets = ticketData.activeTickets || {};
    } catch (e) {
      console.error('Failed reading ticketData.json — creating fresh file.', e);
      fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
    }
  }
}
function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
}
ensureData();

// initialize paused categories with defaults if not present
for (const key of Object.keys(DEPARTMENTS)) {
  if (ticketData.pausedCategories[key] === undefined) ticketData.pausedCategories[key] = false;
}
saveData();

// ---------------- Helpers ----------------
async function fetchRobloxForDiscordUser(discordId) {
  // Bloxlink public endpoint
  try {
    const res = await fetch(`https://v3.blox.link/developer/discord/${discordId}`);
    // Note: Some Bloxlink APIs change. Use fallback endpoint if needed:
    // const res = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    if (!res.ok) throw new Error('bloxlink fetch failed');
    const data = await res.json();
    // v3 endpoint returns linked accounts array; but we need username & headshot.
    // We'll attempt v1 if v3 response doesn't include username
    if (data && data.username) {
      return { username: data.username, headshot: data.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${data.userId}&width=420&height=420&format=png` };
    }
    // fallback to v1:
    const r1 = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    if (r1.ok) {
      const d1 = await r1.json();
      if (d1 && d1.status === 'ok') {
        return { username: d1.username, headshot: d1.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${d1.id}&width=420&height=420&format=png` };
      }
    }
  } catch (e) {
    // ignore - return unknown
  }
  return { username: 'Unknown', headshot: 'https://cdn.discordapp.com/embed/avatars/0.png' };
}

function buildSupportPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('<:verified:1406645489381806090> Adalea Support Panel')
    .setDescription(
`Welcome to Adalea's Support Panel! This channel is designed to help you connect with the right team efficiently. Please select the category that best fits your needs before opening a ticket: Staff Management, Public Relations, Moderation, General, or Leadership. Choosing the correct category ensures your request is directed to the team most capable of assisting you quickly and effectively.

Once you select a category, you will have the opportunity to provide more details about your issue so that the appropriate team can respond accurately. We value your patience, respect, and collaboration while we work to resolve your concerns. Our goal is to provide clear and timely support to everyone in the Adalea community.`
    )
    .setImage(CONFIG.supportImage)
    .setColor(0xFFA500);
  return embed;
}

// single-row buttons
function buildSupportButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_general').setLabel('General').setEmoji(CONFIG.emojis.general).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_pr').setLabel('Public Relations').setEmoji(CONFIG.emojis.pr).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_sm').setLabel('Staff Management').setEmoji(CONFIG.emojis.sm).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_mod').setLabel('Moderation').setEmoji(CONFIG.emojis.mod).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_leadership').setLabel('Leadership').setEmoji(CONFIG.emojis.leadership).setStyle(ButtonStyle.Success)
  );
  return row;
}

// build dropdown for a department's subtopics
function buildSubtopicMenu(deptKey) {
  const dept = DEPARTMENTS[deptKey];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`subtopic_${deptKey}`)
    .setPlaceholder('Select a subtopic...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(dept.subtopics.map((s, i) => ({ label: s, value: `${deptKey}::${i}` })));
  return new ActionRowBuilder().addComponents(menu);
}

// create ticket channel under single category with permission overwrites so only the creator + responsible role + leadership + special see it
async function createTicket(creator, deptKey, subtopicLabel) {
  const guild = client.guilds.cache.get(CONFIG.guildId);
  if (!guild) throw new Error('Guild not cached');

  const dept = DEPARTMENTS[deptKey];
  const channelName = `${creator.username.toLowerCase().replace(/[^a-z0-9-_]/g, '')}-${String(ticketData.ticketCounter).padStart(4, '0')}`;

  const everyone = guild.roles.everyone;

  // permission overwrites:
  // - deny everyone
  // - allow creator
  // - allow dept role
  // - allow leadership role(s)
  // - allow special user
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

  // gather roblox info:
  const roblox = await fetchRobloxForDiscordUser(creator.id);

  // store ticket
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

  // send embed + ping the department role only (leadership is not pinged unless dept is 'leadership')
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

  // notify creator ephemeral via original interaction design was ephemeral; we will rely on interaction reply
  return channel;
}

// compile transcript of channel messages and actions
async function compileTranscript(channel) {
  let all = [];
  try {
    let before;
    while (true) {
      const options = { limit: 100 };
      if (before) options.before = before;
      const msgs = await channel.messages.fetch(options);
      if (!msgs.size) break;
      msgs.forEach(m => all.push(m));
      before = all[all.length - 1].id;
      if (msgs.size < 100) break;
    }
  } catch (e) {
    // ignore
  }
  // sort ascending by createdTimestamp
  all = all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [];
  lines.push(`Ticket transcript for #${channel.name}`);
  lines.push(`Channel ID: ${channel.id}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('--------------------------');
  for (const m of all) {
    const author = `${m.author.tag} (${m.author.id})`;
    const time = new Date(m.createdTimestamp).toLocaleString();
    const content = m.content || '';
    lines.push(`[${time}] ${author}: ${content}`);
    if (m.attachments && m.attachments.size) {
      m.attachments.forEach(att => {
        lines.push(`    [attachment] ${att.url}`);
      });
    }
  }
  return lines.join('\n');
}

// ---------------- Command & Interaction registration on ready (slash commands)
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // register guild slash commands for /add /remove /move
  try {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    const commands = [
      {
        name: 'add',
        description: 'Add a user to this ticket (staff only)',
        options: [{ name: 'user', description: 'User to add', required: true, type: 6 }]
      },
      {
        name: 'remove',
        description: 'Remove a user from this ticket (staff only)',
        options: [{ name: 'user', description: 'User to remove', required: true, type: 6 }]
      },
      {
        name: 'move',
        description: 'Move ticket to another department (staff only)',
        options: [{ name: 'department', description: 'Department key (general/pr/sm/mod/leadership)', required: true, type: 3 }]
      }
    ];
    await rest.put(Routes.applicationGuildCommands(client.user.id, CONFIG.guildId), { body: commands });
    console.log('Slash commands registered.');
  } catch (e) {
    console.error('Failed to register slash commands', e);
  }
});

// ---------------- Message command: !supportpanel (LT or special user only)
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // permissioned creation of support panel
  if (content.toLowerCase() === '!supportpanel') {
    // only leadership role or special user
    const member = message.member;
    const isAllowed = member.roles.cache.has(CONFIG.roles.leadership) || message.author.id === CONFIG.roles.specialUser;
    if (!isAllowed) return;

    await message.delete().catch(() => {});
    const embed = buildSupportPanelEmbed();
    const buttons = buildSupportButtons();
    await message.channel.send({ embeds: [embed], components: [buttons] });
    return;
  }

  // pause / start category (message commands)
  // format: !stopcat{key}, !startcat{key}
  if (content.startsWith('!stopcat') || content.startsWith('!startcat') ||
      content.startsWith('!stopticket') || content.startsWith('!startticket')) {
    // only leadership or special user
    const member = message.member;
    const isAllowed = member.roles.cache.has(CONFIG.roles.leadership) || message.author.id === CONFIG.roles.specialUser;
    if (!isAllowed) return message.reply({ content: 'You do not have permission to run this.', ephemeral: true });

    if (content.startsWith('!stopcat')) {
      const key = content.slice('!stopcat'.length).trim();
      if (!DEPARTMENTS[key]) return message.reply({ content: `Unknown category key: ${key}`, ephemeral: true });
      ticketData.pausedCategories[key] = true;
      saveData();
      return message.reply(`Category ${key} paused.`);
    }
    if (content.startsWith('!startcat')) {
      const key = content.slice('!startcat'.length).trim();
      if (!DEPARTMENTS[key]) return message.reply({ content: `Unknown category key: ${key}`, ephemeral: true });
      ticketData.pausedCategories[key] = false;
      saveData();
      return message.reply(`Category ${key} started.`);
    }
    if (content.startsWith('!stopticket')) {
      const sub = content.slice('!stopticket'.length).trim();
      if (!sub) return message.reply('Provide a subtopic key.');
      ticketData.pausedSubtopics[sub] = true;
      saveData();
      return message.reply(`Subtopic ${sub} paused.`);
    }
    if (content.startsWith('!startticket')) {
      const sub = content.slice('!startticket'.length).trim();
      ticketData.pausedSubtopics[sub] = false;
      saveData();
      return message.reply(`Subtopic ${sub} started.`);
    }
  }
});

// ---------------- Interaction Create (buttons, select menus, modals, slash commands)
client.on(Events.InteractionCreate, async interaction => {
  try {
    // BUTTONS (panel buttons or ticket buttons)
    if (interaction.isButton()) {
      const cid = interaction.customId;

      // Panel buttons: panel_general, panel_pr, ...
      if (cid.startsWith('panel_')) {
        const key = cid.split('_')[1];
        if (!DEPARTMENTS[key]) return interaction.reply({ content: 'Unknown department.', ephemeral: true });
        // check paused category
        if (ticketData.pausedCategories[key]) {
          return interaction.reply({ content: '<a:Zcheck:1437064263570292906> Sorry, we are not accepting tickets for this category at this time. Try again later.', ephemeral: true });
        }
        // If department has subtopics -> show dropdown select menu
        const subs = DEPARTMENTS[key].subtopics;
        if (subs && subs.length > 1) {
          const menuRow = buildSubtopicMenu(key);
          return interaction.reply({ content: `Select a subtopic for ${DEPARTMENTS[key].label}:`, components: [menuRow], ephemeral: true });
        } else {
          // one subtopic -> create ticket immediately
          const sublabel = subs[0] || 'General';
          const ch = await createTicket(interaction.user, key, sublabel);
          return interaction.reply({ content: `Ticket created: <#${ch.id}>`, ephemeral: true });
        }
      }

      // Ticket channel buttons: ticket_claim, ticket_close
      if (cid === 'ticket_claim') {
        const channel = interaction.channel;
        const ticket = ticketData.activeTickets[channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        const member = interaction.member;
        // only users with department role, leadership or special can claim
        const dept = ticket.department;
        const deptRole = DEPARTMENTS[dept].role;
        const canClaim = member.roles.cache.has(deptRole) || member.roles.cache.has(CONFIG.roles.leadership) || interaction.user.id === CONFIG.roles.specialUser;
        if (!canClaim) return interaction.reply({ content: 'You do not have permission to claim this ticket.', ephemeral: true });

        ticket.claimedBy = interaction.user.id;
        saveData();

        // notify channel (visible to all in channel)
        const claimEmbed = new EmbedBuilder().setDescription(`**Claimed by** <@${interaction.user.id}>`).setColor(0xFFD580);
        await interaction.channel.send({ embeds: [claimEmbed] });

        // DM the ticket creator (silent message)
        try {
          const creator = await client.users.fetch(ticket.creatorId);
          const dm = new EmbedBuilder()
            .setTitle('Your ticket has been claimed')
            .setDescription(`<@${interaction.user.id}> has claimed your ticket. Please wait for their response.`)
            .setColor(0xFFA500)
            .setFooter({ text: `${interaction.user.tag}` })
            .setTimestamp();
          await creator.send({ embeds: [dm] });
        } catch (e) {
          // ignore DM failures
        }
        return interaction.reply({ content: 'Ticket claimed.', ephemeral: true });
      }

      if (cid === 'ticket_close') {
        const channel = interaction.channel;
        const ticket = ticketData.activeTickets[channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        // permission check: department role or leadership or special
        const member = interaction.member;
        const dept = ticket.department;
        const deptRole = DEPARTMENTS[dept].role;
        const canClose = member.roles.cache.has(deptRole) || member.roles.cache.has(CONFIG.roles.leadership) || interaction.user.id === CONFIG.roles.specialUser;
        if (!canClose) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

        // show modal to capture reason
        const modal = new ModalBuilder()
          .setCustomId(`close_modal::${channel.id}`)
          .setTitle('Close Ticket - Reason');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Reason for closing')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Enter the reason why this ticket is being closed.');

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }
    }

    // SUBTOPIC SELECT MENU selection
    if (interaction.isStringSelectMenu()) {
      const cid = interaction.customId;
      if (cid.startsWith('subtopic_')) {
        const val = interaction.values[0]; // e.g. "pr::0"
        const [deptKey, idxStr] = val.split('::');
        const idx = parseInt(idxStr, 10);
        const subs = DEPARTMENTS[deptKey].subtopics;
        const selected = subs[idx];
        // check subtopic pause
        const subKey = `${deptKey}::${selected}`;
        if (ticketData.pausedSubtopics[subKey]) {
          return interaction.reply({ content: '<a:Zcheck:1437064263570292906> Sorry, this subtopic is paused right now.', ephemeral: true });
        }
        // create ticket
        const ch = await createTicket(interaction.user, deptKey, selected);
        return interaction.reply({ content: `Ticket created: <#${ch.id}>`, ephemeral: true });
      }
    }

    // MODAL submit for close reason
    if (interaction.type === 5 && interaction.customId && interaction.customId.startsWith('close_modal::')) {
      const channelId = interaction.customId.split('::')[1];
      const reason = interaction.fields.getTextInputValue('close_reason');
      const ticket = ticketData.activeTickets[channelId];
      if (!ticket) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });
      // compile transcript
      const ch = await client.channels.fetch(channelId);
      const transcriptText = await compileTranscript(ch);
      // add closure metadata
      const closureInfo = `\n\n---\nClosed by: ${interaction.user.tag} (${interaction.user.id})\nReason: ${reason}\nClosed at: ${new Date().toLocaleString()}\n`;
      const finalText = transcriptText + closureInfo;

      // save transcript file locally then upload to transcripts channel
      const fname = `transcript_${ch.name}_${Date.now()}.txt`;
      const fpath = path.join(process.cwd(), fname);
      fs.writeFileSync(fpath, finalText);

      // post to transcripts channel
      try {
        const tchan = await client.channels.fetch(CONFIG.transcriptsChannelId);
        const attachment = new AttachmentBuilder(fpath);
        await tchan.send({ content: `Transcript for ${ch.name}`, files: [attachment] });
      } catch (e) {
        console.error('Failed to post transcript', e);
      }

      // DM user
      try {
        const creator = await client.users.fetch(ticket.creatorId);
        const dmEmbed = new EmbedBuilder()
          .setTitle('Your ticket has been closed')
          .setDescription(`Your ticket **${ch.name}** has been closed by <@${interaction.user.id}>.\n**Reason:** ${reason}`)
          .setColor(0xFFA500)
          .setTimestamp();
        await creator.send({ embeds: [dmEmbed] });
      } catch (e) {
        // ignore
      }

      // update ticketData: mark closed (remove activeTickets)
      delete ticketData.activeTickets[channelId];
      saveData();

      // lock channel (remove creator's view)
      try {
        await ch.permissionOverwrites.edit(ticket.creatorId, { ViewChannel: false });
        const closedEmbed = new EmbedBuilder().setDescription(`Ticket closed by <@${interaction.user.id}>`).setColor(0xFF7F7F);
        await ch.send({ embeds: [closedEmbed] });
      } catch (e) {
        console.error('Failed to lock channel', e);
      }

      // remove local file
      try { fs.unlinkSync(fpath); } catch(e){}

      return interaction.reply({ content: 'Ticket closed and transcript saved.', ephemeral: true });
    }

    // Slash Commands handling: add/remove/move
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;
      if (name === 'add' || name === 'remove') {
        // only allowed in ticket channels
        const channel = interaction.channel;
        const ticket = ticketData.activeTickets[channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        // only dept role or leadership or special can run
        const member = interaction.member;
        const deptRole = DEPARTMENTS[ticket.department].role;
        const allowed = member.roles.cache.has(deptRole) || member.roles.cache.has(CONFIG.roles.leadership) || interaction.user.id === CONFIG.roles.specialUser;
        if (!allowed) return interaction.reply({ content: 'You do not have permission.', ephemeral: true });

        const toUser = interaction.options.getUser('user');
        if (!toUser) return interaction.reply({ content: 'User required.', ephemeral: true });

        if (name === 'add') {
          await channel.permissionOverwrites.edit(toUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
          await interaction.reply({ content: `Added ${toUser.tag} to this ticket.`, ephemeral: true });
          await channel.send({ content: `${toUser} was added to the ticket by <@${interaction.user.id}>.` });
          return;
        } else {
          await channel.permissionOverwrites.edit(toUser.id, { ViewChannel: false });
          await interaction.reply({ content: `Removed ${toUser.tag} from this ticket.`, ephemeral: true });
          await channel.send({ content: `${toUser.tag} was removed from the ticket by <@${interaction.user.id}>.` });
          return;
        }
      }

      if (interaction.commandName === 'move') {
        const channel = interaction.channel;
        const ticket = ticketData.activeTickets[channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        const member = interaction.member;
        const deptRole = DEPARTMENTS[ticket.department].role;
        const allowed = member.roles.cache.has(deptRole) || member.roles.cache.has(CONFIG.roles.leadership) || interaction.user.id === CONFIG.roles.specialUser;
        if (!allowed) return interaction.reply({ content: 'You do not have permission.', ephemeral: true });

        const dest = interaction.options.getString('department');
        if (!DEPARTMENTS[dest]) return interaction.reply({ content: 'Unknown destination department key. Use general/pr/sm/mod/leadership', ephemeral: true });

        // update permission overwrites: remove old dept role, add new role
        const oldDept = ticket.department;
        const newDept = dest;
        await channel.permissionOverwrites.edit(DEPARTMENTS[oldDept].role, { ViewChannel: false });
        await channel.permissionOverwrites.edit(DEPARTMENTS[newDept].role, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

        ticket.department = newDept;
        saveData();

        await channel.send({ content: `This ticket was moved from **${DEPARTMENTS[oldDept].label}** to **${DEPARTMENTS[newDept].label}** by <@${interaction.user.id}>.` });
        return interaction.reply({ content: `Moved ticket to ${newDept}`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error('Interaction handler error:', err);
    if (interaction.replied || interaction.deferred) {
      try { await interaction.followUp({ content: 'An error occurred.', ephemeral: true }); } catch {}
    } else {
      try { await interaction.reply({ content: 'An error occurred.', ephemeral: true }); } catch {}
    }
  }
});

// ---------------- compileTranscript function used in close modal
async function compileTranscript(channel) {
  const lines = [];
  lines.push(`Transcript for #${channel.name}`);
  lines.push(`Channel ID: ${channel.id}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('----------------------------------------');

  // fetch messages (paginated)
  let before = undefined;
  while (true) {
    const options = { limit: 100 };
    if (before) options.before = before;
    const batch = await channel.messages.fetch(options);
    if (!batch.size) break;
    const batchArr = Array.from(batch.values()).sort((a,b) => a.createdTimestamp - b.createdTimestamp);
    for (const m of batchArr) {
      const time = new Date(m.createdTimestamp).toLocaleString();
      const author = `${m.author.tag} (${m.author.id})`;
      lines.push(`[${time}] ${author}: ${m.content}`);
      if (m.attachments.size) {
        m.attachments.forEach(att => lines.push(`           [attachment] ${att.url}`));
      }
    }
    before = batchArr[0].id; // next page
    if (batch.size < 100) break;
  }

  return lines.join('\n');
}

// ----------------- Login -----------------
client.login(BOT_TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
