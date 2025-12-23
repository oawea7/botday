// ===================
// Adalea Tickets v2 Clone - FINAL PRODUCTION FILE (V18 - ALL FIXES APPLIED)
// PART 1
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
// EXPRESS SETUP FOR RENDER (DO NOT TOUCH)
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
    GUILD: '1402400197040013322',
    leadership: '1402400285674049576',
    special: '1107787991444881408',
    moderation: '1402411949593202800',
    staffing: '1402416194354544753',
    pr: '1402416210779312249',
    hr: '1402400473344114748',
    transcriptLog: '1437112357787533436',
    ticketCategory: '1437139682361344030',
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

// ===================
// HELPER FUNCTIONS
// ===================
const getCategoryByKey = (key) => categories[key];
const getSubtopicValueByKey = (categoryKey, subtopicKey) => {
    const category = getCategoryByKey(categoryKey);
    return category?.subtopics?.find(s => s.key === subtopicKey)?.value;
};
const getSubtopicLabelByKey = (categoryKey, subtopicKey) => {
    const category = getCategoryByKey(categoryKey);
    return category?.subtopics?.find(s => s.key === subtopicKey)?.label;
};

// ===================
// TICKET STORAGE
// ===================
const ticketDataPath = './ticketData.json';
let tickets = {};

if (fs.existsSync(ticketDataPath)) {
    try {
        const fileContent = fs.readFileSync(ticketDataPath, 'utf-8');
        if (fileContent.trim().length > 0) tickets = JSON.parse(fileContent);
        else console.warn('ticketData.json exists but is empty. Initializing new object.');
    } catch (error) {
        console.error('Failed to parse ticketData.json. File is corrupt.', error);
    }
}

if (!tickets.counters) {
    tickets.counters = {};
    Object.keys(categories).forEach(key => tickets.counters[key] = 1);
}

const saveTickets = () => {
    try { fs.writeFileSync(ticketDataPath, JSON.stringify(tickets, null, 4)); }
    catch (error) { console.error('Failed to save ticketData.json:', error); }
};

// ===================
// COOLDOWNS & STATE
// ===================
const cooldowns = {};
const COOLDOWN_SECONDS = 34;
let stoppedCategories = {};
let stoppedSubtopics = {};

function isCategoryStopped(categoryKey) { return stoppedCategories[categoryKey] === true; }
function isSubtopicStopped(categoryKey, subtopicKey) {
    const subtopicValue = getSubtopicValueByKey(categoryKey, subtopicKey);
    return stoppedSubtopics[`${categoryKey}_${subtopicValue}`] === true;
}
function hasCooldown(userId) {
    if (!cooldowns[userId]) return false;
    return Date.now() - cooldowns[userId] < COOLDOWN_SECONDS * 1000;
}

// STAFF CHECKS
function isStaff(member) {
    if (!member) return false;
    const staffRoleIds = [IDs.moderation, IDs.staffing, IDs.pr, IDs.hr, IDs.leadership].filter(id => id);
    return member.roles.cache.some(role => staffRoleIds.includes(role.id));
}
function canClaimOrClose(member, userId) {
    if (userId === IDs.special) return true;
    if (!member) return false;
    return member.roles.cache.has(IDs.leadership) || member.roles.cache.has(IDs.hr);
}// ===================
// PART 2
// ===================

// ===================
// MESSAGE COMMAND HANDLER (?supportpanel, ?stop, ?resume)
// ===================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith('?')) return;

    const [cmd, ...args] = message.content.slice(1).toLowerCase().split(' ');
    const arg = args.join(' ');
    const member = message.member;

    const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || message.author.id === IDs.special;

    // --- SUPPORT PANEL ---
    if (cmd === 'supportpanel' && isLeaderOrSpecial) {
        try {
            const existing = message.channel.messages.cache.find(m => m.author.id === client.user.id && m.embeds.length);
            if (existing) await existing.delete().catch(() => {});

            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('<:verified:1406645489381806090> **Adalea Support**')
                .setDescription("Welcome to Adalea's Support channel! Please select the category that best fits your needs before opening a ticket. The corresponding team will assist you shortly. Thank you for your patience and respect!")
                .setImage('https://cdn.discordapp.com/attachments/1315086065320722492/1449589414857805834/support.png?ex=693f72d8&is=693e2158&hm=d8dfcdcb9481e8c66ff6888e238836fcc0e944d6cded23010267a733c700c83d&');

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

    // --- STOP / RESUME ---
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

// ===================
// INTERACTION HANDLER
// ===================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

    // ===================
    // CATEGORY BUTTONS
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
    // SUBTOPIC SELECTION
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
});// ===================
// PART 3
// ===================

