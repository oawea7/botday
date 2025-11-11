// ===================
// Adalea Tickets v2 Clone - Full Single File
// ===================

import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder, // <-- FIX: Changed from SelectMenuBuilder
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  ApplicationCommandType,
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
    GatewayIntentBits.DirectMessages, // Added for completeness
  ],
  partials: [Partials.Channel, Partials.Message],
});

const BOT_TOKEN = process.env.BOT_TOKEN_1;

// ===================
// ID CONFIGURATION
// ===================
// NOTE: These IDs look too long for standard Discord IDs (they are 18-19 chars).
// If your bot is in a server with "Community" enabled, you might be using
// the older forum/channel IDs which start with a lower number.
// **Please double-check that these IDs are correct for your server.**
const IDs = {
  // Example: 1234567890123456789 (19 characters)
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
// NOTE: Used 'value' as the key for subtopics in the select menu, 
// but it's often better to use a small, safe string (e.g., 'appeal').
// For now, keeping the original structure but it's less ideal.
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
  // Using the full subtopic value as the key is prone to issues if the value changes.
  // It's safer to use the 'label' or a separate, short 'id' property.
  // Assuming the 'value' is what you intended to use for 'sub' in your 'stop' command.
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

  const [cmd, ...args] = message.content.slice(1).toLowerCase().split(' '); // Lowercase command for consistency
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
            .setCustomId(`category_${c.name.toLowerCase().replace(/\s/g, '-')}`) // Use safe customId
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
        // Find the actual subtopic value, assuming 'sub' is the label (e.g. 'Appealing')
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
  if (interaction.isButton() && interaction.customId.startsWith('category_')) {
    // ===================
    // CATEGORY BUTTONS
    // ===================
    try {
      const rawCatName = interaction.customId.replace('category_', '');
      const catKey = Object.keys(categories).find(k => categories[k].name.toLowerCase().replace(/\s/g, '-') === rawCatName);
      
      if (!catKey) return interaction.reply({ content: 'Category not found.', ephemeral: true });
      if (isCategoryStopped(catKey)) return interaction.reply({ content: 'This category is currently stopped.', ephemeral: true });

      if (hasCooldown(interaction.user.id))
        return interaction.reply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds before opening another ticket.`, ephemeral: true });

      // Note: Cooldown applied BEFORE subtopic selection
      cooldowns[interaction.user.id] = Date.now();

      const category = categories[catKey];
      if (category.subtopics) {
        const menu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder() // <-- FIX: Changed to StringSelectMenuBuilder
            .setCustomId(`subtopic_${catKey}`)
            .setPlaceholder('Select the issue')
            .addOptions(category.subtopics.map(s => ({ label: s.label, value: s.value })))
        );
        return interaction.reply({ content: 'Please select a subtopic for your ticket.', components: [menu], ephemeral: true });
      }

      // If no subtopics, create ticket immediately
      await createTicketChannel(interaction.user, catKey, null, interaction);

    } catch (error) {
        console.error('Error in category button interaction:', error);
        if (!interaction.deferred && !interaction.replied) {
            interaction.reply({ content: 'An unexpected error occurred during ticket creation.', ephemeral: true }).catch(() => {});
        } else if (interaction.deferred) {
            interaction.editReply({ content: 'An unexpected error occurred during ticket creation.', components: [] }).catch(() => {});
        }
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('subtopic_')) {
    // ===================
    // SUBTOPIC SELECTION
    // ===================
    try {
      const catKey = interaction.customId.replace('subtopic_', '');
      const selected = interaction.values[0]; // The value is the selected subtopic description/value

      if (isSubtopicStopped(catKey, selected)) return interaction.reply({ content: 'This subtopic is currently stopped.', ephemeral: true });
      
      // The previous interaction (button click) already set the cooldown, so just create the ticket.
      await createTicketChannel(interaction.user, catKey, selected, interaction);
    } catch (error) {
        console.error('Error in subtopic selection interaction:', error);
        if (!interaction.deferred && !interaction.replied) {
            interaction.reply({ content: 'An unexpected error occurred after selecting the subtopic.', ephemeral: true }).catch(() => {});
        } else if (interaction.deferred) {
            interaction.editReply({ content: 'An unexpected error occurred after selecting the subtopic.', components: [] }).catch(() => {});
        }
    }
  }
  
  if (interaction.isChatInputCommand()) {
    // ===================
    // SLASH COMMANDS /add /remove /move
    // ===================
    const member = interaction.member;
    const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
    // FIX: Staff should also be able to use these in their own tickets
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

        // Update permissions for the new category role
        const newRole = categories[newCatKey]?.role;
        
        if (newRole) {
            // Remove old role permissions if applicable
            const oldRole = categories[oldCatKey]?.role;
            if (oldRole && oldRole !== newRole) {
                await channel.permissionOverwrites.edit(oldRole, { ViewChannel: false, SendMessages: false });
            }
            // Add new role permissions
            await channel.permissionOverwrites.edit(newRole, { ViewChannel: true, SendMessages: true });
        }
        
        await channel.setParent(targetCategory.id);
        
        // Update ticket data
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
  // FIX: Channel names must be lowercase and safe for Discord (max 100 chars)
  const safeUsername = user.username.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const name = `${categoryKey.substring(0, 3)}-${safeUsername}-t${ticketNumber}`.toLowerCase();

  try {
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...(cat.role ? [{ id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
      { id: IDs.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] } // Bot needs permissions
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
      .setFooter({ text: `Ticket ID: ${channel.id}` }); // Using channel ID as a unique identifier

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Claim').setCustomId(`claim_${channel.id}`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setLabel('Close').setCustomId(`close_${channel.id}`).setStyle(ButtonStyle.Danger)
    );

    const roleMention = cat.role ? `<@&${cat.role}>` : '@here'; // Ping the appropriate role
    await channel.send({ content: `${roleMention} | <@${user.id}>`, embeds: [embed], components: [row] });
    
    // Store ticket data
    tickets[channel.id] = { user: user.id, category: categoryKey, subtopic: subtopic || null, claimed: null, closed: false };
    saveTickets();

    // Reply to the user who opened the ticket
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `Ticket created: ${channel}`, components: [], ephemeral: true });
    } else {
      await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
    }
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    // Remove cooldown if channel creation fails
    delete cooldowns[user.id];
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Failed to create ticket channel due to a server error. Please try again later.', components: [], ephemeral: true });
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
    // FIX: If channel is already deleted, remove from storage
    delete tickets[channelId];
    saveTickets();
    return interaction.reply({ content: 'The ticket channel was not found (likely already deleted). Removed from storage.', ephemeral: true });
  }

  // Permission Check: Only staff/leadership can claim/close
  const member = interaction.member;
  const isStaffMember = isStaff(member) || member.roles.cache.has(IDs.leadership);
  
  if (action === 'claim') {
    if (!isStaffMember) return interaction.reply({ content: 'Only staff and leadership can claim tickets.', ephemeral: true });
    if (ticket.claimed) return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimed}>.`, ephemeral: true });
    
    ticket.claimed = interaction.user.id;
    saveTickets();
    await ticketChannel.send({ content: `<@${interaction.user.id}> has claimed this ticket. They will be assisting you shortly.` });
    
    // Disable the Claim button after clicking
    const newRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(interaction.message.components[0].components.find(c => c.customId.startsWith('claim'))).setDisabled(true),
        ButtonBuilder.from(interaction.message.components[0].components.find(c => c.customId.startsWith('close'))).setDisabled(false)
    );
    await interaction.message.edit({ components: [newRow] });
    
    return interaction.reply({ content: 'Ticket claimed successfully!', ephemeral: true });
  }

  if (action === 'close') {
    // Only staff/leadership, or the original ticket creator, can close it.
    if (!isStaffMember && ticket.user !== interaction.user.id) {
        return interaction.reply({ content: 'Only staff/leadership or the original ticket creator can close this ticket.', ephemeral: true });
    }

    if (ticket.closed) return interaction.reply({ content: 'This ticket is already in the process of closing.', ephemeral: true });
    ticket.closed = true;
    saveTickets();

    await interaction.deferReply({ ephemeral: true }); // Defer the reply for long operations

    try {
        // TRANSCRIPT
        let transcript = `--- Adalea Ticket Transcript ---\nTicket Creator: ${client.users.cache.get(ticket.user)?.tag || 'Unknown User'}\nCategory: ${tickets[channelId].category}\nSubtopic: ${tickets[channelId].subtopic || 'N/A'}\nClosed By: ${interaction.user.tag}\nClosed At: ${new Date().toISOString()}\n--- Conversation ---\n`;
        
        // Fetch more than 100 messages (if needed) - this is a basic implementation
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
        if (logChannel) {
            await logChannel.send({ 
                content: `Ticket Closed: **${ticketChannel.name}** | Creator: <@${ticket.user}> | Closed by: <@${interaction.user.id}>`, 
                files: [{ attachment: transcriptPath, name: `${ticketChannel.name}.txt` }] 
            });
        }
        
        fs.unlinkSync(transcriptPath); // Clean up the file
        
        // Final deletion of the channel and removal from memory
        delete tickets[channelId];
        saveTickets();
        
        // Send a private message to the ticket creator
        try {
            const creator = await client.users.fetch(ticket.user);
            await creator.send({
                content: `Your ticket, **${ticketChannel.name}**, has been closed by **${interaction.user.tag}**.\nThank you for reaching out to Adalea Support!`,
                files: logChannel ? [{ attachment: transcriptPath, name: `${ticketChannel.name}.txt` }] : []
            }).catch(() => console.log('Could not DM ticket creator.'));
        } catch (e) {
            console.error('Error sending DM to creator:', e);
        }

        await ticketChannel.delete('Ticket closed by user/staff.').catch(e => console.error('Failed to delete channel:', e));
        
        await interaction.editReply({ content: 'Ticket closed and transcript saved.', ephemeral: true });

    } catch (error) {
        console.error('Error in close action:', error);
        await interaction.editReply({ content: 'An error occurred during closing/transcript. Check console for details.', ephemeral: true });
        // Set closed back to false if the process failed before deletion
        ticket.closed = false;
        saveTickets();
    }
  }
});

// ===================
// SLASH COMMAND REGISTRATION (NEW)
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
    
    // Register slash commands globally (or per guild for faster updates)
    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.login(BOT_TOKEN);
