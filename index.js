// ===================
// Adalea Tickets v2 Clone - FINAL PRODUCTION FILE (V14) // FULLY CLEAN, ONE-TIME REGISTRATION ENABLED
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
    special: '1107787991444881408', // Special User ID
    moderation: '1402411949593202800',
    staffing: '1402416194354544753',
    pr: '1402416210779312249',
    hr: '1402400473344114748', // HR Team Role ID
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
            { key: 'appeal', label: 'Appealing', value: 'Appealing a warning, mute, kick, or server ban.' },
            { key: 'report', label: 'Reporting', value: 'Reporting rule-breaking behaviour within our server.' },
            { key: 'custom_roles', label: 'Custom Booster Roles', value: 'Inquiries regarding custom roles for server boosters.' },
            { key: 'other_mod', label: 'Other Mod Enquiry', value: 'Other moderation related enquiries.' }
        ],
    },
    staffing: {
        name: 'Staffing Enquiries',
        key: 'staffing',
        role: IDs.staffing,
        emoji: '<:flower_yellow:1437121213796188221>',
        subtopics: [
            { key: 'staff_report', label: 'Reporting', value: 'Reporting a member of staff, MR, or HR.' },
            { key: 'applications', label: 'Applications', value: 'Applying for a MR or HR position at Adalea.' }, // Removed Mod Application reference
            { key: 'other_staffing', label: 'Other Staffing Enquiry', value: 'Other staffing related enquiries.' }
        ],
    },
    pr: {
        name: 'Public Relations Enquiries',
        key: 'pr',
        role: IDs.pr,
        emoji: '<:flower_pink:1437121075086622903>',
        subtopics: [
            { key: 'affiliation', label: 'Affiliation', value: 'Forming a partnership between your group and Adalea.' },
            { key: 'prize_claim', label: 'Prize claim', value: 'Claiming your prize after winning an event.' },
            { key: 'other_pr', label: 'Other PR Enquiry', value: 'Other public relations related enquiries.' }
        ],
    },
    general: { name: 'General', key: 'general', role: IDs.hr, emoji: '<:flower_blue:1415086940306276424>', subtopics: null },
    leadership: { name: 'Leadership', key: 'leadership', role: IDs.leadership, emoji: '<:flower_green:1437121005821759688>', subtopics: null },
};

// Helper function to get a category object by its key
const getCategoryByKey = (key) => categories[key];

// Helper function to get subtopic value by its key
const getSubtopicValueByKey = (categoryKey, subtopicKey) => {
    const category = getCategoryByKey(categoryKey);
    return category?.subtopics?.find(s => s.key === subtopicKey)?.value;
}

// Helper function to get subtopic label by its key
const getSubtopicLabelByKey = (categoryKey, subtopicKey) => {
    const category = getCategoryByKey(categoryKey);
    return category?.subtopics?.find(s => s.key === subtopicKey)?.label;
}

// ===================
// HELPER FUNCTIONS
// ===================

function isCategoryStopped(categoryKey) {
    return stoppedCategories[categoryKey] === true;
}

function isSubtopicStopped(categoryKey, subtopicKey) {
    const subtopicValue = getSubtopicValueByKey(categoryKey, subtopicKey);
    return stoppedSubtopics[`${categoryKey}_${subtopicValue}`] === true;
}

function hasCooldown(userId) {
    if (!cooldowns[userId]) return false;
    return Date.now() - cooldowns[userId] < COOLDOWN_SECONDS * 1000;
}

function isStaff(member) {
    if (!member) return false;
    const staffRoleIds = [IDs.moderation, IDs.staffing, IDs.pr, IDs.hr, IDs.leadership].filter(id => id);
    return member.roles.cache.some(role => staffRoleIds.includes(role.id));
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
        }
    }

    // STOP/RESUME COMMANDS
    if ((cmd === 'stop' || cmd === 'resume') && isLeaderOrSpecial) {
        if (!arg) return message.channel.send('Specify a category key or subtopic key.');
        try {
            if (arg.includes('-')) {
                const [cat, subKey] = arg.split('-');
                const subtopicObject = categories[cat]?.subtopics?.find(s => s.key === subKey);
                if (!subtopicObject) return message.channel.send('Subtopic key not found.');
                
                const subtopicValue = subtopicObject.value;
                if (cmd === 'stop') stoppedSubtopics[`${cat}_${subtopicValue}`] = true;
                else delete stoppedSubtopics[`${cat}_${subtopicValue}`];
                
                return message.channel.send(`Subtopic **${subtopicObject.label}** ${cmd === 'stop' ? 'stopped' : 'resumed'}.`);
            } else {
                if (!categories[arg]) return message.channel.send('Category key not found.');
                if (cmd === 'stop') stoppedCategories[arg] = true;
                else delete stoppedCategories[arg];
                return message.channel.send(`Category **${arg}** ${cmd === 'stop' ? 'stopped' : 'resumed'}.`);
            }
        } catch (error) {
            console.error('Error in ?stop/resume:', error);
        }
    }
});

