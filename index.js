// ===================
// Adalea Tickets v2 Clone - FINAL PRODUCTION FILE (V5)
// FIXES: Subtopic menu failure, cooldown premature application, and robust category/subtopic handling.
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  // --- YOUR GUILD ID ---
  GUILD: '1402400197040013322', 
  // ---------------------
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
    key: 'moderation',
    role: IDs.moderation,
    emoji: '<:c_flower:1437125663231315988>',
    subtopics: [
      { label: 'Appealing', value: 'Appealing a warning, mute, kick, or server ban.' },
      { label: 'Reporting', value: 'Reporting rule-breaking behaviour within our server. Refer to <#1402405335964057732> for our list of rules.' },
    ],
  },
  staffing: {
    name: 'Staffing Enquiries',
    key: 'staffing',
    role: IDs.staffing,
    emoji: '<:flower_yellow:1437121213796188221>',
    subtopics: [
      { label: 'Reporting', value: 'Reporting a member of staff, Middle Rank, or High Rank - not for reporting trollers. Refer to <#1402416385547702343> instead.' },
      { label: 'Applications', value: 'Applying for a MR or HR position at Adalea, or to join the Moderation Team.' },
    ],
  },
  pr: {
    name: 'Public Relations Enquiries',
    key: 'pr',
    role: IDs.pr,
    emoji: '<:flower_pink:1437121075086622903>',
    subtopics: [
      { label: 'Affiliation', value: 'Forming a partnership between your group and Adalea.' },
      { label: 'Prize claim', value: 'Claiming your prize after winning an event, usually hosted in <#1402405455669497957> or <#1402405468793602158>.' },
    ],
  },
  general: { name: 'General', key: 'general', role: null, emoji: '<:flower_blue:1415086940306276424>', subtopics: null },
  leadership: { name: 'Leadership', key: 'leadership', role: IDs.leadership, emoji: '<:flower_green:1437121005821759688>', subtopics: null },
};

// Helper function to get a category object by its key
const getCategoryByKey = (key) => categories[key];

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
    const staffRoleIds = [IDs.moderation, IDs.staffing, IDs.pr, IDs.supportTeam].filter(id => id);
    return member.roles.cache.some(role => staffRoleIds.includes(role.id));
}

// ===================
// MESSAGE COMMAND HANDLER (?commands for setup/management)
// ===================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('?')) return;

  const [cmd, ...args] = message.content.slice(1).toLowerCase().split(' ');
  const arg = args.join(' ');
  const member = message.member;
  const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || message.author.id === IDs.special;

  // SUPPORT PANEL SETUP
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

  // STOP/RESUME CATEGORIES/SUBTOPICS
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

