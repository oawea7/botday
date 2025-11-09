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
  Events,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// -------------------- CONFIG --------------------
const config = {
  guildId: '1402400197040013322',
  categories: {
    general: '1437139682361344030',
    mod: '1437120764921774132',
    pr: '1437119092745175231',
    sm: '1437120003533967370',
    leadership: '1437120465054335147'
  },
  roles: {
    pr: '1402416210779312249',
    sm: '1402416194354544753',
    mod: '1402411949593202800',
    leadership: '1402400285674049576',
    support: '1402417889826443356',
    special: '1107787991444881408'
  },
  transcriptsChannel: '1437112357787533436',
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

// -------------------- STORAGE --------------------
const dataFile = path.join('./ticketData.json');
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };
if (fs.existsSync(dataFile)) ticketData = JSON.parse(fs.readFileSync(dataFile));
function saveData() { fs.writeFileSync(dataFile, JSON.stringify(ticketData, null, 2)); }

// -------------------- HELPERS --------------------
async function getRobloxInfo(discordId) {
  try {
    const res = await fetch(`https://api.blox.link/v1/user/${discordId}`);
    const data = await res.json();
    if(data.status === "ok") return { username: data.username, headshot: data.avatarUrl };
    return { username: "Unknown", headshot: "https://cdn.discordapp.com/embed/avatars/0.png" };
  } catch { return { username: "Unknown", headshot: "https://cdn.discordapp.com/embed/avatars/0.png" }; }
}

async function createTicketChannel(user, categoryId, categoryName, subtopic, roleToPing) {
  const guild = client.guilds.cache.get(config.guildId);
  const channelName = `${user.username.toLowerCase()}-${ticketData.ticketCounter.toString().padStart(4,'0')}`;
  const everyone = guild.roles.everyone;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: config.roles.special, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(roleToPing ? [{ id: roleToPing, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
    ]
  });

  const robloxInfo = await getRobloxInfo(user.id);

  ticketData.activeTickets[channel.id] = {
    channelId: channel.id,
    creatorId: user.id,
    category: categoryName,
    subtopic: subtopic,
    claimedBy: null,
    messages: []
  };
  ticketData.ticketCounter++;
  saveData();

  const embed = new EmbedBuilder()
    .setTitle(`Ticket - ${categoryName}`)
    .setDescription(`Thank you for opening a ticket with Adalea Support! A member of the ${categoryName} team will be with you shortly.`)
    .addFields([
      { name: 'User', value: `${user.tag} / ${robloxInfo.username}` },
      { name: 'Subtopic', value: subtopic },
      { name: 'Date', value: new Date().toLocaleString() }
    ])
    .setThumbnail(robloxInfo.headshot)
    .setImage(config.supportImage)
    .setColor(0xFFA500);

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('close').setLabel('Close').setStyle(ButtonStyle.Danger)
    );

  await channel.send({ content: roleToPing ? `<@&${roleToPing}>` : null, embeds: [embed], components: [buttons] });
  return channel;
}

// -------------------- SUPPORT PANEL --------------------
client.on('messageCreate', async message => {
  if(message.author.bot) return;
  if(message.content.toLowerCase() === '!supportpanel'){
    if(![config.roles.leadership, config.roles.special].some(r => message.member.roles.cache.has(r))) return;
    await message.delete();

    const embed = new EmbedBuilder()
      .setTitle('<:verified:1406645489381806090> Adalea Support Panel')
      .setDescription(
`Welcome to Adalea's Support Panel! This channel is designed to help you connect with the right team efficiently. Please select the category that best fits your needs before opening a ticket: Staff Management, Public Relations, Moderation, General, or Leadership. Choosing the correct category ensures your request is directed to the team most capable of assisting you quickly and effectively.

Once you select a category, you will have the opportunity to provide more details about your issue so that the appropriate team can respond accurately. We value your patience, respect, and collaboration while we work to resolve your concerns. Our goal is to provide clear and timely support to everyone in the Adalea community.`
      )
      .setColor(0xFFA500)
      .setImage(config.supportImage);

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('general').setLabel('General').setEmoji(config.emojis.general).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pr').setLabel('Public Relations').setEmoji(config.emojis.pr).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sm').setLabel('Staff Management').setEmoji(config.emojis.sm).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('mod').setLabel('Moderation').setEmoji(config.emojis.mod).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('leadership').setLabel('Leadership').setEmoji(config.emojis.leadership).setStyle(ButtonStyle.Success)
      );

    await message.channel.send({ embeds: [embed], components: [buttons] });
  }
});

// -------------------- BUTTON INTERACTIONS --------------------
client.on(Events.InteractionCreate, async interaction => {
  if(interaction.isButton()){
    const id = interaction.customId;
    if(ticketData.pausedCategories[id]) return interaction.reply({ content: '<a:Zcheck:1437064263570292906> This category is paused.', ephemeral: true });

    const roleMap = {
      general: config.roles.support,
      pr: config.roles.pr,
      sm: config.roles.sm,
      mod: config.roles.mod,
      leadership: config.roles.leadership
    };

    const catMap = {
      general: 'Support Team',
      pr: 'Public Relations Team',
      sm: 'Staff Management Team',
      mod: 'Moderation Team',
      leadership: 'Leadership Team'
    };

    if(id === 'general'){
      await createTicketChannel(interaction.user, config.categories.general, catMap.general, 'General', roleMap.general);
      return interaction.reply({ content: 'Your ticket has been created!', ephemeral: true });
    } else {
      // Other categories: open dropdown for subtopics
      return interaction.reply({ content: 'Dropdown for this category coming soon', ephemeral: true });
    }
  }
});

// -------------------- LOGIN --------------------
client.login(process.env.BOT_TOKEN_1);