// =========================================================================================
// INTERACTION HANDLER
// =========================================================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

    // ===================
    // 1. CATEGORY BUTTONS
    // ===================
    if (interaction.isButton() && interaction.customId.startsWith('category_')) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const rawCatName = interaction.customId.replace('category_', '');
            const catKey = Object.keys(categories).find(k => categories[k].name.toLowerCase().replace(/\s/g, '-') === rawCatName);

            if (!catKey) return interaction.editReply({ content: 'Category not found.' });
            if (isCategoryStopped(catKey)) return interaction.editReply({ content: 'This category is currently stopped.' });

            const category = categories[catKey];

            if (category.subtopics) {
                const menuOptions = category.subtopics.map(s => ({
                    label: s.label.substring(0, 100),
                    value: s.key.substring(0, 100),
                    description: s.value.substring(0, 100)
                }));

                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`subtopic_${catKey}`)
                        .setPlaceholder('Select the issue')
                        .addOptions(menuOptions)
                );
                return interaction.editReply({ content: 'Please select a subtopic for your ticket.', components: [menu] });
            }

            if (hasCooldown(interaction.user.id))
                return interaction.editReply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds.` });

            cooldowns[interaction.user.id] = Date.now();
            await createTicketChannel(interaction.user, catKey, null, interaction);
        } catch (error) {
            console.error('Error in category button:', error);
            interaction.editReply({ content: 'An error occurred.' }).catch(() => {});
        }
    }

    // ===================
    // 2. SUBTOPIC SELECTION
    // ===================
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('subtopic_')) {
        await interaction.deferUpdate();
        try {
            const catKey = interaction.customId.replace('subtopic_', '');
            const selectedKey = interaction.values[0];

            if (isSubtopicStopped(catKey, selectedKey)) return interaction.editReply({ content: 'This subtopic is currently stopped.', components: [] });

            if (hasCooldown(interaction.user.id))
                return interaction.editReply({ content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds.`, components: [] });

            cooldowns[interaction.user.id] = Date.now();
            await createTicketChannel(interaction.user, catKey, selectedKey, interaction);
        } catch (error) {
            console.error('Error in subtopic selection:', error);
            interaction.editReply({ content: 'An error occurred.', components: [] }).catch(() => {});
        }
    }

    // ===================
    // 3. CLAIM & CLOSE BUTTONS
    // ===================
    if (interaction.isButton() && (interaction.customId.startsWith('claim_') || interaction.customId.startsWith('close_'))) {
        const [action, channelId] = interaction.customId.split('_');
        const ticket = tickets[channelId];

        if (!ticket) return interaction.reply({ content: 'Ticket data not found. It may have been deleted.', ephemeral: true });

        // Ensure we can fetch channel even after restart
        const ticketChannel = interaction.guild.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
        
        if (!ticketChannel) {
            delete tickets[channelId];
            saveTickets();
            return interaction.reply({ content: 'Channel not found.', ephemeral: true });
        }

        const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const isLeaderOrSpecial = member?.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
        const isStaffMember = isStaff(member) || isLeaderOrSpecial;

        if (action === 'claim') {
            if (!isStaffMember) return interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
            if (ticket.claimed) return interaction.reply({ content: `Already claimed by <@${ticket.claimed}>.`, ephemeral: true });

            ticket.claimed = interaction.user.id;
            saveTickets();

            const claimEmbed = new EmbedBuilder()
                .setColor(0x32CD32)
                .setDescription(`✅ <@${interaction.user.id}> **has claimed this ticket**.`);
            
            await ticketChannel.send({ embeds: [claimEmbed] });

            const newRow = ActionRowBuilder.from(interaction.message.components[0]).setComponents(
                ButtonBuilder.from(interaction.message.components[0].components.find(c => c.customId.startsWith('claim'))).setDisabled(true),
                ButtonBuilder.from(interaction.message.components[0].components.find(c => c.customId.startsWith('close'))).setDisabled(false)
            );
            await interaction.message.edit({ components: [newRow] });
            return interaction.reply({ content: 'Claimed.', ephemeral: true });
        }

        if (action === 'close') {
            if (!isStaffMember && ticket.user !== interaction.user.id) {
                return interaction.reply({ content: 'You cannot close this ticket.', ephemeral: true });
            }
            if (ticket.closed) return interaction.reply({ content: 'Already closing.', ephemeral: true });

            const modal = new ModalBuilder()
                .setCustomId(`close_modal_${channelId}`)
                .setTitle('Close Ticket');
            
            const reasonInput = new TextInputBuilder()
                .setCustomId('close_reason')
                .setLabel('Reason for closing')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }
    }

    // ===================
    // 4. CLOSE MODAL SUBMIT
    // ===================
    if (interaction.isModalSubmit() && interaction.customId.startsWith('close_modal_')) {
        const channelId = interaction.customId.replace('close_modal_', '');
        const reason = interaction.fields.getTextInputValue('close_reason');
        const ticket = tickets[channelId];

        if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });
        
        ticket.closed = true;
        saveTickets();
        await interaction.deferReply({ ephemeral: true });

        const ticketChannel = interaction.guild.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);

        try {
            const subtopicLabel = ticket.subtopic ? getSubtopicLabelByKey(ticket.category, ticket.subtopic) : 'N/A';

            // --- TRANSCRIPT GENERATION ---
            let transcript = `--- Adalea Ticket Transcript ---\nTicket ID: ${channelId}\nCategory: ${categories[ticket.category]?.name}\nSubtopic: ${subtopicLabel}\nOpened By: ${client.users.cache.get(ticket.user)?.tag || ticket.user}\nClosed By: ${interaction.user.tag}\nReason: ${reason}\n\n`;
            
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
                transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
                if (msg.attachments.size) msg.attachments.forEach(a => transcript += `[Attachment]: ${a.url}\n`);
            });

            const transcriptPath = `./transcript-${channelId}.txt`;
            fs.writeFileSync(transcriptPath, transcript);
            const logChannel = await client.channels.fetch(IDs.transcriptLog).catch(() => null);

            // --- 1. DETAILED EMBED FOR USER DM (AS PREVIOUSLY REQUESTED) ---
            const dmEmbed = new EmbedBuilder()
                .setColor(0x5A0E0E) // Dark red/brown background
                .setAuthor({ name: 'Ticket Closed', iconURL: interaction.guild.iconURL() })
                .addFields(
                    { name: 'Ticket ID', value: `${channelId}`, inline: true },
                    { name: 'Opened By', value: `<@${ticket.user}>`, inline: true },
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Open Time', value: `<t:${Math.floor(ticket.openTime / 1000)}:f>`, inline: true },
                    { name: 'Claimed By', value: ticket.claimed ? `<@${ticket.claimed}>` : 'Unclaimed', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                );
            
            // --- 2. SIMPLE EMBED FOR LOG CHANNEL (CLEAN FORMAT) ---
            const logEmbed = new EmbedBuilder()
                .setColor(0x36393F) // Darker gray/blue color for log
                .setTitle(`Ticket Closed: #${ticketChannel.name}`)
                .setDescription(`**Ticket User:** <@${ticket.user}>\n**Closed By:** <@${interaction.user.id}>\n**Reason:** ${reason}`)
                .setFooter({ text: `Ticket ID: ${channelId}` }); // Adding ticket ID to footer


            // Send to Log
            if (logChannel) {
                await logChannel.send({
                    embeds: [logEmbed], // Using the simplified log embed
                    files: [{ attachment: transcriptPath, name: `transcript-${channelId}.txt` }] 
                });
            }

            // Send DM to User 
            try {
                const creator = await client.users.fetch(ticket.user);
                await creator.send({
                    embeds: [dmEmbed], // Using the detailed DM embed
                    files: [{ attachment: transcriptPath, name: `transcript-${channelId}.txt` }] 
                });
            } catch (dmError) {
                console.warn(`[TICKET ${channelId}] Failed to DM creator (${ticket.user}). They likely have DMs disabled or blocked the bot. Error: ${dmError.message}`);
                // Continue execution even if DM fails
            }

            fs.unlinkSync(transcriptPath);

            await interaction.editReply({ content: 'Ticket closed. Deleting channel in 5 seconds...' });
            setTimeout(() => ticketChannel.delete().catch(() => {}), 5000);
            delete tickets[channelId];
            saveTickets();

        } catch (error) {
            console.error('Error closing ticket:', error);
            ticket.closed = false; 
            saveTickets();
        }
    }

    // ===================
    // 5. SLASH COMMANDS
    // ===================
    if (interaction.isChatInputCommand()) {
        const member = interaction.member;
        const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
        const isStaffMember = isStaff(member) || isLeaderOrSpecial;
        const channel = interaction.channel;
        const subcommand = interaction.options.getSubcommand();

        if (!channel || !tickets[channel.id]) return interaction.reply({ content: 'Not a ticket channel.', ephemeral: true });

        if ((subcommand === 'move' || subcommand === 'rename') && !isStaffMember) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        if ((subcommand === 'add' || subcommand === 'remove') && !isStaffMember && tickets[channel.id]?.user !== interaction.user.id) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');

        try {
            if (subcommand === 'add') {
                await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
                return interaction.reply({ content: `Added ${user}.` });
            }
            if (subcommand === 'remove') {
                await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
                return interaction.reply({ content: `Removed ${user}.` });
            }
            if (subcommand === 'move') {
                const newCategoryKey = interaction.options.getString('category_key');
                const newCat = getCategoryByKey(newCategoryKey);
                const oldCat = getCategoryByKey(tickets[channel.id].category);

                if (oldCat?.role) await channel.permissionOverwrites.edit(oldCat.role, { ViewChannel: false, SendMessages: false });
                if (newCat.role) await channel.permissionOverwrites.edit(newCat.role, { ViewChannel: true, SendMessages: true });

                await channel.setParent(IDs.ticketCategory, { lockPermissions: false });
                tickets[channel.id].category = newCategoryKey;
                tickets[channel.id].subtopic = null;
                saveTickets();

                const moveEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setDescription(`ticket moved to **${newCat.name}**.`);
                
                const roleMention = newCat.role ? `<@&${newCat.role}>` : '';
                await interaction.channel.send({ content: `${roleMention}`, embeds: [moveEmbed] });
                return interaction.reply({ content: 'Ticket moved.', ephemeral: true });
            }
            if (subcommand === 'rename') {
                const newName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '');
                await channel.setName(newName);
                return interaction.reply({ content: `Ticket renamed to #${newName}.` });
            }
        } catch (error) {
            console.error('Slash command error:', error);
            interaction.reply({ content: 'Error executing command.', ephemeral: true }).catch(() => {});
        }
    }
});

