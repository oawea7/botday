// ===================
// Adalea Tickets v2 Clone - Full Single File
// ===================

import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, SelectMenuBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

// ===================
// EXPRESS SETUP FOR RENDER
// ===================
const app = express();
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(process.env.PORT || 3000);

// ===================
// CLIENT SETUP
// ===================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

const BOT_TOKEN = process.env.BOT_TOKEN_1;

// ===================
// ID CONFIGURATION
// ===================
const IDs = {
  leadership: '1402400285674049576',
  special: '1107787991444881408',
  moderation: '1402411949593202800',
  staffing: '1402416194354544753',
  pr: '1402416210779312249',
  supportTeam: '1402417889826443356',
  transcriptLog: '1437112357787533436',
  ticketCategory: '1437139682361344030'
};

// ===================
// TICKET STORAGE
// ===================
const ticketDataPath = './tickets.json';
let tickets = fs.existsSync(ticketDataPath) ? JSON.parse(fs.readFileSync(ticketDataPath, 'utf-8')) : {};
const saveTickets = () => fs.writeFileSync(ticketDataPath, JSON.stringify(tickets, null, 4));

// ===================
// COOLDOWNS
// ===================
const cooldowns = {};
const COOLDOWN_SECONDS = 34;

// ===================
// STOP/RESUME STATE
// ===================
let stoppedCategories = {};
let stoppedSubtopics = {};

// ===================
// CATEGORIES & SUBTOPICS
// ===================
const categories = {
  moderation: {
    name: 'Moderation Support',
    role: IDs.moderation,
    emoji: '<:c_flower:1437125663231315988>',
    subtopics: [
      { label: 'Appealing', value: 'Appealing a warning, mute, kick, or server ban.' },
      { label: 'Reporting', value: 'Reporting rule-breaking behaviour within our server. Refer to <#1402405335964057732> for our list of rules.' }
    ]
  },
  staffing: {
    name: 'Staffing Enquiries',
    role: IDs.staffing,
    emoji: '<:flower_yellow:1437121213796188221>',
    subtopics: [
      { label: 'Reporting', value: 'Reporting a member of staff, Middle Rank, or High Rank - not for reporting trollers. Refer to <#1402416385547702343> instead.' },
      { label: 'Applications', value: 'Applying for a MR or HR position at Adalea, or to join the Moderation Team.' }
    ]
  },
  pr: {
    name: 'Public Relations Enquiries',
    role: IDs.pr,
    emoji: '<:flower_pink:1437121075086622903>',
    subtopics: [
      { label: 'Affiliation', value: 'Forming a partnership between your group and Adalea.' },
      { label: 'Prize claim', value: 'Claiming your prize after winning an event, usually hosted in <#1402405455669497957> or <#1402405468793602158>.' }
    ]
  },
  general: { name: 'General', role: null, emoji: '<:flower_blue:1415086940306276424>', subtopics: null },
  leadership: { name: 'Leadership', role: IDs.leadership, emoji: '<:flower_green:1437121005821759688>', subtopics: null }
};

// ===================
// HELPER FUNCTIONS
// ===================
function isCategoryStopped(categoryKey) {
  return stoppedCategories[categoryKey] === true;
}
function isSubtopicStopped(categoryKey, subtopic) {
  return stoppedSubtopics[`${categoryKey}_${subtopic}`] === true;
}
function hasCooldown(userId) {
  if (!cooldowns[userId]) return false;
  return Date.now() - cooldowns[userId] < COOLDOWN_SECONDS * 1000;
}

// ===================
// MESSAGE COMMAND HANDLER
// ===================
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('?')) return;

  const [cmd, ...args] = message.content.slice(1).split(' ');
  const arg = args.join(' ');
  const member = message.member;
  const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || message.author.id === IDs.special;

  // SUPPORT PANEL
  if (cmd === 'supportpanel' && isLeaderOrSpecial) {
    const existing = message.channel.messages.cache.find(m => m.author.id === client.user.id && m.embeds.length);
    if (existing) await existing.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('<:verified:1406645489381806090> **Adalea Support**')
      .setDescription("Welcome to Adalea's Support channel! Please select the category that best fits your needs before opening a ticket. The corresponding team will respond to your ticket in a timely manner. Thank you for your patience and respect!")
      .setImage('https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png');

    const row = new ActionRowBuilder().addComponents(
      Object.values(categories).map(c =>
        new ButtonBuilder()
          .setLabel(c.name)
          .setCustomId(`category_${c.name.toLowerCase()}`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(c.emoji)
      )
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  }

  // STOP/RESUME
  if ((cmd === 'stop' || cmd === 'resume') && isLeaderOrSpecial) {
    if (!arg) return message.channel.send('Specify a category or subtopic.');
    if (arg.includes('-')) {
      const [cat, sub] = arg.split('-');
      if (cmd === 'stop') stoppedSubtopics[`${cat}_${sub}`] = true;
      else delete stoppedSubtopics[`${cat}_${sub}`];
      return message.channel.send(`Subtopic ${sub} under category ${cat} ${cmd === 'stop' ? 'stopped' : 'resumed'}.`);
    } else {
      if (cmd === 'stop') stoppedCategories[arg] = true;
      else delete stoppedCategories[arg];
      return message.channel.send(`Category ${arg} ${cmd === 'stop' ? 'stopped' : 'resumed'}.`);
    }
  }
});

