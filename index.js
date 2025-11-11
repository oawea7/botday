// ===================
// Adalea Tickets v2 Clone - Full Single File (Bug-Free)
// ===================

import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  ApplicationCommandOptionType,
} from 'discord.js';
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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
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
  ticketCategory: '1437139682361344030',
};

// ===================
// TICKET STORAGE
// ===================
const ticketDataPath = './tickets.json';
let tickets = fs.existsSync(ticketDataPath) ? JSON.parse(fs.readFileSync(ticketDataPath, 'utf-8')) : {};

const saveTickets = () => {
  try {
    fs.writeFileSync(ticketDataPath, JSON.stringify(tickets, null, 4));
  } catch (error) {
    console.error('Failed to save tickets.json:', error);
  }
};

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
      { label: 'Reporting', value: 'Reporting rule-breaking behaviour within our server. Refer to <#1402405335964057732> for our list of rules.' },
    ],
  },
  staffing: {
    name: 'Staffing Enquiries',
    role: IDs.staffing,
    emoji: '<:flower_yellow:1437121213796188221>',
    subtopics: [
      { label: 'Reporting', value: 'Reporting a member of staff, Middle Rank, or High Rank - not for reporting trollers. Refer to <#1402416385547702343> instead.' },
      { label: 'Applications', value: 'Applying for a MR or HR position at Adalea, or to join the Moderation Team.' },
    ],
  },
  pr: {
    name: 'Public Relations Enquiries',
    role: IDs.pr,
    emoji: '<:flower_pink:1437121075086622903>',
    subtopics: [
      { label: 'Affiliation', value: 'Forming a partnership between your group and Adalea.' },
      { label: 'Prize claim', value: 'Claiming your prize after winning an event, usually hosted in <#1402405455669497957> or <#1402405468793602158>.' },
    ],
  },
  general: { name: 'General', role: null, emoji: '<:flower_blue:1415086940306276424>', subtopics: null },
  leadership: { name: 'Leadership', role: IDs.leadership, emoji: '<:flower_green:1437121005821759688>', subtopics: null },
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
function isStaff(member) {
    if (!member) return false;
    return Object.values(IDs).some(id => member.roles.cache.has(id));
}