// ===================
// TICKET CREATION FUNCTION
// ===================
async function createTicketChannel(user, categoryKey, subtopicKey, interaction) {
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
            // Add Category Role (if exists)
            ...(cat.role ? [{ id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
            // Leadership & Special User ALWAYS see tickets
            { id: IDs.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: IDs.special, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            // Bot
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
        ];

        const channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: IDs.ticketCategory,
            permissionOverwrites: overwrites,
        });

        const subtopicDescription = subtopicKey ? getSubtopicValueByKey(categoryKey, subtopicKey) : null;
        const subtopicLabel = subtopicKey ? getSubtopicLabelByKey(categoryKey, subtopicKey) : null;

        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`${cat.name} Ticket`)
            .setDescription(`Welcome <@${user.id}>! A member of the **${cat.name}** team will assist you shortly.\n\n` +
                (subtopicLabel ? `**Issue:** ${subtopicLabel}\n*${subtopicDescription}*` : 'Please explain your issue in detail.'))
            .setFooter({ text: `Ticket ID: ${channel.id}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Claim').setCustomId(`claim_${channel.id}`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setLabel('Close').setCustomId(`close_${channel.id}`).setStyle(ButtonStyle.Danger)
        );

        // Only Ping the specific role for this category. Leadership/Special can see it via overwrites but wont be pinged here.
        const roleMention = cat.role ? `<@&${cat.role}>` : '';
        await channel.send({ content: `${roleMention} | <@${user.id}>`, embeds: [embed], components: [row] });

        tickets[channel.id] = { user: user.id, category: categoryKey, subtopic: subtopicKey || null, claimed: null, closed: false, openTime: Date.now() };
        saveTickets();

        await interaction.editReply({ content: `Ticket created: ${channel}`, components: [] });
    } catch (error) {
        console.error('Error creating ticket:', error);
        delete cooldowns[user.id];
        interaction.editReply({ content: 'Failed to create ticket.', components: [] }).catch(() => {});
    }
}

// ===================
// COMMAND REGISTRATION
// ===================
const commands = [
    {
        name: 'ticket',
        description: 'Ticket management commands.',
        options: [
            {
                name: 'add',
                description: 'Add a user.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [{ name: 'user', description: 'User to add.', type: ApplicationCommandOptionType.User, required: true }],
            },
            {
                name: 'remove',
                description: 'Remove a user.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [{ name: 'user', description: 'User to remove.', type: ApplicationCommandOptionType.User, required: true }],
            },
            {
                name: 'move',
                description: 'Move ticket to different team.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [{
                    name: 'category_key',
                    description: 'The new team.',
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: Object.values(categories).map(c => ({ name: c.name, value: c.key }))
                }],
            },
            {
                name: 'rename',
                description: 'Rename the ticket.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [{ name: 'name', description: 'New name.', type: ApplicationCommandOptionType.String, required: true }],
            },
        ],
    },
];

client.once('ready', async () => {
    console.log(`${client.user.tag} is online! Attempting final command registration.`);
    // THIS LINE IS LEFT UNCOMMENTED FOR THIS FINAL DEPLOYMENT.
    // IT WILL OVERWRITE ALL PREVIOUS BAD REGISTRATIONS.
    await client.application.commands.set(commands); 
    console.log('Final commands registered. You may need to restart your Discord client.');
});

client.login(BOT_TOKEN);
