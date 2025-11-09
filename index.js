import fs from 'fs';
import express from 'express';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, SelectMenuBuilder, EmbedBuilder, Events } from 'discord.js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- CONFIG ---
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

// --- CLIENT ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- TICKET DATA ---
const ticketDataPath = './ticketData.json';
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };
if (fs.existsSync(ticketDataPath)) ticketData = JSON.parse(fs.readFileSync(ticketDataPath, 'utf-8'));

function saveTicketData() {
  fs.writeFileSync(ticketDataPath, JSON.stringify(ticketData, null, 2));
}

// --- HELPERS ---
function createTicketPanelEmbed(user) {
  return new EmbedBuilder()
    .setTitle('🎫 Support Panel')
    .setDescription('Click a button below to open a ticket for your issue.')
    .setColor('#00FFFF')
    .setImage(CONFIG.supportImage);
}

function createTicketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_pr')
      .setLabel(`${CONFIG.emojis.pr} Public Relations Enquiries`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_sm')
      .setLabel(`${CONFIG.emojis.sm} Staff Enquiries`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_mod')
      .setLabel(`${CONFIG.emojis.mod} Moderation Support`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_leadership')
      .setLabel(`${CONFIG.emojis.leadership} Leadership`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_general')
      .setLabel(`${CONFIG.emojis.general} General Support`)
      .setStyle(ButtonStyle.Success)
  );
}

// --- EVENTS ---
client.on(Events.ClientReady, () => console.log(`Logged in as ${client.user.tag}`));

// Ticket button clicks
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  const { customId, user, guild } = interaction;
  if (guild.id !== CONFIG.guildId) return;

  const typeMap = {
    ticket_pr: 'pr',
    ticket_sm: 'sm',
    ticket_mod: 'mod',
    ticket_leadership: 'leadership',
    ticket_general: 'support'
  };
  const type = typeMap[customId];
  if (!type) return;

  const channel = await guild.channels.create({
    name: `ticket-${ticketData.ticketCounter}`,
    type: 0,
    parent: CONFIG.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ['ViewChannel'] },
      { id: user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] },
      { id: CONFIG.roles[type], allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
    ]
  });

  ticketData.activeTickets[channel.id] = { userId: user.id, type, createdAt: Date.now() };
  ticketData.ticketCounter++;
  saveTicketData();

  // Fetch Roblox headshot
  let headshotURL = '';
  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${CONFIG.bloxlinkGroupId}&size=150x150&format=Png`);
    const data = await res.json();
    headshotURL = data.data[0]?.imageUrl || '';
  } catch (e) { headshotURL = ''; }

  const embed = new EmbedBuilder()
    .setTitle(`${interaction.component.label} Ticket`)
    .setDescription(`Hello <@${user.id}>, a staff member will be with you shortly.`)
    .setColor('#00FFFF')
    .setThumbnail(headshotURL);

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [actionRow] });
  await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
});

// Claim / Close buttons
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  const { customId, channel, user } = interaction;
  const ticket = ticketData.activeTickets[channel.id];
  if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });

  if (customId === 'claim_ticket') {
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`<@${user.id}> has claimed your ticket.`).setColor('#00FFFF')] });
  }

  if (customId === 'close_ticket') {
    const transcriptTxt = `Ticket by <@${ticket.userId}> | Category: ${ticket.type} | Created At: ${new Date(ticket.createdAt).toLocaleString()} | Closed by: <@${user.id}>\n`;
    const transcriptFile = `ticket-${channel.id}.txt`;
    fs.writeFileSync(transcriptFile, transcriptTxt);

    const transcriptEmbed = new EmbedBuilder()
      .setTitle('Ticket Transcript')
      .setDescription(`Ticket by <@${ticket.userId}>\nCategory: ${ticket.type}\nCreated: ${new Date(ticket.createdAt).toLocaleString()}\nClosed by: <@${user.id}>`)
      .setColor('#00FFFF')
      .setFooter({ text: 'Adalea Bots' });

    const transcriptChannel = await client.channels.fetch(CONFIG.transcriptsChannelId);
    await transcriptChannel.send({ embeds: [transcriptEmbed], files: [transcriptFile] });

    delete ticketData.activeTickets[channel.id];
    saveTicketData();
    await channel.delete();
  }
});

// Prefix commands
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('?')) return;

  const args = message.content.slice(1).split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'supportpanel') {
    const embed = createTicketPanelEmbed(message.author);
    const row = createTicketButtons();
    await message.channel.send({ embeds: [embed], components: [row] });
  }

  // TODO: implement ?stopcat, ?stop, ?startcat, ?start following same logic
});

// --- DEPLOY ---
client.login(process.env.BOT_TOKEN_1);