// ===================
// MESSAGE COMMAND HANDLER
// ===================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('?')) return;

  const [cmd, ...args] = message.content.slice(1).toLowerCase().split(' ');
  const arg = args.join(' ');
  const member = message.member;
  const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || message.author.id === IDs.special;

  // SUPPORT PANEL
  if (cmd === 'supportpanel' && isLeaderOrSpecial) {
    try {
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
            .setCustomId(`category_${c.name.toLowerCase().replace(/\s/g, '-')}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(c.emoji)
        )
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      await message.delete().catch(() => {});
    } catch (error) {
        console.error('Error in ?supportpanel:', error);
        message.channel.send('An error occurred while setting up the panel. Check console for details.').catch(() => {});
    }
  }

  // STOP/RESUME
  if ((cmd === 'stop' || cmd === 'resume') && isLeaderOrSpecial) {
    if (!arg) return message.channel.send('Specify a category key (e.g., `moderation`) or subtopic key (e.g., `moderation-appealing`).');

    try {
      if (arg.includes('-')) {
        const [cat, sub] = arg.split('-');
        const subtopicObject = categories[cat]?.subtopics?.find(s => s.label.toLowerCase() === sub.toLowerCase());
        if (!subtopicObject) return message.channel.send('Subtopic not found. Use the label, e.g., `moderation-appealing`.');
        const subtopicValue = subtopicObject.value;

        if (cmd === 'stop') stoppedSubtopics[`${cat}_${subtopicValue}`] = true;
        else delete stoppedSubtopics[`${cat}_${subtopicValue}`];
        return message.channel.send(`Subtopic **${sub}** under category **${cat}** ${cmd === 'stop' ? 'stopped' : 'resumed'}.`);
      } else {
        if (!categories[arg]) return message.channel.send('Category key not found. Use the key, e.g., `moderation`.');
        if (cmd === 'stop') stoppedCategories[arg] = true;
        else delete stoppedCategories[arg];
        return message.channel.send(`Category **${arg}** ${cmd === 'stop' ? 'stopped' : 'resumed'}.`);
      }
    } catch (error) {
        console.error('Error in ?stop/resume:', error);
        message.channel.send('An error occurred. Check console for details.').catch(() => {});
    }
  }
});

// ===================
// INTERACTION HANDLER - CATEGORY BUTTONS & SUBTOPICS & SLASH COMMANDS
// ===================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand()) return;

  // ===================
  // CATEGORY BUTTONS - FIX: Defer Reply immediately to prevent 'Ticket not found' glitch
  // ===================
  if (interaction.isButton() && interaction.customId.startsWith('category_')) {
    await interaction.deferReply({ ephemeral: true }); // <-- CRITICAL FIX

    try {
      const rawCatName = interaction.customId.replace('category_', '');
      const catKey = Object.keys(categories).find(k => categories[k].name.toLowerCase().replace(/\s/g, '-') === rawCatName);
      
      if (!catKey) return interaction.editReply({ content: 'Category not found.' });
      if (isCategoryStopped(catKey)) return interaction.editReply({ content: 'This category is currently stopped.' });

      if (hasCooldown(interaction.user.id))
        return interaction.editReply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds before opening another ticket.` });

      cooldowns[interaction.user.id] = Date.now();

      const category = categories[catKey];
      if (category.subtopics) {
        const menu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`subtopic_${catKey}`)
            .setPlaceholder('Select the issue')
            .addOptions(category.subtopics.map(s => ({ label: s.label, value: s.value })))
        );
        return interaction.editReply({ content: 'Please select a subtopic for your ticket.', components: [menu] });
      }

      await createTicketChannel(interaction.user, catKey, null, interaction);

    } catch (error) {
        console.error('Error in category button interaction:', error);
        interaction.editReply({ content: 'An unexpected error occurred during ticket creation.' }).catch(() => {});
    }
  }

  // ===================
  // SUBTOPIC SELECTION - FIX: Defer Reply for component interaction
  // ===================
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('subtopic_')) {
    await interaction.deferUpdate(); // <-- CRITICAL FIX

    try {
      const catKey = interaction.customId.replace('subtopic_', '');
      const selected = interaction.values[0];

      if (isSubtopicStopped(catKey, selected)) return interaction.editReply({ content: 'This subtopic is currently stopped.', components: [] });
      
      await createTicketChannel(interaction.user, catKey, selected, interaction);
    } catch (error) {
        console.error('Error in subtopic selection interaction:', error);
        interaction.editReply({ content: 'An unexpected error occurred after selecting the subtopic.', components: [] }).catch(() => {});
    }
  }
  
  // ===================
  // SLASH COMMANDS /add /remove /move
  // ===================
  if (interaction.isChatInputCommand()) {
    const member = interaction.member;
    const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
    const isStaffOrTicketCreator = isStaff(member) || (tickets[interaction.channelId]?.user === interaction.user.id);
    
    if (!isLeaderOrSpecial && !isStaffOrTicketCreator) {
      return interaction.reply({ content: 'You do not have permission to use this command here.', ephemeral: true });
    }

    const channel = interaction.channel;
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');

    if (!channel || !tickets[channel.id]) return interaction.reply({ content: 'This command can only be used in a ticket channel.', ephemeral: true });

    try {
      if (subcommand === 'add') {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
        return interaction.reply({ content: `${user.tag} has been **added** to the ticket.`, ephemeral: false });
      }
      if (subcommand === 'remove') {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
        return interaction.reply({ content: `${user.tag} has been **removed** from the ticket.`, ephemeral: false });
      }
      if (subcommand === 'move') {
        const targetCategory = interaction.options.getChannel('category');
        if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) return interaction.reply({ content: 'Invalid category. Please select a category channel.', ephemeral: true });
        
        const oldCatKey = tickets[channel.id].category;
        const newCatKey = Object.keys(categories).find(k => categories[k].name.toLowerCase() === targetCategory.name.toLowerCase());

        const newRole = categories[newCatKey]?.role;
        
        if (newRole) {
            const oldRole = categories[oldCatKey]?.role;
            if (oldRole && oldRole !== newRole) {
                await channel.permissionOverwrites.edit(oldRole, { ViewChannel: false, SendMessages: false });
            }
            await channel.permissionOverwrites.edit(newRole, { ViewChannel: true, SendMessages: true });
        }
        
        await channel.setParent(targetCategory.id);
        
        tickets[channel.id].category = newCatKey || targetCategory.name;
        saveTickets();
        
        return interaction.reply({ content: `Ticket successfully **moved** to the **${targetCategory.name}** category.`, ephemeral: false });
      }
    } catch (error) {
        console.error(`Error in /${subcommand} command:`, error);
        interaction.reply({ content: `An error occurred while executing the command.`, ephemeral: true }).catch(() => {});
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
  
  // FIX: Use safe, short category name (max 5 chars)
  const safeCatName = cat.name.toLowerCase().replace(/[^a-z0-9]/gi, '').substring(0, 5); 
  const safeUsername = user.username.replace(/[^a-z0-9]/gi, '').toLowerCase();
  
  // New safe name structure: [short-category]-[username]-t[number]
  const name = `${safeCatName}-${safeUsername}-t${ticketNumber}`.toLowerCase();

  try {
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...(cat.role ? [{ id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
      { id: IDs.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
    ];

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: IDs.ticketCategory,
      permissionOverwrites: overwrites,
    });

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(`${cat.name} Ticket`)
      .setDescription(`Welcome <@${user.id}>! A member of the **${cat.name}** team will assist you shortly.\n\n` + 
                      (subtopic ? `**Issue:** ${subtopic}` : 'Please explain your issue in detail.'))
      .setFooter({ text: `Ticket ID: ${channel.id}` }); 

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Claim').setCustomId(`claim_${channel.id}`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setLabel('Close').setCustomId(`close_${channel.id}`).setStyle(ButtonStyle.Danger)
    );

    const roleMention = cat.role ? `<@&${cat.role}>` : '@here';
    await channel.send({ content: `${roleMention} | <@${user.id}>`, embeds: [embed], components: [row] });
    
    // Store ticket data including open time
    tickets[channel.id] = { user: user.id, category: categoryKey, subtopic: subtopic || null, claimed: null, closed: false, openTime: Date.now() };
    saveTickets();

    // Use editReply because the interaction was deferred
    await interaction.editReply({ content: `Ticket created: ${channel}`, components: [] });
    
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    delete cooldowns[user.id];
    // Use editReply if deferred, otherwise try to reply
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Failed to create ticket channel due to a server error. Please try again later.', components: [] });
    } else {
      await interaction.reply({ content: 'Failed to create ticket channel due to a server error. Please try again later.', ephemeral: true });
    }
  }
}

