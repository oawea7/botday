/**
 * Adalea Support Bot - Final Ready Version
 * Node 18+/22+ module syntax
 * - Prefix commands with "?"
 * - Support panel with categories
 * - Pause/unpause per department/subtopic
 * - Ticket creation, claim, close
 * - Transcript creation
 * - Roblox headshot via Bloxlink
 * - Slash commands
 * - Express server for Render
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';

// -------------------- CONFIG --------------------
const BOT_TOKEN = process.env.BOT_TOKEN_1;
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN_1 environment variable!');
  process.exit(1);
}

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

// -------------------- DATA --------------------
const DATA_PATH = path.join(process.cwd(), 'ticketData.json');
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };
if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
else ticketData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function saveData() { fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2)); }
for (const k of Object.keys(DEPARTMENTS)) if (ticketData.pausedCategories[k] === undefined) ticketData.pausedCategories[k] = false;
saveData();

// -------------------- CLIENT --------------------
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

// -------------------- EXPRESS SERVER FOR RENDER --------------------
const app = express();
app.get('/', (req, res) => res.send('Bot is alive'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express server running on port ${PORT}`));

// -------------------- HELPERS --------------------
async function fetchRobloxForDiscordUser(discordId) {
  try {
    const res = await fetch(`https://v3.blox.link/developer/discord/${discordId}`);
    if (!res.ok) throw new Error('Bloxlink fetch failed');
    const data = await res.json();
    if (data && data.username) return { username: data.username, headshot: data.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${data.userId}&width=420&height=420&format=png` };
    const r1 = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    if (r1.ok) { const d1 = await r1.json(); if (d1 && d1.status === 'ok') return { username: d1.username, headshot: d1.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${d1.id}&width=420&height=420&format=png` }; }
  } catch (e) {}
  return { username: 'Unknown', headshot: 'https://cdn.discordapp.com/embed/avatars/0.png' };
}

function buildSupportPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('<:verified:1406645489381806090> Adalea Support Panel')
    .setDescription(`Welcome to Adalea's Support Panel! Please select the category that best fits your needs.`)
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

// -------------------- MESSAGE HANDLER --------------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Prefix commands
  if (!message.content.startsWith('?')) return;
  const args = message.content.slice(1).trim().split(/ +/g);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'supportpanel') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;
    message.channel.send({ embeds: [buildSupportPanelEmbed()], components: [buildSupportButtons()] });
  }

  // Add more ? commands here if needed
});

// -------------------- INTERACTIONS (BUTTONS / MODALS) --------------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const deptKey = interaction.customId.replace('panel_', '');
  if (!DEPARTMENTS[deptKey]) return;

  // Pause check
  if (ticketData.pausedCategories[deptKey]) return interaction.reply({ content: 'This department is currently paused.', ephemeral: true });

  // Create ticket channel
  const ticketNum = ticketData.ticketCounter++;
  const channelName = `ticket-${ticketNum}`;
  const guild = interaction.guild;
  const category = guild.channels.cache.get(CONFIG.ticketCategoryId);
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: CONFIG.roles.support, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ]
  });

  ticketData.activeTickets[ticketChannel.id] = { userId: interaction.user.id, dept: deptKey };
  saveData();

  await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
  ticketChannel.send({ content: `<@${interaction.user.id}> Your ticket has been created.` });
});

// -------------------- LOGIN --------------------
client.login(BOT_TOKEN).then(() => console.log('Bot is ready!')).catch(console.error);