// ===================
// SLASH COMMANDS HANDLER
// ===================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

    const channelId = interaction.channelId;
    const member = interaction.member;

    // --- /CLAIM COMMAND ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'claim') {
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
    if (interaction.isChatInputCommand() && interaction.commandName === 'close') {
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

    // --- /TICKET SUBCOMMANDS ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
        const isLeaderOrSpecial = member.roles.cache.has(IDs.leadership) || interaction.user.id === IDs.special;
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

    // ===================
    // MODAL SUBMISSION FOR CLOSING TICKET
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

            const logEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle(`🎟️ Ticket Closed: #${ticketChannel.name}`)
                .addFields(
                    { name: 'Ticket ID', value: `${channelId}`, inline: true },
                    { name: 'Opened By', value: `<@${ticket.user}>`, inline: true },
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Open Time', value: `<t:${Math.floor(ticket.openTime / 1000)}:f>`, inline: true },
                    { name: 'Claimed By', value: ticket.claimed ? `<@${ticket.claimed}>` : 'Unclaimed', inline: true },
                    { name: 'Category', value: categories[ticket.category]?.name || 'N/A', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Subtopic: ${subtopicLabel}` });

            if (logChannel) {
                await logChannel.send({
                    embeds: [logEmbed],
                    files: [{ attachment: transcriptPath, name: transcriptFilename }] 
                });
            }

            // --- DM TO USER ---
            try {
                const creator = await client.users.fetch(ticket.user);
                
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`✅ Your Ticket Has Been Closed`)
                    .setDescription(`Your ticket, **#${ticketChannel.name}**, has been closed by **${interaction.user.tag}**.`)
                    .addFields(
                        { name: 'Category', value: categories[ticket.category]?.name || 'N/A', inline: true },
                        { name: 'Subtopic', value: subtopicLabel, inline: true },
                        { name: 'Closure Reason', value: reason, inline: false }
                    )
                    .setFooter({ text: 'Thank you for reaching out to Adalea Support!' });
                
                await creator.send({
                    embeds: [dmEmbed],
                    files: [{ attachment: transcriptPath, name: transcriptFilename }] 
                });

            } catch (dmError) {
                console.warn(`[TICKET ${channelId}] Failed to DM creator (${ticket.user}). Error: ${dmError.message}`);
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
            await interaction.editReply({ content: 'A critical error occurred during closing/transcript process. The ticket remains open.' });
        }
    }
});// ===================
// PART 4
// ===================

// ===================
// TICKET CREATION FUNCTION
// ===================
async function createTicket(user, categoryKey, subtopicKey = null) {
    try {
        const category = getCategoryByKey(categoryKey);
        if (!category) return null;

        const subtopicLabel = subtopicKey ? getSubtopicLabelByKey(categoryKey, subtopicKey) : null;
        const ticketName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}`;

        const channel = await client.guilds.cache
            .get(IDs.guild)
            .channels.create({
                name: ticketName,
                type: 0, // GuildText
                parent: IDs.ticketCategory,
                permissionOverwrites: [
                    { id: IDs.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ...(category.role ? [{ id: category.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
                ]
            });

        tickets[channel.id] = {
            user: user.id,
            category: categoryKey,
            subtopic: subtopicKey,
            openTime: Date.now(),
            claimed: null,
            closed: false
        };

        saveTickets();

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`🎟️ Ticket Created`)
            .setDescription(`Hello <@${user.id}>! Your ticket has been created.`)
            .addFields(
                { name: 'Category', value: category.name, inline: true },
                { name: 'Subtopic', value: subtopicLabel || 'N/A', inline: true },
                { name: 'Support Team', value: category.role ? `<@&${category.role}>` : '@here', inline: false }
            )
            .setFooter({ text: 'Use the buttons below to manage your ticket.' });

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
            );

        await channel.send({ content: `${category.role ? `<@&${category.role}>` : '@here'} | <@${user.id}>`, embeds: [embed], components: [buttons] });

        return channel;
    } catch (error) {
        console.error('Error creating ticket:', error);
        return null;
    }
}

// ===================
// BUTTON INTERACTIONS
// ===================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const { customId, user, channel } = interaction;
    const ticket = tickets[channel.id];

    if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });

    // CLAIM BUTTON
    if (customId === 'claim_ticket') {
        if (!canClaimOrClose(interaction.member, user.id)) {
            return interaction.reply({ content: 'You do not have permission to claim this ticket.', ephemeral: true });
        }

        if (ticket.claimed) return interaction.reply({ content: `Already claimed by <@${ticket.claimed}>.`, ephemeral: true });

        ticket.claimed = user.id;
        saveTickets();

        const claimEmbed = new EmbedBuilder().setColor(0x32CD32).setDescription(`✅ <@${user.id}> has claimed this ticket.`);
        await interaction.reply({ embeds: [claimEmbed] });
        await channel.send({ embeds: [claimEmbed] });
    }

    // CLOSE BUTTON
    if (customId === 'close_ticket') {
        if (!canClaimOrClose(interaction.member, user.id)) {
            return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`close_modal_${channel.id}`)
            .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason')
            .setLabel('Reason for closing')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
    }
});

// ===================
// COMMAND REGISTRATION
// ===================
async function registerCommands() {
    const commands = [
        {
            name: 'ticket',
            description: 'Manage tickets',
            options: [
                { name: 'add', description: 'Add a user to ticket', type: 1, options: [{ name: 'user', description: 'User to add', type: 6, required: true }] },
                { name: 'remove', description: 'Remove a user from ticket', type: 1, options: [{ name: 'user', description: 'User to remove', type: 6, required: true }] },
                { name: 'move', description: 'Move ticket to another category', type: 1, options: [{ name: 'category_key', description: 'New category key', type: 3, required: true }] },
                { name: 'rename', description: 'Rename the ticket channel', type: 1, options: [{ name: 'name', description: 'New ticket name', type: 3, required: true }] }
            ]
        },
        { name: 'claim', description: 'Claim a ticket' },
        { name: 'close', description: 'Close a ticket' }
    ];

    await client.application.commands.set(commands);
    console.log('[INFO] Commands registered.');
}

// ===================
// CLIENT READY
// ===================
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    registerCommands();
    loadTickets();
});

// ===================
// CLIENT LOGIN
// ===================
client.login(process.env.TOKEN);