// =========================================================================================
// INTERACTION HANDLER - CATEGORY BUTTONS, SUBTOPICS, MODAL SUBMISSIONS, SLASH COMMANDS, etc.
// =========================================================================================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

  // ===================
  // 1. CATEGORY BUTTONS (Initial Ticket Request)
  // ===================
  if (interaction.isButton() && interaction.customId.startsWith('category_')) {
    // Crucial: Defer the reply immediately to prevent "Interaction Failed"
    await interaction.deferReply({ ephemeral: true });

    try {
      const rawCatName = interaction.customId.replace('category_', '');
      const catKey = Object.keys(categories).find(k => categories[k].name.toLowerCase().replace(/\s/g, '-') === rawCatName);
      
      if (!catKey) return interaction.editReply({ content: 'Category not found.' });
      if (isCategoryStopped(catKey)) return interaction.editReply({ content: 'This category is currently stopped.' });

      const category = categories[catKey];
      
      // If subtopics exist, show the select menu
      if (category.subtopics) {
        // We only apply cooldown AFTER a final selection/creation is made
        const menu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`subtopic_${catKey}`)
            .setPlaceholder('Select the issue')
            .addOptions(category.subtopics.map(s => ({ label: s.label, value: s.value })))
        );
        // Use followUp if deferReply was used, or editReply if that was the last action
        return interaction.editReply({ content: 'Please select a subtopic for your ticket.', components: [menu] });
      }

      // If no subtopics (General/Leadership), apply cooldown and create ticket immediately
      if (hasCooldown(interaction.user.id))
        return interaction.editReply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds before opening another ticket.` });

      cooldowns[interaction.user.id] = Date.now();
      await createTicketChannel(interaction.user, catKey, null, interaction);

    } catch (error) {
        console.error('Error in category button interaction:', error);
        interaction.editReply({ content: 'An unexpected error occurred during ticket creation. (Check bot permissions and category key in config.)' }).catch(() => {});
    }
  }

  // ===================
  // 2. SUBTOPIC SELECTION
  // ===================
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('subtopic_')) {
    // Use deferUpdate because we are editing the previous deferred reply
    await interaction.deferUpdate();

    try {
      const catKey = interaction.customId.replace('subtopic_', '');
      const selected = interaction.values[0];

      if (isSubtopicStopped(catKey, selected)) return interaction.editReply({ content: 'This subtopic is currently stopped.', components: [] });
      
      // Apply cooldown and create ticket now that the final selection is made
      if (hasCooldown(interaction.user.id))
        return interaction.editReply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds before opening another ticket.`, components: [] });

      cooldowns[interaction.user.id] = Date.now();
      await createTicketChannel(interaction.user, catKey, selected, interaction);
    } catch (error) {
        console.error('Error in subtopic selection interaction:', error);
        interaction.editReply({ content: 'An unexpected error occurred after selecting the subtopic.', components: [] }).catch(() => {});
    }
  }
  
  // ===================
  // 3. CLAIM & CLOSE BUTTONS (Inside Ticket Channel)
  // ===================
  if (interaction.isButton() && (interaction.customId.startsWith('claim_') || interaction.customId.startsWith('close_'))) {
    
    const [action, channelId] = interaction.customId.split('_');
    const ticket = tickets[channelId];
    
    // Check for "Ticket data not found" error
    if (!ticket) return interaction.reply({ content: 'Ticket data not found in storage. Cannot proceed.', ephemeral: true });

    const ticketChannel = interaction.guild.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!ticketChannel) {
        delete tickets[channelId];
        saveTickets();
        return interaction.reply({ content: 'The ticket channel was not found (likely already deleted). Removed from storage.', ephemeral: true });
    }

    const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isLeaderOrSpecial = member?.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
    const isStaffMember = isStaff(member) || isLeaderOrSpecial;

    if (action === 'claim') {
        if (!isStaffMember) return interaction.reply({ content: 'Only staff and leadership can claim tickets.', ephemeral: true });
        if (ticket.claimed) return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimed}>.`, ephemeral: true });
        
        ticket.claimed = interaction.user.id;
        saveTickets();

        const claimEmbed = new EmbedBuilder()
            .setColor(0x32CD32) 
            .setDescription(`✅ <@${interaction.user.id}> **has claimed this ticket** and will assist you shortly.`);
            
        const firstMessage = (await ticketChannel.messages.fetch({ limit: 1, after: '0' })).first(); 

        if (firstMessage) {
            await firstMessage.reply({ embeds: [claimEmbed] });
        } else {
            await ticketChannel.send({ embeds: [claimEmbed] });
        }
        
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

        // Show Modal for Reason Input
        const modal = new ModalBuilder()
            .setCustomId(`close_modal_${channelId}`)
            .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason')
            .setLabel('Reason for closing this ticket')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
    }
  }

  // ===================
  // 4. MODAL SUBMISSION (Ticket Close Confirmation)
  // ===================
  if (interaction.isModalSubmit() && interaction.customId.startsWith('close_modal_')) {
    const channelId = interaction.customId.replace('close_modal_', '');
    const reason = interaction.fields.getTextInputValue('close_reason');
    const ticket = tickets[channelId];

    if (!ticket) return interaction.reply({ content: 'Ticket data not found in storage. Cannot proceed.', ephemeral: true });
    if (ticket.closed) return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });
    
    ticket.closed = true;
    saveTickets();

    await interaction.deferReply({ ephemeral: true });

    const ticketChannel = interaction.guild.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);

    try {
        // --- TRANSCRIPT GENERATION ---
        let transcript = `--- Adalea Ticket Transcript ---\nTicket Creator: ${client.users.cache.get(ticket.user)?.tag || 'Unknown User'}\nCategory: ${categories[ticket.category]?.name || 'N/A'}\nSubtopic: ${tickets[channelId].subtopic || 'N/A'}\nClosed By: ${interaction.user.tag}\nClosed At: ${new Date().toISOString()}\nReason: ${reason}\n--- Conversation ---\n`;
        
        let allMessages = [];
        let lastId;
        while (true) {
            const messages = await ticketChannel.messages.fetch({ limit: 100, before: lastId });
            allMessages.push(...messages.values());
            if (messages.size < 100) break;
            lastId = messages.last()?.id;
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
        
        // --- FINAL TRANSCRIPT EMBED ---
        const transcriptEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('🎫 Ticket Closed')
            .addFields(
                { name: 'Ticket ID', value: `\`${channelId}\``, inline: true },
                { name: 'Opened By', value: `<@${ticket.user}>`, inline: true },
                { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Open Time', value: `<t:${Math.floor(ticket.openTime / 1000)}:f>`, inline: true },
                { name: 'Claimed By', value: ticket.claimed ? `<@${ticket.claimed}>` : 'Unclaimed', inline: true },
                { name: 'Category', value: categories[ticket.category]?.name || 'N/A', inline: true },
                { name: 'Reason', value: reason || 'N/A', inline: false }
            )
            .setFooter({ text: ticketChannel.name });

        if (logChannel) {
            await logChannel.send({ 
                embeds: [transcriptEmbed],
                files: [{ attachment: transcriptPath, name: `${ticketChannel.name}.txt` }] 
            }).catch(e => console.error('Failed to send log message:', e));
        }
        
        fs.unlinkSync(transcriptPath); 
        
        // DM to the ticket creator
        try {
            const creator = await client.users.fetch(ticket.user);
            await creator.send({
                content: `Your ticket, **${ticketChannel.name}**, has been closed by **${interaction.user.tag}**.\nReason: **${reason}**\nThank you for reaching out to Adalea Support!`,
            }).catch(() => console.log('Could not DM ticket creator.'));
        } catch (e) {
            console.error('Error sending DM to creator:', e);
        }

        // Final deletion of the channel
        await interaction.editReply({ content: 'Ticket closed, transcript saved, and reason logged. Deleting channel...', ephemeral: true });
        
        delete tickets[channelId];
        saveTickets();
        
        await ticketChannel.delete(`Ticket closed by ${interaction.user.tag}. Reason: ${reason}`).catch(e => {
            console.error(`Failed to delete channel ${channelId}:`, e);
            interaction.channel.send('⚠️ **ERROR:** Failed to delete the ticket channel. Please delete it manually.').catch(() => {});
        });
        
    } catch (error) {
        console.error('CRITICAL Error in close action:', error);
        await interaction.editReply({ content: 'A critical error occurred during closing/transcript process. Check console for details.', ephemeral: true });
        ticket.closed = false; 
        saveTickets();
    }
  }
  
  // ===================
  // 5. SLASH COMMANDS /add /remove /move
  // ===================
  if (interaction.isChatInputCommand()) {
    
    const member = interaction.member;
    const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
    const isStaffMember = isStaff(member) || isLeaderOrSpecial; 

    const channel = interaction.channel;
    const subcommand = interaction.options.getSubcommand();
    
    if (!channel || !tickets[channel.id]) {
      return interaction.reply({ content: 'This command can only be used in an active ticket channel.', ephemeral: true });
    }
    
    if (subcommand === 'move' && !isStaffMember) {
        return interaction.reply({ content: 'Only staff and leadership can move tickets.', ephemeral: true });
    }
    
    if ((subcommand === 'add' || subcommand === 'remove') && !isStaffMember && tickets[channel.id]?.user !== interaction.user.id) {
         return interaction.reply({ content: 'You do not have permission to use this command here.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');

    try {
      if (subcommand === 'add') {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
        return interaction.reply({ content: `${user.tag} has been **added** to the ticket.`, ephemeral: false });
      }
      
      if (subcommand === 'remove') {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
        return interaction.reply({ content: `${user.tag} has been **removed** from the ticket.`, ephemeral: false });
      }
      
      // --- CORRECT /MOVE LOGIC ---
      if (subcommand === 'move') {
        const newCategoryKey = interaction.options.getString('category_key');
        const newCat = getCategoryByKey(newCategoryKey);
        
        if (!newCat) {
             return interaction.reply({ content: `Invalid category key. Must be one of: ${Object.keys(categories).join(', ')}.`, ephemeral: true });
        }
        
        const oldCatKey = tickets[channel.id].category;
        const oldCat = getCategoryByKey(oldCatKey);
        
        // 1. Update Permissions (Remove Old Role Access)
        if (oldCat?.role) {
            await channel.permissionOverwrites.edit(oldCat.role, { ViewChannel: false, SendMessages: false });
        }

        // 2. Update Permissions (Grant New Role Access)
        if (newCat.role) {
            await channel.permissionOverwrites.edit(newCat.role, { ViewChannel: true, SendMessages: true });
        }

        // 3. Update Channel Category Parent
        await channel.setParent(IDs.ticketCategory, { lockPermissions: false });
        
        // 4. Update Ticket Storage
        tickets[channel.id].category = newCategoryKey;
        saveTickets();
        
        // 5. Send Embed Notification
        const moveEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setDescription(`🎫 Ticket has been moved by <@${interaction.user.id}> from **${oldCat?.name || 'N/A'}** to **${newCat.name}**.`);
        
        const roleMention = newCat.role ? `<@&${newCat.role}>` : '@here';
        
        await interaction.channel.send({ 
            content: `${roleMention} | <@${tickets[channel.id].user}>`, 
            embeds: [moveEmbed] 
        });
        
        return interaction.reply({ content: `Ticket successfully **moved** to the **${newCat.name}** team.`, ephemeral: true });
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
  
  const safeCatName = cat.name.toLowerCase().replace(/[^a-z0-9]/gi, '').substring(0, 5); 
  const safeUsername = user.username.replace(/[^a-z0-9]/gi, '').toLowerCase();
  
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
    
    tickets[channel.id] = { user: user.id, category: categoryKey, subtopic: subtopic || null, claimed: null, closed: false, openTime: Date.now() };
    saveTickets();

    // Since this is the final step, use editReply from the previous deferred state
    await interaction.editReply({ content: `Ticket created: ${channel}`, components: [] });
    
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    delete cooldowns[user.id];
    // Attempt to send an error reply to the user if the channel creation failed
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Failed to create ticket channel due to a server error. Please try again later.', components: [] });
    } else {
      await interaction.reply({ content: 'Failed to create ticket channel due to a server error. Please try again later.', ephemeral: true });
    }
  }
}

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
                description: 'Move the ticket to a different team/category.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'category_key', 
                        description: 'The key of the new team (e.g., moderation, staffing, pr).',
                        type: ApplicationCommandOptionType.String,
                        required: true,
                        choices: Object.values(categories).map(c => ({
                            name: c.name,
                            value: c.key 
                        }))
                    },
                ],
            },
        ],
    },
];

client.once('clientReady', async () => {
    console.log(`${client.user.tag} is online and ready.`);
    
    try {
        const guild = client.guilds.cache.get(IDs.GUILD);
        if (guild) {
            await guild.commands.set(commands);
            console.log(`Slash commands registered successfully to Guild: ${IDs.GUILD}`);
        } else {
            console.error(`ERROR: Guild ID ${IDs.GUILD} not found. Is the bot in the server?`);
            await client.application.commands.set(commands);
            console.log('Slash commands registered globally (may take up to 1 hour).');
        }
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.login(BOT_TOKEN);