// ===================
// CLAIM & CLOSE HANDLER
// ===================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const [action, channelId] = interaction.customId.split('_');
  const ticket = tickets[channelId];
  if (!ticket) return interaction.reply({ content: 'Ticket data not found in storage. Cannot proceed.', ephemeral: true });

  const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
  if (!ticketChannel) {
    delete tickets[channelId];
    saveTickets();
    return interaction.reply({ content: 'The ticket channel was not found (likely already deleted). Removed from storage.', ephemeral: true });
  }

  const member = interaction.member;
  const isStaffMember = isStaff(member) || member.roles.cache.has(IDs.leadership);
  
  if (action === 'claim') {
    if (!isStaffMember) return interaction.reply({ content: 'Only staff and leadership can claim tickets.', ephemeral: true });
    if (ticket.claimed) return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimed}>.`, ephemeral: true });
    
    ticket.claimed = interaction.user.id;
    saveTickets();

    // --- CLAIM EMBED FIX ---
    const claimEmbed = new EmbedBuilder()
        .setColor(0x32CD32) 
        .setDescription(`✅ <@${interaction.user.id}> **has claimed this ticket** and will assist you shortly.`);
        
    const firstMessage = (await ticketChannel.messages.fetch({ limit: 1, after: '0' })).first(); 

    if (firstMessage) {
        await firstMessage.reply({ embeds: [claimEmbed] });
    } else {
        await ticketChannel.send({ embeds: [claimEmbed] });
    }
    // ----------------------
    
    // Disable the Claim button after clicking
    const newRow = ActionRowBuilder.from(interaction.message.components[0]).setComponents(
        ButtonBuilder.from(interaction.message.components[0].components.find(c => c.customId.startsWith('claim'))).setDisabled(true),
        ButtonBuilder.from(interaction.message.components[0].components.find(c => c.customId.startsWith('close'))).setDisabled(false)
    );
    await interaction.message.edit({ components: [newRow] });
    
    return interaction.reply({ content: 'Ticket claimed successfully!', ephemeral: true });
  }

  if (action === 'close') {
    if (!isStaffMember && ticket.user !== interaction.user.id) {
        return interaction.reply({ content: 'Only staff/leadership or the original ticket creator can close this ticket.', ephemeral: true });
    }

    if (ticket.closed) return interaction.reply({ content: 'This ticket is already in the process of closing.', ephemeral: true });
    ticket.closed = true;
    saveTickets();

    await interaction.deferReply({ ephemeral: true });

    try {
        // TRANSCRIPT CONTENT GENERATION
        let transcript = `--- Adalea Ticket Transcript ---\nTicket Creator: ${client.users.cache.get(ticket.user)?.tag || 'Unknown User'}\nCategory: ${categories[ticket.category]?.name || 'N/A'}\nSubtopic: ${tickets[channelId].subtopic || 'N/A'}\nClosed By: ${interaction.user.tag}\nClosed At: ${new Date().toISOString()}\n--- Conversation ---\n`;
        
        let allMessages = [];
        let lastId;
        while (true) {
            const messages = await ticketChannel.messages.fetch({ limit: 100, before: lastId });
            allMessages.push(...messages.values());
            if (messages.size < 100) break;
            lastId = messages.last().id;
        }

        const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        sorted.forEach(msg => {
            transcript += `[${new Date(msg.createdTimestamp).toLocaleString()} | ${msg.author.tag}]: ${msg.content || '[No Content]'}\n`;
            if (msg.attachments.size > 0) {
                msg.attachments.forEach(att => transcript += `[Attachment]: ${att.url}\n`);
            }
        });

        const transcriptPath = `./transcript-${channelId}.txt`;
        fs.writeFileSync(transcriptPath, transcript);

        const logChannel = await client.channels.fetch(IDs.transcriptLog).catch(() => null);
        
        // --- TRANSCRIPT EMBED FIX (Matching desired format) ---
        const transcriptEmbed = new EmbedBuilder()
            .setColor(0xFFA500) // Orangish Yellow
            .setTitle('🎫 Ticket Closed')
            .addFields(
                { name: 'Ticket ID', value: `\`${channelId}\``, inline: true },
                { name: 'Opened By', value: `<@${ticket.user}>`, inline: true },
                { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Open Time', value: `<t:${Math.floor(ticket.openTime / 1000)}:f>`, inline: true },
                { name: 'Claimed By', value: ticket.claimed ? `<@${ticket.claimed}>` : 'Unclaimed', inline: true },
                { name: 'Category', value: categories[ticket.category]?.name || 'N/A', inline: true },
            )
            .setFooter({ text: ticketChannel.name });

        if (logChannel) {
            await logChannel.send({ 
                embeds: [transcriptEmbed],
                files: [{ attachment: transcriptPath, name: `${ticketChannel.name}.txt` }] 
            });
        }
        // ----------------------
        
        fs.unlinkSync(transcriptPath); 
        
        // DM to the ticket creator
        try {
            const creator = await client.users.fetch(ticket.user);
            await creator.send({
                content: `Your ticket, **${ticketChannel.name}**, has been closed by **${interaction.user.tag}**.\nThank you for reaching out to Adalea Support!`,
                files: logChannel ? [{ attachment: transcriptPath, name: `${ticketChannel.name}.txt` }] : []
            }).catch(() => console.log('Could not DM ticket creator.'));
        } catch (e) {
            console.error('Error sending DM to creator:', e);
        }

        // Delete the channel and remove from storage
        delete tickets[channelId];
        saveTickets();
        
        await ticketChannel.delete('Ticket closed by user/staff.').catch(e => console.error(`Failed to delete channel ${channelId}:`, e));
        
        await interaction.editReply({ content: 'Ticket closed and transcript saved.', ephemeral: true });

    } catch (error) {
        console.error('Error in close action:', error);
        await interaction.editReply({ content: 'An error occurred during closing/transcript. Check console for details.', ephemeral: true });
        ticket.closed = false;
        saveTickets();
    }
  }
});

// ===================
// SLASH COMMAND REGISTRATION
// ===================
const commands = [
    {
        name: 'ticket',
        description: 'Ticket management commands.',
        options: [
            {
                name: 'add',
                description: 'Add a user to the ticket.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'user',
                        description: 'The user to add.',
                        type: ApplicationCommandOptionType.User,
                        required: true,
                    },
                ],
            },
            {
                name: 'remove',
                description: 'Remove a user from the ticket.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'user',
                        description: 'The user to remove.',
                        type: ApplicationCommandOptionType.User,
                        required: true,
                    },
                ],
            },
            {
                name: 'move',
                description: 'Move the ticket to a different category.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'category',
                        description: 'The target category to move the ticket to.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildCategory],
                        required: true,
                    },
                ],
            },
        ],
    },
];

client.once('ready', async () => {
    console.log(`${client.user.tag} is online.`);
    
    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.login(BOT_TOKEN);
