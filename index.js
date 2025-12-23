// ===================
// Adalea Tickets v2 Clone - FINAL PRODUCTION FILE (FIXED)
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
// EXPRESS SETUP FOR RENDER (FIXED)
// ===================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running');
});

// Explicitly bind to 0.0.0.0 for Render
app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Render HTTP Server running on port ${port}`);
});

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
    // --- Specific Role ID for !ticketchannel command ---
    TICKET_REGISTRAR_ROLE_ID: '1402417889826443356',
    // ----------------------------------------------------------------
};

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
            { key: 'applications', label: 'Applications', value: 'Applying for a MR or HR position at Adalea.' },
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
// TICKET STORAGE
// ===================
const ticketDataPath = './ticketData.json';
let tickets = {};

const saveTickets = () => {
    try {
        fs.writeFileSync(ticketDataPath, JSON.stringify(tickets, null, 4));
    } catch (error) {
        console.error('Failed to save ticketData.json:', error);
    }
};

/**
 * Loads ticket data from the JSON file on bot startup.
 */
function loadTickets() {
    try {
        if (fs.existsSync(ticketDataPath)) {
            const fileContent = fs.readFileSync(ticketDataPath, 'utf-8');
            if (fileContent.trim().length > 0) {
                tickets = JSON.parse(fileContent);
                const ticketCount = Object.keys(tickets).filter(key => key !== 'counters').length;
                console.log(`Loaded ${ticketCount} active tickets from ticketData.json.`);
            } else {
                tickets = {};
            }
        }
    } catch (error) {
        console.error('Failed to load/parse ticketData.json. Starting fresh.', error);
        tickets = {};
    }

    if (!tickets.counters) {
        tickets.counters = {};
        Object.keys(categories).forEach(key => {
            tickets.counters[key] = 1;
        });
        saveTickets();
    }
}

// ===================
// COOLDOWNS & STATE
// ===================
const cooldowns = {};
const COOLDOWN_SECONDS = 34;
let stoppedCategories = {};
let stoppedSubtopics = {};

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

// Global Staff Check
function isStaff(member) {
    if (!member) return false;
    // FIX: Allow Administrators to be considered staff automatically
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    const staffRoleIds = [IDs.moderation, IDs.staffing, IDs.pr, IDs.hr, IDs.leadership].filter(id => id);
    return member.roles.cache.some(role => staffRoleIds.includes(role.id));
}

// Strict Check for Claim/Close
function canClaimOrClose(member, userId) {
    if (userId === IDs.special) return true;
    if (!member) return false;
    // FIX: Allow Administrators to claim/close automatically
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    return member.roles.cache.has(IDs.leadership) || member.roles.cache.has(IDs.hr);
}

// ===================
// MESSAGE COMMAND HANDLER (?supportpanel, !ticketchannel, etc)
// ===================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content;
    const member = message.member;

    // --- PREFIX COMMANDS ---
    if (content.startsWith('?')) {
        const [cmd, ...args] = content.slice(1).toLowerCase().split(' ');
        const arg = args.join(' ');
        
        // FIX: Allow Administrators to run these commands even if they don't have the Leadership role
        const isLeaderOrSpecial = member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.has(IDs.leadership) || message.author.id === IDs.special;

        // SUPPORT PANEL
        if (cmd === 'supportpanel' && isLeaderOrSpecial) {
            try {
                const existing = message.channel.messages.cache.find(m => m.author.id === client.user.id && m.embeds.length);
                if (existing) await existing.delete().catch(() => {});

                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('<:verified:1406645489381806090> **Adalea Support**')
                    .setDescription("Welcome to Adalea's Support channel! Please select the category that best fits your needs before opening a ticket. The corresponding team will assist you shortly. Thank you for your patience and respect!")
                    .setImage('https://cdn.discordapp.com/attachments/1315086065320722492/1449589414857805834/support.png?ex=693f72d8&is=693e2158&hm=d8dfcdcb9481e8c66ff6888e238836fcc0e944d6cded23010267a733c700c83d&');

                const buttons = Object.values(categories).map(c => 
                    new ButtonBuilder()
                        .setLabel(c.name)
                        .setCustomId(`category_${c.key}`) // Stable ID
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(c.emoji)
                );

                const row = new ActionRowBuilder().addComponents(buttons);

                await message.channel.send({ embeds: [embed], components: [row] });
                await message.delete().catch(() => {});

            } catch (error) {
                console.error('Error in ?supportpanel:', error);
            }
        }

        // STOP/RESUME
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
    }

    // --- !ticketchannel COMMAND (Manual Registration) ---
    if (content.startsWith('!ticketchannel')) {
        await message.delete().catch(() => {});

        // 1. Authorization Check (FIX: Added Administrator Bypass)
        const hasPermission = message.member.roles.cache.has(IDs.TICKET_REGISTRAR_ROLE_ID) || message.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (!hasPermission) {
            const reply = await message.channel.send(`You do not have permission to run this command. Required Role: <@&${IDs.TICKET_REGISTRAR_ROLE_ID}>`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        const channelId = message.channelId;
        const parts = content.split(/\s+/).filter(p => p.length > 0);
        // parts: ['!ticketchannel', 'categoryKey', 'userId']
        const [command, categoryKey, userId] = parts;

        // 2. Argument Validation
        if (parts.length < 3) {
            const reply = await message.channel.send('Invalid format. Use: `!ticketchannel <category_key> <user_id>`');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        const category = getCategoryByKey(categoryKey);
        if (!category) {
            const reply = await message.channel.send(`Invalid category key: \`${categoryKey}\`. Valid keys: ${Object.keys(categories).join(', ')}.`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        // 3. Register Ticket
        if (tickets[channelId]) {
            const reply = await message.channel.send('This channel is already registered as an active ticket.');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        if (!tickets.counters[categoryKey]) tickets.counters[categoryKey] = 1;

        tickets[channelId] = {
            user: userId,
            category: categoryKey,
            subtopic: null,
            claimed: null,
            closed: false,
            openTime: Date.now()
        };
        saveTickets();

        const reply = await message.channel.send(`✅ Channel **#${message.channel.name}** successfully registered as a **${category.name}** ticket for <@${userId}>.`);
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
});

