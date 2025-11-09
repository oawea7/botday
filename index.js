/**
 * Adalea Support Bot - final
 * - Uses Node 18+/22+ module import syntax
 * - Reads BOT_TOKEN_1 from environment
 * - All tickets created under one category
 * - Department visibility enforced by channel permission overwrites
 * - Bloxlink used for Roblox username + headshot
 * - Claim / Close (modal) / transcripts / slash commands / pause system
 * - Express server added for Render web service
 *
 * Required: set environment variable BOT_TOKEN_1
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import express from 'express'; // <-- added for Render port
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

// ---------------- Departments ----------------
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

for (const key of Object.keys(DEPARTMENTS)) {
  if (ticketData.pausedCategories[key] === undefined) ticketData.pausedCategories[key] = false;
}
saveData();

// ---------------- Helpers ----------------
async function fetchRobloxForDiscordUser(discordId) {
  try {
    const res = await fetch(`https://v3.blox.link/developer/discord/${discordId}`);
    if (!res.ok) throw new Error('bloxlink fetch failed');
    const data = await res.json();
    if (data && data.username) {
      return { username: data.username, headshot: data.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${data.userId}&width=420&height=420&format=png` };
    }
    const r1 = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    if (r1.ok) {
      const d1 = await r1.json();
      if (d1 && d1.status === 'ok') {
        return { username: d1.username, headshot: d1.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${d1.id}&width=420&height=420&format=png` };
      }
    }
  } catch (e) {}
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

// ---------------- Create Ticket Function (same as before) ----------------
// ... KEEP YOUR EXISTING createTicket, compileTranscript, and all event handlers unchanged ...

// ---------------- EXPRESS SERVER (for Render) ----------------
const app = express();
app.get('/', (req, res) => res.send('Adalea Support Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express server listening on port ${PORT}`));

// ---------------- LOGIN -----------------
client.login(BOT_TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