// ===================
// INTERACTION HANDLER - CATEGORY BUTTONS & SUBTOPICS
// ===================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() && !interaction.isSelectMenu() && !interaction.isChatInputCommand()) return;

  // ===================
  // CATEGORY BUTTONS
  // ===================
  if (interaction.isButton() && interaction.customId.startsWith('category_')) {
    const catKey = Object.keys(categories).find(k => interaction.customId === `category_${categories[k].name.toLowerCase()}`);
    if (!catKey) return interaction.reply({ content: 'Category not found.', ephemeral: true });
    if (isCategoryStopped(catKey)) return interaction.reply({ content: 'This category is currently stopped.', ephemeral: true });

    if (hasCooldown(interaction.user.id))
      return interaction.reply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds before opening another ticket.`, ephemeral: true });

    cooldowns[interaction.user.id] = Date.now();

    const category = categories[catKey];
    if (category.subtopics) {
      const menu = new ActionRowBuilder().addComponents(
        new SelectMenuBuilder()
          .setCustomId(`subtopic_${catKey}`)
          .setPlaceholder('Select the issue')
          .addOptions(category.subtopics.map(s => ({ label: s.label, value: s.value })))
      );
      return interaction.reply({ content: 'Please select a subtopic for your ticket.', components: [menu], ephemeral: true });
    }

    return createTicketChannel(interaction.user, catKey, null, interaction);
  }

  // ===================
  // SUBTOPIC SELECTION
  // ===================
  if (interaction.isSelectMenu() && interaction.customId.startsWith('subtopic_')) {
    const catKey = interaction.customId.replace('subtopic_', '');
    const selected = interaction.values[0];
    if (isSubtopicStopped(catKey, selected)) return interaction.reply({ content: 'This subtopic is currently stopped.', ephemeral: true });
    return createTicketChannel(interaction.user, catKey, selected, interaction);
  }

  // ===================
  // SLASH COMMANDS /add /remove /move
  // ===================
  if (interaction.isChatInputCommand()) {
    const member = interaction.member;
    const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
    if (!isLeaderOrSpecial) return interaction.reply({ content: 'No permission.', ephemeral: true });

    const channel = interaction.channel;
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');

    if (!channel || !tickets[channel.id]) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });

    if (subcommand === 'add') {
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
      return interaction.reply({ content: `${user.tag} added to the ticket.`, ephemeral: true });
    }
    if (subcommand === 'remove') {
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
      return interaction.reply({ content: `${user.tag} removed from the ticket.`, ephemeral: true });
    }
    if (subcommand === 'move') {
      const targetChannel = interaction.options.getChannel('channel');
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Invalid channel.', ephemeral: true });
      await targetChannel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
      return interaction.reply({ content: `${user.tag} moved to ${targetChannel}.`, ephemeral: true });
    }
  }
});

// ===================
// TICKET CREATION FUNCTION
// ===================
async function createTicketChannel(user, categoryKey, subtopic, interaction) {
  const guild = interaction.guild;
  const cat = categories[categoryKey];
  const ticketNumber = Object.keys(tickets).length + 1;
  const name = `cat-${user.username}-ticket${ticketNumber}`;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ...(cat.role ? [{ id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
    { id: IDs.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    { id: IDs.special, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
  ];

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: IDs.ticketCategory,
    permissionOverwrites: overwrites
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(`${cat.name} Ticket`)
    .setDescription(subtopic ? `**Issue:** ${subtopic}` : 'Ticket created.')
    .setFooter({ text: `Ticket for ${user.tag}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Claim').setCustomId(`claim_${channel.id}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setLabel('Close').setCustomId(`close_${channel.id}`).setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
  tickets[channel.id] = { user: user.id, category: categoryKey, subtopic: subtopic || null, claimed: null, closed: false };
  saveTickets();

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: `Ticket created: ${channel}`, components: [], ephemeral: true });
  } else {
    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  }
}

// ===================
// CLAIM & CLOSE HANDLER
// ===================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const [action, channelId] = interaction.customId.split('_');
  const ticket = tickets[channelId];
  if (!ticket) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });

  const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
  if (!ticketChannel) return interaction.reply({ content: 'Channel not found.', ephemeral: true });

  if (action === 'claim') {
    if (ticket.claimed) return interaction.reply({ content: 'Already claimed.', ephemeral: true });
    ticket.claimed = interaction.user.id;
    saveTickets();
    await ticketChannel.send({ content: `<@${interaction.user.id}> has claimed this ticket.` });
    return interaction.reply({ content: 'Ticket claimed.', ephemeral: true });
  }

  if (action === 'close') {
    if (ticket.closed) return interaction.reply({ content: 'Already closed.', ephemeral: true });
    ticket.closed = true;
    saveTickets();

    await interaction.deferUpdate();

    // TRANSCRIPT
    let transcript = '';
    const messages = await ticketChannel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    sorted.forEach(msg => {
      transcript += `[${msg.author.tag}]: ${msg.content}\n`;
      if (msg.attachments.size > 0) {
        msg.attachments.forEach(att => transcript += `Attachment: ${att.url}\n`);
      }
    });

    const transcriptPath = `./transcript-${channelId}.txt`;
    fs.writeFileSync(transcriptPath, transcript);

    const logChannel = await client.channels.fetch(IDs.transcriptLog).catch(() => null);
    if (logChannel) await logChannel.send({ content: `Ticket closed: ${ticketChannel.name}`, files: [{ attachment: transcriptPath }] });
    fs.unlinkSync(transcriptPath);

    await ticketChannel.delete().catch(() => {});
  }
});

// ===================
// BOT LOGIN
// ===================
client.once('ready', () => console.log(`${client.user.tag} is online.`));
client.login(BOT_TOKEN);