// =========================================================================================
// INTERACTION HANDLER (Buttons & Menus) - PERMANENT LISTENER
// =========================================================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

    // ===================
    // 1. CATEGORY BUTTONS
    // ===================
    if (interaction.isButton() && interaction.customId.startsWith('category_')) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const catKey = interaction.customId.replace('category_', '');
            const category = categories[catKey];

            if (!category) return interaction.editReply({ content: 'Category not found.' });
            if (isCategoryStopped(catKey)) return interaction.editReply({ content: 'This category is currently stopped.' });

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
    // 3. SLASH COMMANDS
    // ===================
    if (interaction.isChatInputCommand()) {
        const channelId = interaction.channelId;
        const member = interaction.member;

        // --- /CLAIM COMMAND ---
        if (interaction.commandName === 'claim') {
            if (!tickets[channelId]) return interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });

            if (!canClaimOrClose(member, interaction.user.id)) {
                return interaction.reply({ content: 'You do not have permission to claim tickets.', ephemeral: true });
            }

            const ticket = tickets[channelId];
            if (ticket.claimed) return interaction.reply({ content: `Already claimed by <@${ticket.claimed}>.`, ephemeral: true });

            ticket.claimed = interaction.user.id;
            saveTickets();

            const claimEmbed = new EmbedBuilder()
                .setColor(0x32CD32)
                .setDescription(`✅ <@${interaction.user.id}> **has claimed this ticket**.`);

            return interaction.reply({ embeds: [claimEmbed] });
        }

        // --- /CLOSE COMMAND ---
        if (interaction.commandName === 'close') {
            if (!tickets[channelId]) return interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });

            if (!canClaimOrClose(member, interaction.user.id)) {
                return interaction.reply({ content: 'You do not have permission to close tickets.', ephemeral: true });
            }

            const ticket = tickets[channelId];
            if (ticket.closed) return interaction.reply({ content: 'Ticket is already closing.', ephemeral: true });

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

        // --- SUBCOMMANDS (add, remove, move, rename) ---
        if (interaction.commandName === 'ticket') {
            const isLeaderOrSpecial = member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
            const isStaffMember = isStaff(member) || isLeaderOrSpecial;
            const subcommand = interaction.options.getSubcommand();
            const channel = interaction.channel;

            if (!channel || !tickets[channel.id]) return interaction.reply({ content: 'This command can only be used in an active ticket channel.', ephemeral: true });

            if ((subcommand === 'move' || subcommand === 'rename') && !isStaffMember) {
                return interaction.reply({ content: 'Only staff and leadership can use this command.', ephemeral: true });
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

                if (subcommand === 'move') {
                    const newCategoryKey = interaction.options.getString('category_key');
                    const newCat = getCategoryByKey(newCategoryKey);

                    if (!newCat) return interaction.reply({ content: 'Invalid category key.', ephemeral: true });

                    const oldCatKey = tickets[channel.id].category;
                    const oldCat = getCategoryByKey(oldCatKey);

                    if (oldCat?.role) await channel.permissionOverwrites.edit(oldCat.role, { ViewChannel: false, SendMessages: false });
                    if (newCat.role) await channel.permissionOverwrites.edit(newCat.role, { ViewChannel: true, SendMessages: true });

                    await channel.setParent(IDs.ticketCategory, { lockPermissions: false });

                    tickets[channel.id].category = newCategoryKey;
                    tickets[channel.id].subtopic = null;
                    saveTickets();

                    const moveEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setDescription(`🎟️ Ticket has been moved by <@${interaction.user.id}> from **${oldCat?.name || 'N/A'}** to **${newCat.name}**.`);

                    const roleMention = newCat.role ? `<@&${newCat.role}>` : '@here';
                    await interaction.channel.send({ content: `${roleMention} | <@${tickets[channel.id].user}>`, embeds: [moveEmbed] });

                    return interaction.reply({ content: `Ticket successfully **moved** to the **${newCat.name}** team.`, ephemeral: true });
                }

                if (subcommand === 'rename') {
                    const newName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '');
                    if (!newName) return interaction.reply({ content: 'Invalid new name provided.', ephemeral: true });

                    await channel.setName(newName);

                    const renameEmbed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setDescription(`🏷️ Ticket renamed by <@${interaction.user.id}> to **#${newName}**.`);

                    await interaction.channel.send({ embeds: [renameEmbed] });

                    return interaction.reply({ content: `Ticket successfully **renamed** to **#${newName}**.`, ephemeral: true });
                }

            } catch (error) {
                console.error('Slash command error:', error);
                interaction.reply({ content: 'Error executing command.', ephemeral: true }).catch(() => {});
            }
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
                transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content || '[No Content]'}\n`;
                if (msg.attachments.size) msg.attachments.forEach(a => transcript += `[Attachment]: ${a.url}\n`);
            });

            const transcriptFilename = `${ticketChannel.name}.txt`;
            const transcriptPath = `./${transcriptFilename}`;

            fs.writeFileSync(transcriptPath, transcript);

            const logChannel = await client.channels.fetch(IDs.transcriptLog).catch(() => null);

            // Log Embed
            const logEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle(`🎟️ Ticket Closed: #${ticketChannel.name}`)
                .addFields(
                    { name: 'Ticket ID', value: `${channelId}`, inline: true },
                    { name: 'Opened By', value: `<@${ticket.user}>`, inline: true },
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Category', value: categories[ticket.category]?.name || 'N/A', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                );

            if (logChannel) {
                await logChannel.send({
                    embeds: [logEmbed],
                    files: [{ attachment: transcriptPath, name: transcriptFilename }]
                });
            }

            // User DM
            try {
                const creator = await client.users.fetch(ticket.user);
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`✅ Your Ticket Has Been Closed`)
                    .setDescription(`Your ticket, **#${ticketChannel.name}**, has been closed by **${interaction.user.tag}**.`)
                    .addFields({ name: 'Reason', value: reason, inline: false });

                await creator.send({
                    embeds: [dmEmbed],
                    files: [{ attachment: transcriptPath, name: transcriptFilename }]
                });
            } catch (dmError) {
                console.warn(`[TICKET ${channelId}] Failed to DM creator.`);
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
            await interaction.editReply({ content: 'Critical error closing ticket.' });
        }
    }
});

