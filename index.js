/**
 * Adalea Support Bot - final
 * Includes Express server to satisfy Render open port requirement
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

// ---------------- ENV ----------------
const BOT_TOKEN = process.env.BOT_TOKEN_1;
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN_1 environment variable.');
  process.exit(1);
}

// ---------------- EXPRESS SERVER ----------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Adalea Support Bot is online!'));
app.listen(PORT, () => console.log(`Express server running on port ${PORT}`));

// ---------------- DISCORD CLIENT ----------------
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

// ---------------- DATA FILE ----------------
const DATA_PATH = path.join(process.cwd(), 'ticketData.json');
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };
function ensureData() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2));
  else {
    try { ticketData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); } 
    catch { fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2)); }
  }
}
function saveData() { fs.writeFileSync(DATA_PATH, JSON.stringify(ticketData, null, 2)); }
ensureData();
for (const key of Object.keys(DEPARTMENTS)) if (ticketData.pausedCategories[key] === undefined) ticketData.pausedCategories[key] = false;
saveData();

// ---------------- HELPERS ----------------
async function fetchRobloxForDiscordUser(discordId) {
  try {
    const res = await fetch(`https://v3.blox.link/developer/discord/${discordId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.username) return { username: data.username, headshot: data.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${data.userId}&width=420&height=420&format=png` };
    }
    const r1 = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    if (r1.ok) { const d1 = await r1.json(); if (d1.status === 'ok') return { username: d1.username, headshot: d1.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${d1.id}&width=420&height=420&format=png` }; }
  } catch {}
  return { username: 'Unknown', headshot: 'https://cdn.discordapp.com/embed/avatars/0.png' };
}

// ---------------- EXPORT/BUILD EMBEDS ----------------
function buildSupportPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('<:verified:1406645489381806090> Adalea Support Panel')
    .setDescription(`Welcome to Adalea's Support Panel! Select the category that best fits your needs.`)
    .setImage(CONFIG.supportImage).setColor(0xFFA500);
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
    .setCustomId(`subtopic_${deptKey}`).setPlaceholder('Select a subtopic...').setMinValues(1).setMaxValues(1)
    .addOptions(dept.subtopics.map((s,i)=>({label:s,value:`${deptKey}::${i}`})));
  return new ActionRowBuilder().addComponents(menu);
}

// ---------------- TICKETS ----------------
async function createTicket(creator, deptKey, subtopicLabel) {
  const guild = client.guilds.cache.get(CONFIG.guildId); if(!guild) throw new Error('Guild not cached');
  const dept = DEPARTMENTS[deptKey];
  const channelName = `${creator.username.toLowerCase().replace(/[^a-z0-9-_]/g,'')}-${String(ticketData.ticketCounter).padStart(4,'0')}`;
  const everyone = guild.roles.everyone;
  const overwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: creator.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: dept.role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: CONFIG.roles.leadership, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: CONFIG.roles.specialUser, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  const channel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: CONFIG.ticketCategoryId, permissionOverwrites: overwrites });
  const roblox = await fetchRobloxForDiscordUser(creator.id);
  ticketData.activeTickets[channel.id] = { channelId: channel.id, creatorId: creator.id, department: deptKey, subtopic: subtopicLabel, createdAt: new Date().toISOString(), claimedBy: null };
  ticketData.ticketCounter++; saveData();
  const ping = deptKey==='leadership'?`<@&${CONFIG.roles.leadership}>`:`<@&${dept.role}>`;
  const embed = new EmbedBuilder().setTitle(`Ticket - ${dept.label}`).setDescription(`**Why did you open this ticket?**\n${subtopicLabel}\nThank you!`).addFields(
    { name:'Username', value:`${creator.tag} / ${roblox.username}`, inline:true },
    { name:'Date', value:new Date().toLocaleString(), inline:true }
  ).setThumbnail(roblox.headshot).setColor(0xFFA500).setFooter({text:`${creator.username} • ${dept.label}`});
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close with reason').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ content: ping, embeds: [embed], components: [buttons] });
  return channel;
}

// ---------------- COMPILE TRANSCRIPT ----------------
async function compileTranscript(channel) {
  const lines = [`Transcript for #${channel.name}`, `Channel ID: ${channel.id}`, `Generated: ${new Date().toLocaleString()}`, '----------------------------------------'];
  let before;
  while(true) {
    const options = { limit: 100 }; if(before) options.before = before;
    const batch = await channel.messages.fetch(options);
    if(!batch.size) break;
    const batchArr = Array.from(batch.values()).sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
    for(const m of batchArr){
      const time=new Date(m.createdTimestamp).toLocaleString();
      const author=`${m.author.tag} (${m.author.id})`;
      lines.push(`[${time}] ${author}: ${m.content}`);
      if(m.attachments.size) m.attachments.forEach(att=>lines.push(`           [attachment] ${att.url}`));
    }
    before=batchArr[0].id;
    if(batch.size<100) break;
  }
  return lines.join('\n');
}

// ---------------- CLIENT READY ----------------
client.once(Events.ClientReady, async ()=>{
  console.log(`Logged in as ${client.user.tag}`);
  // Slash commands registration
  try{
    const rest = new REST({version:'10'}).setToken(BOT_TOKEN);
    const commands=[
      { name:'add', description:'Add a user to this ticket', options:[{name:'user',description:'User to add',required:true,type:6}] },
      { name:'remove', description:'Remove a user from this ticket', options:[{name:'user',description:'User to remove',required:true,type:6}] },
      { name:'move', description:'Move ticket to another department', options:[{name:'department',description:'Department key (general/pr/sm/mod/leadership)',required:true,type:3}] }
    ];
    await rest.put(Routes.applicationGuildCommands(client.user.id,CONFIG.guildId), {body:commands});
    console.log('Slash commands registered.');
  } catch(e){ console.error('Failed to register slash commands', e); }
});

// ---------------- LOGIN ----------------
client.login(BOT_TOKEN).catch(err => { console.error('Failed to login:', err); process.exit(1); });