// ===================
// TICKET CREATION FUNCTION
// ===================
async function createTicketChannel(user, categoryKey, subtopicKey, interaction) {
    const guild = interaction.guild;
    const cat = categories[categoryKey];

    if (!tickets.counters[categoryKey]) {
        tickets.counters[categoryKey] = 1;
    }

    const ticketNumber = tickets.counters[categoryKey];
    const paddedNumber = ticketNumber.toString().padStart(3, '0');
    const name = `${categoryKey}-${paddedNumber}`;

    try {
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...(cat.role ? [{ id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
            { id: IDs.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: IDs.special, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
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

        const roleMention = cat.role ? `<@&${cat.role}>` : '@here';
        await channel.send({ content: `${roleMention} | <@${user.id}>`, embeds: [embed] });

        tickets[channel.id] = { user: user.id, category: categoryKey, subtopic: subtopicKey || null, claimed: null, closed: false, openTime: Date.now() };
        tickets.counters[categoryKey]++;
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
        name: 'claim',
        description: 'Claim the current ticket (Staff Only).',
    },
    {
        name: 'close',
        description: 'Close the current ticket (Staff Only).',
    },
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
    loadTickets();
    console.log(`🤖 ${client.user.tag} is online!`);
    await client.application.commands.set(commands);
});

// ===================
// ANTI-CRASH HANDLERS
// ===================
process.on('unhandledRejection', (reason, p) => {
    console.log(' [antiCrash] :: Unhandled Rejection/Catch');
    console.log(reason, p);
});
process.on('uncaughtException', (err, origin) => {
    console.log(' [antiCrash] :: Uncaught Exception/Catch');
    console.log(err, origin);
});

client.login(BOT_TOKEN);
